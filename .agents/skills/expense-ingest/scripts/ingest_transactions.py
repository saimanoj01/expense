#!/usr/bin/env python3
"""
Transaction Ingestion Script (`expense-ingest`)

Ingests transactions from Bilt (Plaid JSON/sync), Amazon Store Card
(order/shipment emails, Synchrony statements), CSVs, or natural language
into the Nebula Expense Tracker with automatic deduplication, cross-source
enrichment, multi-item splitting, and 3-stage categorization.

Usage:
  python3 .agents/skills/expense-ingest/scripts/ingest_transactions.py [options]

Options:
  --input, -i <file|->        JSON payload (IngestRequest, RawTransactionInput[], or Plaid {added,modified,removed})
  --project, -p <id>          Target project ID (default: "personal-finances")
  --source, -s <sourceId>     Source identifier, e.g. "bilt-plaid", "amazon-email" (default: "cli-agent")
  --mode, -m <mode>           "automated" (default) or "interactive"
  --spreadsheet-id <id>       Google Spreadsheet ID (or GOOGLE_SHEETS_SPREADSHEET_ID env)
  --access-token <token>      Google OAuth2 access token (or GOOGLE_ACCESS_TOKEN env)
  --service-account <file>    Google Service Account JSON path (or GOOGLE_APPLICATION_CREDENTIALS / GOOGLE_SERVICE_ACCOUNT_JSON env)
  --state-file <file>         Local JSON file persisting { transactions, categories, ingestState }
  --sync-start <YYYY-MM-DD>   Optional cutoff date watermark
  --dry-run                   Preview IngestPlan without mutating state
  --skip-llm                  Skip Gemini LLM calls (use Stage 1 History + Stage 2 Keywords)
  --format, -f <json|summary> Output format: "json" or "summary" (default: "json")
  --json                      Output as JSON (alias for --format json)
  --help, -h                  Show this help message
"""

import argparse
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import subprocess
import sys


# ─── Payload Normalization ────────────────────────────────────────────────────

def map_plaid_tx(tx):
    """Map a single Plaid transaction object into RawTransactionInput."""
    # Prefer `authorized_date` (actual purchase date) when available, falling back to posted `date`.
    # Same-source reconciliation uses `transaction_id` / `pending_transaction_id` so pending->posted date shifts update in place.
    pfc = tx.get("personal_finance_category") or {}
    raw_cat_list = tx.get("category")
    category_hint = (
        pfc.get("detailed")
        or pfc.get("primary")
        or (" ".join(raw_cat_list) if isinstance(raw_cat_list, list) else None)
    )

    mapped = {
        "externalId": tx.get("transaction_id") or tx.get("externalId"),
        "op": "upsert",
        "date": tx.get("authorized_date") or tx.get("date"),
        "description": (
            tx.get("name")
            or tx.get("original_description")
            or tx.get("merchant_name")
            or "Plaid Transaction"
        ),
        "amount": float(tx.get("amount") or 0),
        "metadataRichness": "medium",
    }
    if tx.get("pending_transaction_id"):
        mapped["supersedesExternalId"] = tx["pending_transaction_id"]
    if tx.get("merchant_name"):
        mapped["merchant"] = tx["merchant_name"]
    if tx.get("account"):
        mapped["account"] = tx["account"]
    if category_hint:
        mapped["categoryHint"] = category_hint
    return mapped


