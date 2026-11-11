#!/usr/bin/env python3
"""
Safe one-time (and idempotent) Google Sheet label & account metadata cleanup
for Nebula Expense Tracker (`Transactions!A:L`).

Guarantees:
1. NEVER modifies `id` (A), `date` (B), `category` (C), `subCategory` (D),
   `amount` (E), `type` (F), `description` (G), `notes` (H), or `hash` (J).
2. Promotes legacy account labels (`bilt`, `manoj bofa`, `priyanka chase`,
   `bofa atmos`, `wells fargo`, `amazon store card`, `amazon-synchrony`) or
   Google Wallet card digits in `notes` into `meta.account` (Col L) BEFORE
   stripping those account labels from `labels` (Col I).
3. Promotes legacy bucket labels (`fixed`, `flexible`, `non-monthly`) into
   `spendingBucket` (Col K) on expense rows if Col K is blank.
4. Strips only redundant structural/system/account labels (`fixed`, `flexible`,
   `non-monthly`, `imported`, and known account names) from `labels` (Col I),
   preserving `refund`, `reimbursement`, `duplicate-verified`, unresolved
   `needs-review`, and every custom user tag.
"""

from __future__ import annotations

import argparse
import collections
import json
import re
import sys
from typing import Any, Dict, List, Optional, Tuple

ACCOUNT_LABELS: Dict[str, str] = {
    "bilt": "bilt",
    "manoj bofa": "manoj bofa",
    "priyanka chase": "priyanka chase",
    "bofa atmos": "bofa atmos",
    "wells fargo": "wells fargo",
    "amazon store card": "amazon store card",
    "amazon card": "amazon store card",
    "amazon-synchrony": "amazon-synchrony",
}

WALLET_DIGIT_ACCOUNTS: Dict[str, str] = {
    "7702": "bilt",
    "9666": "manoj bofa",
    "8885": "priyanka chase",
    "6823": "priyanka chase",
    "4692": "bofa atmos",
    "4359": "wells fargo",
    "4558": "wells fargo",
}

BUCKET_LABELS = ("fixed", "non-monthly", "flexible")

STRIP_LABELS = {
    "fixed",
    "flexible",
    "non-monthly",
    "income",
    "expense",
    "transfer",
    "imported",
    *ACCOUNT_LABELS.keys(),
}


def parse_labels(raw: str) -> List[str]:
    text = (raw or "").strip()
    if not text:
        return []
    try:
        parsed = json.loads(text)
        if isinstance(parsed, list):
            return [str(x).strip() for x in parsed if str(x).strip()]
    except Exception:
        pass
    return [part.strip() for part in text.split(",") if part.strip()]


def parse_meta(raw: str) -> Optional[Dict[str, Any]]:
    text = (raw or "").strip()
    if not text:
        return {}
    try:
        parsed = json.loads(text)
        if isinstance(parsed, dict):
            return parsed
    except Exception:
        return None
    return None


def infer_account_from_notes(notes: str) -> Optional[str]:
    if not notes:
        return None
    m = re.search(r"\((\d{4})\)", notes)
    if m and m.group(1) in WALLET_DIGIT_ACCOUNTS:
        return WALLET_DIGIT_ACCOUNTS[m.group(1)]
    lower = notes.lower()
    if "amazon store card" in lower or "synchrony" in lower:
        return "amazon store card"
    return None


def coalesce_column_writes(
    col_letter: str, updates: List[Tuple[int, str]]
) -> List[Dict[str, Any]]:
    """Coalesce contiguous row updates in a single column into compact write ops."""
    if not updates:
        return []
    updates_sorted = sorted(updates, key=lambda x: x[0])
    ops: List[Dict[str, Any]] = []
    start_row, prev_row = updates_sorted[0][0], updates_sorted[0][0]
    buf: List[List[str]] = [[updates_sorted[0][1]]]

    for row_num, val in updates_sorted[1:]:
        if row_num == prev_row + 1:
            buf.append([val])
            prev_row = row_num
        else:
            rng = (
                f"Transactions!{col_letter}{start_row}"
                if start_row == prev_row
                else f"Transactions!{col_letter}{start_row}:{col_letter}{prev_row}"
            )
            ops.append({"op": "write", "range": rng, "data": buf})
            start_row, prev_row = row_num, row_num
            buf = [[val]]

    rng = (
        f"Transactions!{col_letter}{start_row}"
        if start_row == prev_row
        else f"Transactions!{col_letter}{start_row}:{col_letter}{prev_row}"
    )
    ops.append({"op": "write", "range": rng, "data": buf})
    return ops


