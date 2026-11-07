#!/usr/bin/env python3
"""
Expense Context Export Script (`export_expense_context.py`)

Extracts expense data from the Nebula Expense Tracker (live Google Sheets TSV export,
JSON ledger state file, or local `src/services/storage.ts` seed data) and outputs a
token-efficient Markdown or JSON summary.

Usage:
  python3 .agents/skills/expense-qna/scripts/export_expense_context.py [options]

Options:
  --tsv <path>       Read transactions from a Google Sheets TSV export (`Transactions` tab)
  --state-file <p>   Read transactions/categories/budgets from a JSON ledger state file
  --project <id>     Project ID to export (default: personal-finances)
  --month <YYYY-MM>  Specific month to focus on (default: current month)
  --scope <mode>     Data scope: "month", "quarter", "ytd", "all" (default: "quarter")
  --redact           Redact merchant/description names for privacy
  --json             Output as JSON instead of Markdown
"""

import argparse
import csv
import json
import os
import re
import sys
from collections import defaultdict
from datetime import datetime, timezone

EMBEDDED_DEFAULT_CATEGORIES = [
    {"id": "groceries", "name": "Groceries", "color": "#51CF66", "emoji": "🛒", "parentId": None},
    {"id": "shopping", "name": "Shopping", "color": "#E64980", "emoji": "🛍️", "parentId": None},
    {"id": "merchandise", "name": "Merchandise", "color": "#BE4BDB", "emoji": "📦", "parentId": None},
    {"id": "utilities", "name": "Utilities", "color": "#FCC419", "emoji": "⚡", "parentId": None},
    {"id": "food", "name": "Food & Dining", "color": "#FF6B6B", "emoji": "🍔", "parentId": None},
    {"id": "entertainment", "name": "Entertainment", "color": "#FF8787", "emoji": "🎬", "parentId": None},
    {"id": "misc", "name": "Miscellaneous", "color": "#ADB5BD", "emoji": "📦", "parentId": None},
    {"id": "income", "name": "Income", "color": "#40C057", "emoji": "💰", "parentId": None},
    {"id": "transfers", "name": "Transfers", "color": "#339AF0", "emoji": "↔️", "parentId": None},
    {"id": "travel", "name": "Travel", "color": "#38BDF8", "emoji": "✈️", "parentId": None},
    {"id": "housing", "name": "Housing", "color": "#4DABF7", "emoji": "🏠", "parentId": None},
    {"id": "transport", "name": "Transport", "color": "#845EF7", "emoji": "🚗", "parentId": None},
    {"id": "healthcare", "name": "Health & Medical", "color": "#20C997", "emoji": "🏥", "parentId": None},
    {"id": "child-care", "name": "Child Care", "color": "#f5f83a", "emoji": "👶", "parentId": None},
]


# ─── Data Loading ─────────────────────────────────────────────────────────────

def _parse_row_dict(r):
    raw_id = (r.get("id") or "").strip()
    raw_date = (r.get("date") or "").strip()[:10]
    raw_desc = (r.get("description") or "").strip()
    raw_amt = (r.get("amount") or "").strip()
    if not raw_id and not raw_date and not raw_desc and not raw_amt:
        return None
    labels_raw = r.get("labels") or "[]"
    try:
        labels = json.loads(labels_raw) if labels_raw.strip() else []
    except Exception:
        labels = []
    meta_raw = r.get("meta") or ""
    try:
        meta = json.loads(meta_raw) if meta_raw.strip() else {}
    except Exception:
        meta = {}
    try:
        amt_float = float(raw_amt.replace("$", "").replace(",", "") or 0.0)
    except Exception:
        amt_float = 0.0
    return {
        "id": raw_id,
        "date": raw_date,
        "category": (r.get("category") or "misc").strip(),
        "subCategory": (r.get("subCategory") or "").strip() or None,
        "amount": amt_float,
        "type": (r.get("type") or "expense").strip(),
        "description": raw_desc,
        "notes": r.get("notes") or "",
        "labels": labels,
        "hash": (r.get("hash") or "").strip(),
        "spendingBucket": (r.get("spendingBucket") or "").strip() or None,
        "meta": meta,
    }