def normalize_payload(parsed, options):
    """
    Normalize flexible input formats into a canonical IngestRequest dict:
    1. Array of RawTransactionInput[]
    2. Plaid /transactions/sync response ({ added: [], modified: [], removed: [] })
    3. Full IngestRequest object ({ projectId, sourceId, triggerMode, transactions, options })
    """
    if isinstance(parsed, list):
        req_opts = {
            "dryRun": bool(options.dry_run),
            "skipLlm": bool(options.skip_llm),
        }
        if options.sync_start:
            req_opts["syncStartDate"] = options.sync_start
        return {
            "projectId": options.project,
            "sourceId": options.source,
            "triggerMode": options.mode,
            "transactions": parsed,
            "options": req_opts,
        }

    if isinstance(parsed, dict) and (
        isinstance(parsed.get("added"), list)
        or isinstance(parsed.get("modified"), list)
        or isinstance(parsed.get("removed"), list)
    ):
        added_mapped = [map_plaid_tx(tx) for tx in (parsed.get("added") or [])]
        modified_mapped = [map_plaid_tx(tx) for tx in (parsed.get("modified") or [])]
        superseded_pending_ids = {
            t["supersedesExternalId"]
            for t in (added_mapped + modified_mapped)
            if t.get("supersedesExternalId")
        }

        today_iso = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        removed_mapped = []
        for r in parsed.get("removed") or []:
            rem_id = r.get("transaction_id") or r.get("externalId")
            if rem_id and rem_id in superseded_pending_ids:
                continue
            removed_mapped.append({
                "externalId": rem_id,
                "op": "remove",
                "date": r.get("date") or today_iso,
                "description": r.get("name") or "Removed Transaction",
                "amount": float(r.get("amount") or 0),
            })

        base_opts = dict(parsed.get("options") or {})
        base_opts["dryRun"] = bool(options.dry_run or base_opts.get("dryRun"))
        base_opts["skipLlm"] = bool(options.skip_llm or base_opts.get("skipLlm"))
        sync_start = options.sync_start or base_opts.get("syncStartDate")
        if sync_start:
            base_opts["syncStartDate"] = sync_start

        resolved_source = parsed.get("sourceId") or (
            "bilt-plaid" if options.source == "cli-agent" else options.source
        )
        return {
            "projectId": parsed.get("projectId") or options.project,
            "sourceId": resolved_source,
            "triggerMode": parsed.get("triggerMode") or options.mode,
            "transactions": added_mapped + modified_mapped + removed_mapped,
            "options": base_opts,
        }

    if isinstance(parsed, dict):
        base_opts = dict(parsed.get("options") or {})
        base_opts["dryRun"] = bool(options.dry_run or base_opts.get("dryRun"))
        base_opts["skipLlm"] = bool(options.skip_llm or base_opts.get("skipLlm"))
        sync_start = options.sync_start or base_opts.get("syncStartDate")
        if sync_start:
            base_opts["syncStartDate"] = sync_start

        return {
            "projectId": parsed.get("projectId") or options.project,
            "sourceId": parsed.get("sourceId") or options.source,
            "triggerMode": parsed.get("triggerMode") or options.mode,
            "transactions": parsed.get("transactions") or [],
            "options": base_opts,
        }

    raise ValueError("Unsupported JSON payload format for transaction ingestion.")


# ─── Ingestion Bridge (Single Source of Truth TypeScript Engine) ──────────────

