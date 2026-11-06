#!/usr/bin/env node
/**
 * Nebula Expense Tracker — Transaction Ingestion CLI (`expense-ingest`)
 *
 * Compatible with Node.js 24+ native TypeScript execution.
 * Supports:
 *   --input <file|->        JSON payload (IngestRequest, RawTransactionInput[], or Plaid {added,modified,removed})
 *   --project <id>          Target project ID (default: "personal-finances")
 *   --source <sourceId>     Source identifier (default: "cli-agent")
 *   --mode <mode>           "automated" (default) or "interactive"
 *   --state-file <file>     Optional JSON file persisting { transactions, categories, ingestState }
 *   --sync-start <date>     Optional YYYY-MM-DD cutoff watermark
 *   --dry-run               Preview IngestPlan without mutating state
 *   --skip-llm              Skip Gemini LLM calls (use Stage 1 History + Stage 2 Keywords)
 *   --format <json|summary> Output format (default: "json")
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import module from 'node:module';

// Register a lightweight synchronous resolver hook so Node 24 resolves extensionless
// TypeScript imports inside `src/` (e.g. `from '../storage'` -> `../storage.ts`).
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

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '../../../..');

const storageModuleUrl = pathToFileURL(
  path.join(repoRoot, 'src/services/storage.ts')
).href;
const ingestModuleUrl = pathToFileURL(
  path.join(repoRoot, 'src/services/ingestion/transactionIngestService.ts')
).href;

const { LocalStorageAdapter, GoogleSheetsAdapter, DEFAULT_CATEGORIES } = await import(
  storageModuleUrl
);
const { ingestTransactions } = await import(ingestModuleUrl);

function parseArgs(argv) {
  const args = {
    input: '-',
    project: 'personal-finances',
    source: 'cli-agent',
    mode: 'automated',
    stateFile: process.env.EXPENSE_STATE_FILE || null,
    spreadsheetId: process.env.GOOGLE_SHEETS_SPREADSHEET_ID || null,
    accessToken: process.env.GOOGLE_ACCESS_TOKEN || null,
    serviceAccountFile: process.env.GOOGLE_APPLICATION_CREDENTIALS || null,
    syncStart: undefined,
    dryRun: false,
    skipLlm: false,
    format: 'json',
  };

  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--input' || arg === '-i') {
      args.input = argv[++i];
    } else if (arg === '--project' || arg === '-p') {
      args.project = argv[++i];
    } else if (arg === '--source' || arg === '-s') {
      args.source = argv[++i];
    } else if (arg === '--mode' || arg === '-m') {
      args.mode = argv[++i];
    } else if (arg === '--state-file') {
      args.stateFile = argv[++i];
    } else if (arg === '--spreadsheet-id') {
      args.spreadsheetId = argv[++i];
    } else if (arg === '--access-token') {
      args.accessToken = argv[++i];
    } else if (arg === '--service-account') {
      args.serviceAccountFile = argv[++i];
    } else if (arg === '--sync-start') {
      args.syncStart = argv[++i];
    } else if (arg === '--dry-run') {
      args.dryRun = true;
    } else if (arg === '--skip-llm') {
      args.skipLlm = true;
    } else if (arg === '--format' || arg === '-f') {
      args.format = argv[++i];
    } else if (arg === '--help' || arg === '-h') {
      console.log(`Usage: node ingest_transactions.mjs [options]
Options:
  --input, -i <file|->          JSON input file or '-' for stdin (default: '-')
  --project, -p <id>            Project ID (default: 'personal-finances')
  --source, -s <sourceId>       Source ID, e.g. 'bilt-plaid', 'amazon-email' (default: 'cli-agent')
  --mode, -m <mode>             'automated' or 'interactive' (default: 'automated')
  --spreadsheet-id <id>         Google Spreadsheet ID (or GOOGLE_SHEETS_SPREADSHEET_ID env)
  --access-token <token>        Google OAuth2 access token (or GOOGLE_ACCESS_TOKEN env)
  --service-account <file>      Google Service Account JSON path (or GOOGLE_APPLICATION_CREDENTIALS / GOOGLE_SERVICE_ACCOUNT_JSON env)
  --state-file <file>           Local JSON state file to load & persist ledger data
  --sync-start <YYYY-MM-DD>     Ignore transactions strictly older than cutoff date
  --dry-run                     Preview ingestion plan without writing to storage
  --skip-llm                    Use History + Keyword rules only (no Gemini API call)
  --format, -f <json|summary>   Output format (default: 'json')`);
      process.exit(0);
    }
  }
  return args;
}

/**
 * Mints a short-lived Google OAuth2 access token from a Service Account JSON key
 * using Node's built-in `node:crypto` (zero external dependencies).
 */