def load_tsv_transactions(tsv_path):
    """Load transactions from an exported Google Sheets TSV (`Transactions!A:L` or `A:K`)."""
    transactions = []
    with open(tsv_path, "r", encoding="utf-8") as f:
        reader = csv.reader(f, delimiter="\t")
        header = None
        for row_idx, raw_cells in enumerate(reader, start=1):
            if row_idx == 1:
                header = [c.strip() for c in raw_cells]
                continue
            if not raw_cells or all(not c.strip() for c in raw_cells) or not header:
                continue
            row_dict = {
                header[i]: (raw_cells[i] if i < len(raw_cells) else "")
                for i in range(len(header))
            }
            parsed = _parse_row_dict(row_dict)
            if parsed:
                transactions.append(parsed)
    return transactions


def load_json_grid_transactions(json_grid_path):
    """Load transactions from a 2D JSON grid returned by `gsheets readonly read <ID> 'Transactions!A1:L2000' --json`."""
    transactions = []
    with open(json_grid_path, "r", encoding="utf-8") as f:
        payload = json.load(f)
    grid = payload.get("values", payload) if isinstance(payload, dict) else payload
    if not isinstance(grid, list) or not grid:
        return transactions
    header = [str(c).strip() for c in grid[0]]
    for raw_cells in grid[1:]:
        if not isinstance(raw_cells, list) or all(not str(c).strip() for c in raw_cells):
            continue
        row_dict = {
            header[i]: (str(raw_cells[i]) if i < len(raw_cells) and raw_cells[i] is not None else "")
            for i in range(len(header))
        }
        parsed = _parse_row_dict(row_dict)
        if parsed:
            transactions.append(parsed)
    return transactions


def load_storage_module(tsv_path=None, json_grid_path=None, state_file=None):
    """Load expense data from --tsv, --json-grid, --state-file, or fallback to storage.ts seed data."""
    storage_file = os.path.join(os.getcwd(), "src", "services", "storage.ts")
    categories = list(EMBEDDED_DEFAULT_CATEGORIES)
    budgets = []
    notes = {}
    locks = []

    if os.path.exists(storage_file):
        with open(storage_file, "r", encoding="utf-8") as f:
            content = f.read()
        parsed_cats = extract_default_categories(content)
        if parsed_cats:
            cat_ids = {c["id"] for c in parsed_cats}
            for ec in EMBEDDED_DEFAULT_CATEGORIES:
                if ec["id"] not in cat_ids:
                    parsed_cats.append(ec)
            categories = parsed_cats
        budgets = extract_seed_budgets(content)
    else:
        content = ""

    if json_grid_path:
        if not os.path.exists(json_grid_path):
            print(f"❌ Could not find JSON grid file: {json_grid_path}", file=sys.stderr)
            sys.exit(1)
        return {
            "transactions": load_json_grid_transactions(json_grid_path),
            "categories": categories,
            "budgets": budgets,
            "notes": notes,
            "locks": locks,
        }

    if tsv_path:
        if not os.path.exists(tsv_path):
            print(f"❌ Could not find TSV file: {tsv_path}", file=sys.stderr)
            sys.exit(1)
        return {
            "transactions": load_tsv_transactions(tsv_path),
            "categories": categories,
            "budgets": budgets,
            "notes": notes,
            "locks": locks,
        }

    if state_file:
        if not os.path.exists(state_file):
            print(f"❌ Could not find state file: {state_file}", file=sys.stderr)
            sys.exit(1)
        with open(state_file, "r", encoding="utf-8") as sf:
            state = json.load(sf)
        return {
            "transactions": state.get("transactions") or [],
            "categories": state.get("categories") or categories,
            "budgets": state.get("budgets") or budgets,
            "notes": state.get("notes") or notes,
            "locks": state.get("locks") or locks,
        }

    if not content:
        print("❌ Could not find src/services/storage.ts and no --tsv, --json-grid, or --state-file provided.", file=sys.stderr)
        sys.exit(1)

    return {
        "transactions": extract_seed_transactions(content),
        "categories": categories,
        "budgets": budgets,
        "notes": notes,
        "locks": locks,
    }