NODE_RUNNER_SCRIPT = r"""
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import module from 'node:module';

if (typeof module.registerHooks === 'function') {
  module.registerHooks({
    resolve(specifier, context, nextResolve) {
      if (
        (specifier.startsWith('./') || specifier.startsWith('../')) &&
        !path.extname(specifier) &&
        context.parentURL
      ) {
        const parentPath = fileURLToPath(context.parentURL);
        const parentDir = path.dirname(parentPath);
        for (const ext of ['.ts', '.tsx', '.mjs', '.js']) {
          const candidate = path.resolve(parentDir, `${specifier}${ext}`);
          if (fs.existsSync(candidate)) {
            return nextResolve(pathToFileURL(candidate).href, context);
          }
        }
      }
      return nextResolve(specifier, context);
    },
  });
}

const repoRoot = process.env.EXPENSE_REPO_ROOT;
const { LocalStorageAdapter, GoogleSheetsAdapter, DEFAULT_CATEGORIES } = await import(
  pathToFileURL(path.join(repoRoot, 'src/services/storage.ts')).href
);
const { ingestTransactions } = await import(
  pathToFileURL(path.join(repoRoot, 'src/services/ingestion/transactionIngestService.ts')).href
);

async function mintServiceAccountAccessToken(saCreds) {
  const nowSec = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const claimSet = Buffer.from(
    JSON.stringify({
      iss: saCreds.client_email,
      scope: 'https://www.googleapis.com/auth/spreadsheets',
      aud: saCreds.token_uri || 'https://oauth2.googleapis.com/token',
      iat: nowSec,
      exp: nowSec + 3600,
    })
  ).toString('base64url');

  const signingInput = `${header}.${claimSet}`;
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(signingInput);
  signer.end();
  const signature = signer.sign(saCreds.private_key, 'base64url');
  const assertion = `${signingInput}.${signature}`;

  const tokenUri = saCreds.token_uri || 'https://oauth2.googleapis.com/token';
  const res = await fetch(tokenUri, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Failed to mint Service Account token (${res.status}): ${errText}`);
  }
  const data = await res.json();
  return data.access_token;
}

async function resolveGoogleAccessToken(cfg) {
  if (cfg.accessToken) return cfg.accessToken;
  const rawSaJson =
    process.env.GOOGLE_SERVICE_ACCOUNT_JSON ||
    (cfg.serviceAccountFile && fs.existsSync(path.resolve(cfg.serviceAccountFile))
      ? fs.readFileSync(path.resolve(cfg.serviceAccountFile), 'utf8')
      : null);
  if (rawSaJson) {
    const saCreds = JSON.parse(rawSaJson);
    return await mintServiceAccountAccessToken(saCreds);
  }
  return null;
}

const payload = JSON.parse(fs.readFileSync(0, 'utf8'));
const { request, config } = payload;
const projectId = request.projectId;

let adapter;
if (config.spreadsheetId) {
  const token = await resolveGoogleAccessToken(config);
  if (!token) {
    throw new Error(
      '`--spreadsheet-id` was provided without credentials. Supply `--access-token` / `GOOGLE_ACCESS_TOKEN` or `--service-account` / `GOOGLE_SERVICE_ACCOUNT_JSON`.'
    );
  }
  globalThis.localStorage.setItem(
    'expense_google_projects',
    JSON.stringify([{ id: projectId, name: projectId, spreadsheetId: config.spreadsheetId }])
  );
  adapter = new GoogleSheetsAdapter(() => token);
} else {
  adapter = new LocalStorageAdapter();
  if (config.stateFile) {
    const stateFilePath = path.resolve(config.stateFile);
    if (fs.existsSync(stateFilePath)) {
      const stateData = JSON.parse(fs.readFileSync(stateFilePath, 'utf8'));
      if (Array.isArray(stateData.transactions)) {
        globalThis.localStorage.setItem(
          `expense_txs_${projectId}`,
          JSON.stringify(stateData.transactions)
        );
      }
      if (Array.isArray(stateData.categories)) {
        globalThis.localStorage.setItem(
          `expense_categories_${projectId}`,
          JSON.stringify(stateData.categories)
        );
      }
      if (stateData.ingestState) {
        globalThis.localStorage.setItem(
          `expense_ingest_state_${projectId}`,
          JSON.stringify(stateData.ingestState)
        );
      }
    } else {
      globalThis.localStorage.setItem(`expense_txs_${projectId}`, '[]');
      globalThis.localStorage.setItem(
        `expense_categories_${projectId}`,
        JSON.stringify(DEFAULT_CATEGORIES)
      );
    }
  }
}

const response = await ingestTransactions(request, adapter);

if (config.stateFile && !config.spreadsheetId && !response.dryRun) {
  const stateFilePath = path.resolve(config.stateFile);
  const updatedTransactions = await adapter.getTransactions(projectId);
  const updatedCategories = await adapter.getCategories(projectId);
  const updatedIngestState = await adapter.getIngestState(projectId);
  fs.writeFileSync(
    stateFilePath,
    JSON.stringify(
      {
        projectId,
        updatedAt: new Date().toISOString(),
        transactions: updatedTransactions,
        categories: updatedCategories,
        ingestState: updatedIngestState,
      },
      null,
      2
    ),
    'utf8'
  );
}

process.stdout.write(JSON.stringify(response));
"""


def run_ingestion_engine(repo_root, request, options):
    """Execute the TypeScript ingestion engine with the normalized request."""
    bridge_input = {
        "request": request,
        "config": {
            "stateFile": options.state_file,
            "spreadsheetId": options.spreadsheet_id,
            "accessToken": options.access_token,
            "serviceAccountFile": options.service_account,
        },
    }
    env = dict(os.environ)
    env["EXPENSE_REPO_ROOT"] = str(repo_root)

    proc = subprocess.run(
        ["node", "--input-type=module", "-e", NODE_RUNNER_SCRIPT],
        input=json.dumps(bridge_input),
        text=True,
        capture_output=True,
        cwd=str(repo_root),
        env=env,
    )
    if proc.returncode != 0:
        err_msg = (proc.stderr or proc.stdout or "Unknown ingestion error").strip()
        raise RuntimeError(err_msg)

    return json.loads(proc.stdout)


# ─── Output Formatting ───────────────────────────────────────────────────────

def format_summary(response):
    """Render a clean Markdown summary of the ingestion run."""
    s = response.get("summary") or {}
    dry_suffix = " | DRY RUN" if response.get("dryRun") else ""
    lines = [
        f'# Ingestion Summary ({response.get("sourceId")} | {response.get("triggerMode")}{dry_suffix})',
        f'- Total Input: {s.get("totalInput", 0)}',
        f'- Inserted (Clean): {s.get("inserted", 0)}',
        f'- Inserted (Needs Review): {s.get("insertedFlagged", 0)}',
        f'- Updated in Place: {s.get("updatedFromSource", 0)}',
        f'- Cross-Source Enriched: {s.get("mergedEnriched", 0)}',
        f'- Tip-Adjusted: {s.get("mergedTipAdjusted", 0)}',
        f'- Removed (Voided): {s.get("removed", 0)}',
        f'- Skipped (Exact Duplicate): {s.get("skippedDuplicate", 0)}',
        f'- Skipped (Tombstoned): {s.get("skippedTombstoned", 0)}',
        f'- Skipped (Before Cutoff): {s.get("skippedBeforeCutoff", 0)}',
    ]

    flagged = response.get("flaggedTransactions") or []
    if flagged:
        lines.append("")
        lines.append(f"## Flagged for Review ({len(flagged)})")
        for tx in flagged:
            sub = f'/{tx["subCategory"]}' if tx.get("subCategory") else ""
            rev = (tx.get("meta") or {}).get("review") or {}
            reason = rev.get("reason", "unknown")
            detail = rev.get("detail", "")
            amt = float(tx.get("amount") or 0)
            lines.append(
                f'- [{tx.get("date")}] {tx.get("description")} (${amt:.2f}) -> '
                f'{tx.get("category")}{sub} | Reason: {reason} ({detail})'
            )

    return "\n".join(lines)