def plan_cleanup(grid: List[List[Any]]) -> Dict[str, Any]:
    if not grid:
        raise ValueError("Transactions grid is empty")

    header = [str(c).strip() for c in grid[0]]
    expected_prefix = [
        "id",
        "date",
        "category",
        "subCategory",
        "amount",
        "type",
        "description",
        "notes",
        "labels",
        "hash",
    ]
    if header[:10] != expected_prefix:
        raise ValueError(f"Unexpected Transactions header: {header}")

    col_i_updates: List[Tuple[int, str]] = []
    col_k_updates: List[Tuple[int, str]] = []
    col_l_updates: List[Tuple[int, str]] = []

    stripped_counts: collections.Counter[str] = collections.Counter()
    kept_counts: collections.Counter[str] = collections.Counter()
    promoted_accounts: collections.Counter[str] = collections.Counter()
    promoted_buckets: collections.Counter[str] = collections.Counter()
    skipped_unparseable_meta: List[int] = []
    sample_changes: List[Dict[str, Any]] = []

    total_data_rows = 0
    rows_touched = 0

    for idx, row in enumerate(grid[1:], start=2):
        if not row or not str(row[0] if len(row) > 0 else "").strip():
            continue
        total_data_rows += 1

        cat_low = str(row[2] if len(row) > 2 else "").strip().lower()
        tx_type = str(row[5] if len(row) > 5 else "").strip().lower()
        desc = str(row[6] if len(row) > 6 else "").strip()
        notes = str(row[7] if len(row) > 7 else "").strip()
        orig_labels_str = str(row[8] if len(row) > 8 else "").strip()
        orig_bucket_str = str(row[10] if len(row) > 10 else "").strip()
        orig_meta_str = str(row[11] if len(row) > 11 else "").strip()

        labels = parse_labels(orig_labels_str)
        lower_labels = [lbl.lower() for lbl in labels]

        meta = parse_meta(orig_meta_str)
        if meta is None:
            skipped_unparseable_meta.append(idx)
            continue

        is_refund = tx_type == "income" and (
            "refund" in lower_labels
            or "reimbursement" in lower_labels
            or cat_low in ("refund", "reimbursement")
        )

        # 1. Promote bucket to Col K if expense or refund and Col K is blank
        next_bucket = orig_bucket_str
        if (tx_type == "expense" or is_refund) and not next_bucket:
            for b in BUCKET_LABELS:
                if b in lower_labels:
                    next_bucket = b
                    promoted_buckets[b] += 1
                    break

        # 2. Promote account to meta.account (Col L) if missing and not explicitly cleared by user
        next_meta = dict(meta)
        raw_user_edited = next_meta.get("userEdited")
        user_edited_fields = raw_user_edited if isinstance(raw_user_edited, list) else []
        existing_acc = str(next_meta.get("account") or "").strip()
        if not existing_acc and "account" not in user_edited_fields:
            promoted_acc: Optional[str] = None
            for lbl_low in lower_labels:
                if lbl_low in ACCOUNT_LABELS:
                    promoted_acc = ACCOUNT_LABELS[lbl_low]
                    break
            if not promoted_acc:
                promoted_acc = infer_account_from_notes(notes)
            if promoted_acc:
                next_meta["account"] = promoted_acc
                promoted_accounts[promoted_acc] += 1

        # 3. Clean labels (Col I)
        review_resolved = bool(
            isinstance(next_meta.get("review"), dict)
            and next_meta["review"].get("resolvedAt")
        )
        next_labels: List[str] = []
        seen_labels = set()
        for lbl in labels:
            low = lbl.lower()
            if low in STRIP_LABELS or (low == "needs-review" and review_resolved):
                stripped_counts[low] += 1
                continue
            if low not in seen_labels:
                seen_labels.add(low)
                next_labels.append(low)
                kept_counts[low] += 1

        next_labels_json = json.dumps(next_labels, separators=(",", ":"))
        # Normalize comparison so e.g. '[]' vs '' only writes if truly different
        labels_changed = parse_labels(orig_labels_str) != next_labels or (
            orig_labels_str != next_labels_json and bool(orig_labels_str or next_labels)
        )
        bucket_changed = next_bucket != orig_bucket_str
        next_meta_json = (
            json.dumps(next_meta, separators=(",", ":"), ensure_ascii=False)
            if next_meta
            else ""
        )
        meta_changed = next_meta != meta

        if labels_changed or bucket_changed or meta_changed:
            rows_touched += 1
            if len(sample_changes) < 12:
                sample_changes.append(
                    {
                        "row": idx,
                        "description": desc[:40],
                        "oldLabels": labels,
                        "newLabels": next_labels,
                        "oldAccount": meta.get("account"),
                        "newAccount": next_meta.get("account"),
                        "oldBucket": orig_bucket_str,
                        "newBucket": next_bucket,
                    }
                )

        if labels_changed:
            col_i_updates.append((idx, next_labels_json))
        if bucket_changed:
            col_k_updates.append((idx, next_bucket))
        if meta_changed:
            col_l_updates.append((idx, next_meta_json))

    batch_ops: List[Dict[str, Any]] = []
    batch_ops.extend(coalesce_column_writes("I", col_i_updates))
    batch_ops.extend(coalesce_column_writes("K", col_k_updates))
    batch_ops.extend(coalesce_column_writes("L", col_l_updates))

    return {
        "summary": {
            "totalDataRows": total_data_rows,
            "rowsTouched": rows_touched,
            "colICellsUpdated": len(col_i_updates),
            "colKCellsUpdated": len(col_k_updates),
            "colLCellsUpdated": len(col_l_updates),
            "batchWriteRanges": len(batch_ops),
            "strippedLabelCounts": dict(stripped_counts.most_common()),
            "keptLabelCounts": dict(kept_counts.most_common()),
            "promotedAccountCounts": dict(promoted_accounts.most_common()),
            "promotedBucketCounts": dict(promoted_buckets.most_common()),
            "skippedUnparseableMetaRows": skipped_unparseable_meta,
        },
        "sampleChanges": sample_changes,
        "batchOps": batch_ops,
    }


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Clean up redundant system/bucket/account labels in Nebula Expense Google Sheet."
    )
    parser.add_argument(
        "--transactions-json",
        required=True,
        help="Path to 2D JSON grid from `gsheets readonly read <ID> 'Transactions!A1:L2000' --json`",
    )
    parser.add_argument(
        "--batch-out",
        help="Output path for `gsheets mutate batch -f <path>` JSON file",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print cleanup summary and sample row diffs without writing batch file",
    )
    args = parser.parse_args()

    with open(args.transactions_json, "r", encoding="utf-8") as fh:
        raw_payload = json.load(fh)

    grid = (
        raw_payload.get("values")
        if isinstance(raw_payload, dict) and "values" in raw_payload
        else raw_payload
    )
    if not isinstance(grid, list):
        print("Error: Expected a 2D JSON array of sheet rows", file=sys.stderr)
        return 1

    plan = plan_cleanup(grid)

    if args.batch_out and not args.dry_run:
        with open(args.batch_out, "w", encoding="utf-8") as out_fh:
            json.dump(plan["batchOps"], out_fh, indent=2, ensure_ascii=False)

    output = {
        "dryRun": bool(args.dry_run or not args.batch_out),
        "summary": plan["summary"],
        "sampleChanges": plan["sampleChanges"],
    }
    print(json.dumps(output, indent=2, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