def extract_default_categories(content):
    """Parse DEFAULT_CATEGORIES from storage.ts."""
    categories = []
    cat_section = re.search(
        r"export const DEFAULT_CATEGORIES[\s\S]*?\];", content
    )
    if not cat_section:
        return categories

    cat_regex = re.compile(
        r"""\{\s*id:\s*['"]([^'"]+)['"],\s*"""
        r"""name:\s*['"]([^'"]+)['"],\s*"""
        r"""color:\s*['"]([^'"]+)['"],\s*"""
        r"""emoji:\s*['"]([^'"]+)['"]"""
        r"""(?:,\s*parentId:\s*['"]([^'"]+)['"])?\s*\}"""
    )

    for m in cat_regex.finditer(cat_section.group(0)):
        categories.append({
            "id": m.group(1),
            "name": m.group(2),
            "color": m.group(3),
            "emoji": m.group(4),
            "parentId": m.group(5),
        })

    return categories


def extract_seed_transactions(content):
    """Parse SEED_TRANSACTIONS from storage.ts."""
    transactions = []
    seed_section = re.search(
        r"export const SEED_TRANSACTIONS[\s\S]*?(?=\nexport )", content
    )
    if not seed_section:
        return transactions

    tx_regex = re.compile(
        r"""\{\s*id:\s*["']([^"']+)["'],\s*"""
        r"""date:\s*["']([^"']+)["'],\s*"""
        r"""category:\s*["']([^"']+)["'],\s*"""
        r"""(?:subCategory:\s*["']?([^"',}]*)["']?,\s*)?"""
        r"""amount:\s*([\d.]+),\s*"""
        r"""type:\s*["']([^"']+)["'],\s*"""
        r"""description:\s*["']([^"']+)["'],\s*"""
        r"""notes:\s*["']([^"']*)["'],\s*"""
        r"""labels:\s*\[([^\]]*)\]"""
    )

    for m in tx_regex.finditer(seed_section.group(0)):
        labels_raw = m.group(9)
        labels = [
            s.strip().strip("\"'")
            for s in labels_raw.split(",")
            if s.strip().strip("\"'")
        ] if labels_raw else []

        transactions.append({
            "id": m.group(1),
            "date": m.group(2),
            "category": m.group(3),
            "subCategory": m.group(4) or None,
            "amount": float(m.group(5)),
            "type": m.group(6),
            "description": m.group(7),
            "notes": m.group(8) or "",
            "labels": labels,
        })

    return transactions


def extract_seed_budgets(content):
    """Parse SEED_BUDGETS from storage.ts."""
    budgets = []
    seed_section = re.search(
        r"export const SEED_BUDGETS[\s\S]*?(?=export const|$)", content
    )
    if not seed_section:
        return budgets

    budget_regex = re.compile(
        r"""\{\s*category:\s*['"]([^'"]+)['"],\s*amount:\s*([\d.]+)\s*\}"""
    )
    for m in budget_regex.finditer(seed_section.group(0)):
        budgets.append({"category": m.group(1), "amount": float(m.group(2))})

    return budgets


# ─── Aggregation ──────────────────────────────────────────────────────────────

def get_months_in_scope(current_month, scope):
    """Return list of YYYY-MM strings for the requested scope."""
    year, month = map(int, current_month.split("-"))
    months = []

    if scope == "month":
        months.append(current_month)
    elif scope == "quarter":
        for i in range(3, -1, -1):
            y, m = year, month - i
            while m < 1:
                m += 12
                y -= 1
            months.append(f"{y}-{m:02d}")
    elif scope == "ytd":
        for m in range(1, month + 1):
            months.append(f"{year}-{m:02d}")
    # scope == "all": return empty list to include everything

    return months


def resolve_bucket(t):
    bucket = t.get("spendingBucket")
    if bucket in ("fixed", "flexible", "non-monthly"):
        return bucket
    labels = t.get("labels") or []
    for b in ("fixed", "non-monthly", "flexible"):
        if b in labels:
            return b
    if t.get("category") in ("housing", "utilities", "child-care"):
        return "fixed"
    return "flexible"