# ─── Main ─────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="Ingest transactions into the Nebula Expense Tracker."
    )
    parser.add_argument(
        "--input", "-i", default="-", help="JSON input file or '-' for stdin (default: '-')"
    )
    parser.add_argument(
        "--project", "-p", default="personal-finances", help="Project ID (default: 'personal-finances')"
    )
    parser.add_argument(
        "--source", "-s", default="cli-agent", help="Source ID, e.g. 'bilt-plaid', 'amazon-email'"
    )
    parser.add_argument(
        "--mode",
        "-m",
        default="automated",
        choices=["automated", "interactive"],
        help="Ingestion trigger mode (default: 'automated')",
    )
    parser.add_argument(
        "--spreadsheet-id",
        default=os.environ.get("GOOGLE_SHEETS_SPREADSHEET_ID"),
        help="Google Spreadsheet ID (or GOOGLE_SHEETS_SPREADSHEET_ID env)",
    )
    parser.add_argument(
        "--access-token",
        default=os.environ.get("GOOGLE_ACCESS_TOKEN"),
        help="Google OAuth2 access token (or GOOGLE_ACCESS_TOKEN env)",
    )
    parser.add_argument(
        "--service-account",
        default=os.environ.get("GOOGLE_APPLICATION_CREDENTIALS"),
        help="Google Service Account JSON path (or GOOGLE_APPLICATION_CREDENTIALS env)",
    )
    parser.add_argument(
        "--state-file",
        default=os.environ.get("EXPENSE_STATE_FILE"),
        help="Local JSON state file to load & persist ledger data",
    )
    parser.add_argument(
        "--sync-start",
        default=None,
        help="Ignore transactions strictly older than cutoff date (YYYY-MM-DD)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Preview ingestion plan without writing to storage",
    )
    parser.add_argument(
        "--skip-llm",
        action="store_true",
        help="Use History + Keyword rules only (no Gemini API call)",
    )
    parser.add_argument(
        "--format",
        "-f",
        default="json",
        choices=["json", "summary"],
        help="Output format: 'json' or 'summary' (default: 'json')",
    )
    parser.add_argument(
        "--json",
        action="store_true",
        dest="output_json",
        help="Output JSON (alias for --format json)",
    )

    options = parser.parse_args()
    repo_root = Path(__file__).resolve().parents[4]

    try:
        if options.input == "-":
            raw_input_text = sys.stdin.read()
        else:
            raw_input_text = Path(options.input).resolve().read_text(encoding="utf-8")

        if not raw_input_text.strip():
            raise ValueError("Empty input provided to ingest_transactions.py")

        parsed_input = json.loads(raw_input_text)
        request = normalize_payload(parsed_input, options)
        is_dry_run = bool((request.get("options") or {}).get("dryRun"))

        if not is_dry_run and not options.spreadsheet_id and not options.state_file:
            raise ValueError(
                "Non-dry-run CLI execution requires a persistent storage target: "
                "pass `--spreadsheet-id <id>` (with `--access-token` or `--service-account`) "
                "for Google Sheets, `--state-file <path>` for a local JSON ledger file, "
                "or `--dry-run` to preview only."
            )

        print("📥 Ingesting transactions...", file=sys.stderr)
        print(
            f'   Project: {request["projectId"]} | Source: {request["sourceId"]} | '
            f'Mode: {request["triggerMode"]} | Dry Run: {is_dry_run}',
            file=sys.stderr,
        )

        response = run_ingestion_engine(repo_root, request, options)

        if options.format == "summary" and not options.output_json:
            print(format_summary(response))
        else:
            print(json.dumps(response, indent=2))

        print("\n✅ Done.", file=sys.stderr)

    except Exception as exc:
        print(f"Error in ingest_transactions.py: {exc}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