async function mintServiceAccountAccessToken(saCreds) {
  const nowSec = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString(
    'base64url'
  );
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

async function resolveGoogleAccessToken(cliArgs) {
  if (cliArgs.accessToken) return cliArgs.accessToken;
  const rawSaJson =
    process.env.GOOGLE_SERVICE_ACCOUNT_JSON ||
    (cliArgs.serviceAccountFile && fs.existsSync(path.resolve(cliArgs.serviceAccountFile))
      ? fs.readFileSync(path.resolve(cliArgs.serviceAccountFile), 'utf8')
      : null);
  if (rawSaJson) {
    const saCreds = JSON.parse(rawSaJson);
    return await mintServiceAccountAccessToken(saCreds);
  }
  return null;
}

/**
 * Normalizes flexible input formats:
 * 1. Full `IngestRequest` object (`{ projectId, sourceId, triggerMode, transactions, options }`)
 * 2. Array of `RawTransactionInput[]`
 * 3. Plaid `/transactions/sync` response (`{ added: [], modified: [], removed: [] }`)
 */
function normalizePayload(parsed, cliArgs) {
  if (Array.isArray(parsed)) {
    return {
      projectId: cliArgs.project,
      sourceId: cliArgs.source,
      triggerMode: cliArgs.mode,
      transactions: parsed,
      options: {
        dryRun: cliArgs.dryRun,
        skipLlm: cliArgs.skipLlm,
        syncStartDate: cliArgs.syncStart,
      },
    };
  }

  // Plaid /transactions/sync payload detection
  if (
    parsed &&
    typeof parsed === 'object' &&
    (Array.isArray(parsed.added) ||
      Array.isArray(parsed.modified) ||
      Array.isArray(parsed.removed))
  ) {
    // Note: Prefer `authorized_date` (actual purchase date) when available, falling back to posted `date`.
    // Same-source reconciliation uses `transaction_id` / `pending_transaction_id` so pending->posted date shifts update in place.
    const mapPlaidTx = tx => ({
      externalId: tx.transaction_id || tx.externalId,
      supersedesExternalId: tx.pending_transaction_id || undefined,
      op: 'upsert',
      date: tx.authorized_date || tx.date,
      description:
        tx.name || tx.original_description || tx.merchant_name || 'Plaid Transaction',
      merchant: tx.merchant_name || undefined,
      amount: Number(tx.amount),
      account: tx.account || undefined,
      categoryHint:
        tx.personal_finance_category?.detailed ||
        tx.personal_finance_category?.primary ||
        (Array.isArray(tx.category) ? tx.category.join(' ') : undefined),
      metadataRichness: 'medium',
    });

    const addedMapped = (parsed.added || []).map(mapPlaidTx);
    const modifiedMapped = (parsed.modified || []).map(mapPlaidTx);
    const supersededPendingIds = new Set(
      [...addedMapped, ...modifiedMapped]
        .map(t => t.supersedesExternalId)
        .filter(Boolean)
    );

    const removedMapped = (parsed.removed || [])
      .filter(r => {
        const remId = r.transaction_id || r.externalId;
        return !remId || !supersededPendingIds.has(remId);
      })
      .map(r => ({
        externalId: r.transaction_id || r.externalId,
        op: 'remove',
        date: r.date || new Date().toISOString().slice(0, 10),
        description: r.name || 'Removed Transaction',
        amount: Number(r.amount || 0),
      }));

    const transactions = [...addedMapped, ...modifiedMapped, ...removedMapped];

    return {
      projectId: parsed.projectId || cliArgs.project,
      sourceId:
        parsed.sourceId ||
        (cliArgs.source === 'cli-agent' ? 'bilt-plaid' : cliArgs.source),
      triggerMode: parsed.triggerMode || cliArgs.mode,
      transactions,
      options: {
        ...(parsed.options || {}),
        dryRun: cliArgs.dryRun || Boolean(parsed.options?.dryRun),
        skipLlm: cliArgs.skipLlm || Boolean(parsed.options?.skipLlm),
        syncStartDate: cliArgs.syncStart || parsed.options?.syncStartDate,
      },
    };
  }

  // Standard IngestRequest object
  return {
    projectId: parsed.projectId || cliArgs.project,
    sourceId: parsed.sourceId || cliArgs.source,
    triggerMode: parsed.triggerMode || cliArgs.mode,
    transactions: parsed.transactions || [],
    options: {
      ...(parsed.options || {}),
      dryRun: cliArgs.dryRun || Boolean(parsed.options?.dryRun),
      skipLlm: cliArgs.skipLlm || Boolean(parsed.options?.skipLlm),
      syncStartDate: cliArgs.syncStart || parsed.options?.syncStartDate,
    },
  };
}

async function main() {
  const cliArgs = parseArgs(process.argv);

  let rawInputText = '';
  if (cliArgs.input === '-') {
    rawInputText = fs.readFileSync(0, 'utf8');
  } else {
    rawInputText = fs.readFileSync(path.resolve(cliArgs.input), 'utf8');
  }

  if (!rawInputText.trim()) {
    throw new Error('Empty input provided to ingest_transactions.mjs');
  }

  const parsedInput = JSON.parse(rawInputText);
  const request = normalizePayload(parsedInput, cliArgs);
  const projectId = request.projectId;
  const isDryRun = Boolean(request.options?.dryRun);

  if (!isDryRun && !cliArgs.spreadsheetId && !cliArgs.stateFile) {
    throw new Error(
      'Non-dry-run CLI execution requires a persistent storage target: pass `--spreadsheet-id <id>` (with `--access-token` or `--service-account`) for Google Sheets, `--state-file <path>` for a local JSON ledger file, or `--dry-run` to preview only.'
    );
  }

  let adapter;
  if (cliArgs.spreadsheetId) {
    const token = await resolveGoogleAccessToken(cliArgs);
    if (!token) {
      throw new Error(
        '`--spreadsheet-id` was provided without credentials. Supply `--access-token` / `GOOGLE_ACCESS_TOKEN` or `--service-account` / `GOOGLE_SERVICE_ACCOUNT_JSON`.'
      );
    }
    globalThis.localStorage.setItem(
      'expense_google_projects',
      JSON.stringify([
        {
          id: projectId,
          name: projectId,
          spreadsheetId: cliArgs.spreadsheetId,
        },
      ])
    );
    adapter = new GoogleSheetsAdapter(() => token);
  } else {
    adapter = new LocalStorageAdapter();
    if (cliArgs.stateFile) {
      const stateFilePath = path.resolve(cliArgs.stateFile);
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

  // Persist updated state back to `--state-file` if using local state file and not a dry run
  if (cliArgs.stateFile && !cliArgs.spreadsheetId && !response.dryRun) {
    const stateFilePath = path.resolve(cliArgs.stateFile);
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

  if (cliArgs.format === 'summary') {
    const s = response.summary;
    console.log(
      `# Ingestion Summary (${response.sourceId} | ${response.triggerMode}${response.dryRun ? ' | DRY RUN' : ''})`
    );
    console.log(`- Total Input: ${s.totalInput}`);
    console.log(`- Inserted (Clean): ${s.inserted}`);
    console.log(`- Inserted (Needs Review): ${s.insertedFlagged}`);
    console.log(`- Updated in Place: ${s.updatedFromSource}`);
    console.log(`- Cross-Source Enriched: ${s.mergedEnriched}`);
    console.log(`- Tip-Adjusted: ${s.mergedTipAdjusted}`);
    console.log(`- Removed (Voided): ${s.removed}`);
    console.log(`- Skipped (Exact Duplicate): ${s.skippedDuplicate}`);
    console.log(`- Skipped (Tombstoned): ${s.skippedTombstoned}`);
    console.log(`- Skipped (Before Cutoff): ${s.skippedBeforeCutoff}`);
    if (response.flaggedTransactions.length > 0) {
      console.log(`\n## Flagged for Review (${response.flaggedTransactions.length})`);
      for (const tx of response.flaggedTransactions) {
        console.log(
          `- [${tx.date}] ${tx.description} ($${tx.amount.toFixed(2)}) -> ${tx.category}${tx.subCategory ? '/' + tx.subCategory : ''} | Reason: ${tx.meta?.review?.reason} (${tx.meta?.review?.detail || ''})`
        );
      }
    }
  } else {
    console.log(JSON.stringify(response, null, 2));
  }
}

main().catch(err => {
  console.error('Error in ingest_transactions.mjs:', err.message || err);
  process.exit(1);
});