def aggregate_by_month(transactions, categories, months, redact):
    """Group transactions by month and compute net category-refund metrics (matching metrics.ts)."""
    cat_map = {c["id"]: c for c in categories}

    by_month = defaultdict(list)
    for t in transactions:
        m = (t.get("date") or "")[:7]
        if months and m not in months:
            continue
        by_month[m].append(t)

    summaries = []
    for month in sorted(by_month.keys()):
        txns = by_month[month]
        gross_expenses = 0.0
        total_refunds = 0.0
        total_income = 0.0
        total_transfers = 0.0
        category_breakdown = defaultdict(float)
        bucket_breakdown = {"fixed": 0.0, "flexible": 0.0, "non-monthly": 0.0}
        needs_review_txns = []

        for t in txns:
            labels = t.get("labels") or []
            is_refund = t["type"] == "income" and "refund" in labels
            cat = cat_map.get(t["category"])
            cat_name = f'{cat["emoji"]} {cat["name"]}' if cat else t["category"]

            if "needs-review" in labels:
                needs_review_txns.append({
                    "id": t.get("id", ""),
                    "date": t.get("date", ""),
                    "description": f'[Merchant {t.get("id", "")[:4]}]' if redact else t.get("description", ""),
                    "amount": t["amount"],
                    "category": t.get("category", "misc"),
                })

            if t["type"] == "expense":
                gross_expenses += t["amount"]
                category_breakdown[cat_name] += t["amount"]
                b = resolve_bucket(t)
                bucket_breakdown[b] += t["amount"]
            elif is_refund:
                total_refunds += t["amount"]
                category_breakdown[cat_name] -= t["amount"]
                b = resolve_bucket(t)
                bucket_breakdown[b] -= t["amount"]
            elif t["type"] == "income":
                total_income += t["amount"]
            elif t["type"] == "transfer":
                total_transfers += t["amount"]

        net_expenses = max(0.0, round(gross_expenses - total_refunds, 2))
        clean_cat_breakdown = {
            k: round(v, 2) for k, v in category_breakdown.items() if round(v, 2) != 0
        }
        clean_buckets = {k: max(0.0, round(v, 2)) for k, v in bucket_breakdown.items()}

        top_txns = sorted(
            [t for t in txns if t["type"] == "expense"],
            key=lambda t: t["amount"],
            reverse=True,
        )[:5]
        top_transactions = [
            {
                "description": f'[Merchant {t["id"][:4]}]' if redact else t["description"],
                "amount": t["amount"],
                "category": cat_map.get(t["category"], {}).get("name", t["category"]),
                "date": t["date"],
            }
            for t in top_txns
        ]

        summaries.append({
            "month": month,
            "grossExpenses": round(gross_expenses, 2),
            "totalRefunds": round(total_refunds, 2),
            "totalExpenses": net_expenses,
            "totalIncome": round(total_income, 2),
            "totalTransfers": round(total_transfers, 2),
            "bucketBreakdown": clean_buckets,
            "transactionCount": len(txns),
            "needsReviewCount": len(needs_review_txns),
            "needsReviewTransactions": needs_review_txns,
            "categoryBreakdown": clean_cat_breakdown,
            "topTransactions": top_transactions,
        })

    return summaries


# ─── Output Formatting ───────────────────────────────────────────────────────

def fmt(n):
    """Format number as currency string."""
    return f"${n:,.2f}"


def format_markdown(summaries, categories, budgets, notes, locks, options):
    """Render the full Markdown context document."""
    L = []

    L.append("# 📊 Expense Data Context")
    L.append("")
    L.append(f"> Generated: {datetime.now(timezone.utc).isoformat()}")
    L.append(f'> Scope: {options.scope} (focused on {options.month})')
    L.append(f"> Project: {options.project or 'default'}")
    L.append("")

    # KPI Summary
    focus = next((s for s in summaries if s["month"] == options.month), None)
    if not focus and summaries:
        focus = summaries[-1]

    if focus:
        net = focus["totalIncome"] - focus["totalExpenses"]
        sr = (
            f'{((focus["totalIncome"] - focus["totalExpenses"]) / focus["totalIncome"] * 100):.1f}'
            if focus["totalIncome"] > 0
            else "N/A"
        )
        L.append("## Key Metrics")
        L.append("")
        L.append("| Metric | Value |")
        L.append("|--------|-------|")
        L.append(f'| Focus Month | {focus["month"]} |')
        L.append(f'| Net Expenses | {fmt(focus["totalExpenses"])} (Gross {fmt(focus["grossExpenses"])} - Refunds {fmt(focus["totalRefunds"])}) |')
        L.append(f'| Fixed / Flexible / Non-Monthly | {fmt(focus["bucketBreakdown"]["fixed"])} / {fmt(focus["bucketBreakdown"]["flexible"])} / {fmt(focus["bucketBreakdown"]["non-monthly"])} |')
        L.append(f'| Total Income | {fmt(focus["totalIncome"])} |')
        L.append(f'| Internal Transfers (Excluded) | {fmt(focus["totalTransfers"])} |')
        L.append(f"| Net Cash Flow | {fmt(net)} |")
        L.append(f"| Savings Rate | {sr}% |")
        L.append(f'| Transactions | {focus["transactionCount"]} ({focus["needsReviewCount"]} needs-review) |')
        L.append("")

    # Budget vs Actual
    if budgets and focus:
        parent_cats = [c for c in categories if not c.get("parentId")]
        L.append("## Budget vs Actual")
        L.append("")
        L.append("| Category | Budget | Spent | Remaining | Status |")
        L.append("|----------|--------|-------|-----------|--------|")

        total_budget = sum(b["amount"] for b in budgets)
        for pc in parent_cats:
            b = next((bg for bg in budgets if bg["category"] == pc["id"]), None)
            if not b:
                continue
            cat_label = f'{pc["emoji"]} {pc["name"]}'
            spent = focus["categoryBreakdown"].get(cat_label, 0)
            remaining = b["amount"] - spent
            pct = round((spent / b["amount"]) * 100) if b["amount"] > 0 else 0
            if pct > 100:
                status = f"🔴 Over by {fmt(abs(remaining))}"
            elif pct >= 80:
                status = f"⚠️ {pct}% used"
            else:
                status = f"✅ {pct}% used"
            L.append(
                f"| {cat_label} | {fmt(b['amount'])} | {fmt(spent)} | {fmt(remaining)} | {status} |"
            )

        L.append(
            f'| **Total** | **{fmt(total_budget)}** | **{fmt(focus["totalExpenses"])}** | **{fmt(total_budget - focus["totalExpenses"])}** | |'
        )
        L.append("")

    # Monthly Trend
    if len(summaries) > 1:
        L.append("## Monthly Trend")
        L.append("")
        L.append("| Month | Net Expenses | Income | Net Cash Flow | Savings Rate |")
        L.append("|-------|--------------|--------|---------------|-------------|")
        for s in summaries:
            net = s["totalIncome"] - s["totalExpenses"]
            sr = (
                f'{((s["totalIncome"] - s["totalExpenses"]) / s["totalIncome"] * 100):.1f}%'
                if s["totalIncome"] > 0
                else "N/A"
            )
            arrow = "→ " if s["month"] == options.month else "  "
            L.append(
                f'| {arrow}{s["month"]} | {fmt(s["totalExpenses"])} | {fmt(s["totalIncome"])} | {fmt(net)} | {sr} |'
            )
        L.append("")

    # Category Breakdown
    if focus and focus["categoryBreakdown"]:
        L.append("## Category Breakdown")
        L.append("")
        L.append("| Category | Net Amount | % of Total |")
        L.append("|----------|------------|-----------|")
        sorted_cats = sorted(
            focus["categoryBreakdown"].items(), key=lambda x: x[1], reverse=True
        )
        for cat, amt in sorted_cats:
            pct = (
                f"{(amt / focus['totalExpenses'] * 100):.1f}"
                if focus["totalExpenses"] > 0
                else "0"
            )
            L.append(f"| {cat} | {fmt(amt)} | {pct}% |")
        L.append("")

    # Top Transactions
    if focus and focus["topTransactions"]:
        L.append("## Top 5 Expenses")
        L.append("")
        L.append("| # | Description | Amount | Category | Date |")
        L.append("|---|-------------|--------|----------|------|")
        for i, t in enumerate(focus["topTransactions"], 1):
            L.append(
                f'| {i} | {t["description"]} | {fmt(t["amount"])} | {t["category"]} | {t["date"]} |'
            )
        L.append("")

    if focus and focus.get("needsReviewTransactions"):
        L.append("## ⚠️ Needs Review Queue")
        L.append("")
        L.append("| Date | Description | Amount | Category |")
        L.append("|------|-------------|--------|----------|")
        for nr in focus["needsReviewTransactions"]:
            L.append(
                f'| {nr["date"]} | {nr["description"]} | {fmt(nr["amount"])} | `{nr["category"]}` |'
            )
        L.append("")

    # Budget Notes
    relevant_notes = {
        k: v
        for k, v in notes.items()
        if options.scope != "month" or k.startswith(options.month)
    }
    if relevant_notes:
        L.append("## Budget Notes & Context")
        L.append("")
        for key, note in relevant_notes.items():
            mood = f' {note.get("mood", "")}' if note.get("mood") else ""
            L.append(f'**{key}**{mood}: {note["text"]}')
            L.append(f'  _Updated: {note["updatedAt"]}_')
            L.append("")

    # Lock Status
    relevant_locks = [l for l in locks if l.get("locked")]
    if relevant_locks:
        L.append("## Locked Months")
        L.append("")
        for lock in relevant_locks:
            L.append(
                f'- **{lock["month"]}** — Finalized {lock.get("lockedAt", "unknown date")}'
            )
        L.append("")

    # Category Tree Reference
    L.append("## Category Reference")
    L.append("")
    parent_cats = [c for c in categories if not c.get("parentId")]
    for p in parent_cats:
        subs = [c for c in categories if c.get("parentId") == p["id"]]
        sub_list = ", ".join(f'{s["emoji"]} {s["name"]}' for s in subs)
        suffix = f": {sub_list}" if sub_list else ""
        L.append(f'- {p["emoji"]} **{p["name"]}** ({p["id"]}){suffix}')
    L.append("")

    return "\n".join(L)


# ─── Main ─────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="Export expense data as AI-ready Markdown or JSON context."
    )
    now = datetime.now()
    default_month = f"{now.year}-{now.month:02d}"

    parser.add_argument("--tsv", default=None, help="Path to exported Google Sheets Transactions.tsv")
    parser.add_argument(
        "--json-grid",
        default=None,
        help="Path to 2D JSON grid from `gsheets readonly read <ID> 'Transactions!A1:L2000' --json`",
    )
    parser.add_argument("--state-file", default=None, help="Path to JSON ledger state file")
    parser.add_argument("--project", default=None, help="Project ID to export")
    parser.add_argument(
        "--month", default=default_month, help="Focus month (YYYY-MM)"
    )
    parser.add_argument(
        "--scope",
        default="quarter",
        choices=["month", "quarter", "ytd", "all"],
        help="Data scope",
    )
    parser.add_argument(
        "--redact", action="store_true", help="Redact merchant names"
    )
    parser.add_argument(
        "--json", action="store_true", dest="output_json", help="Output JSON"
    )

    options = parser.parse_args()

    print(f"📊 Exporting expense context...", file=sys.stderr)
    print(
        f"   Month: {options.month} | Scope: {options.scope} | Redact: {options.redact}",
        file=sys.stderr,
    )

    data = load_storage_module(
        tsv_path=options.tsv,
        json_grid_path=options.json_grid,
        state_file=options.state_file,
    )
    txns = data["transactions"]
    cats = data["categories"]
    budgets = data["budgets"]
    notes = data["notes"]
    locks = data["locks"]

    print(
        f"   Found {len(txns)} transactions, {len(cats)} categories, {len(budgets)} budgets",
        file=sys.stderr,
    )

    months = get_months_in_scope(options.month, options.scope)
    summaries = aggregate_by_month(txns, cats, months, options.redact)

    if options.output_json:
        output = {
            "generatedAt": datetime.now(timezone.utc).isoformat(),
            "options": {
                "month": options.month,
                "scope": options.scope,
                "redact": options.redact,
            },
            "summaries": summaries,
            "budgets": budgets,
            "categories": cats,
            "notes": notes,
            "locks": locks,
        }
        print(json.dumps(output, indent=2))
    else:
        print(format_markdown(summaries, cats, budgets, notes, locks, options))


if __name__ == "__main__":
    main()
