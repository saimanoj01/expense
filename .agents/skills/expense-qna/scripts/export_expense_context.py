#!/usr/bin/env python3
"""
Expense Context Export Script

Extracts expense data from the Nebula Expense Tracker and outputs a
token-efficient Markdown summary suitable for pasting into any AI chat.

Usage:
  python3 .agents/skills/expense-qna/scripts/export_expense_context.py [options]

Options:
  --project <id>     Project ID to export (default: first project found)
  --month <YYYY-MM>  Specific month to focus on (default: current month)
  --scope <mode>     Data scope: "month", "quarter", "ytd", "all" (default: "quarter")
  --redact           Redact merchant/description names for privacy
  --json             Output as JSON instead of Markdown
  --help             Show this help message

Data Source:
  Reads from the app's seed data in src/services/storage.ts.
  For real user data, export from the app UI or Google Sheets directly.
"""

import argparse
import json
import os
import re
import sys
from collections import defaultdict
from datetime import datetime, timezone


# ─── Data Loading ─────────────────────────────────────────────────────────────

def load_storage_module():
    """Read and parse seed data from storage.ts."""
    storage_file = os.path.join(os.getcwd(), "src", "services", "storage.ts")

    if not os.path.exists(storage_file):
        print("❌ Could not find src/services/storage.ts", file=sys.stderr)
        print("   Run this script from the project root directory.", file=sys.stderr)
        sys.exit(1)

    with open(storage_file, "r", encoding="utf-8") as f:
        content = f.read()

    return {
        "transactions": extract_seed_transactions(content),
        "categories": extract_default_categories(content),
        "budgets": extract_seed_budgets(content),
        "notes": {},
        "locks": [],
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


def aggregate_by_month(transactions, categories, months, redact):
    """Group transactions by month and compute summaries."""
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
        total_expenses = 0.0
        total_income = 0.0
        total_transfers = 0.0
        category_breakdown = defaultdict(float)

        for t in txns:
            if t["type"] == "expense":
                total_expenses += t["amount"]
                cat = cat_map.get(t["category"])
                cat_name = f'{cat["emoji"]} {cat["name"]}' if cat else t["category"]
                category_breakdown[cat_name] += t["amount"]
            elif t["type"] == "income":
                total_income += t["amount"]
            elif t["type"] == "transfer":
                total_transfers += t["amount"]

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
            "totalExpenses": total_expenses,
            "totalIncome": total_income,
            "totalTransfers": total_transfers,
            "transactionCount": len(txns),
            "categoryBreakdown": dict(category_breakdown),
            "topTransactions": top_transactions,
        })

    return summaries


# ─── Output Formatting ───────────────────────────────────────────────────────

def fmt(n):
    """Format number as currency string."""
    return f"${n:,.0f}"


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
        L.append(f'| Total Expenses | {fmt(focus["totalExpenses"])} |')
        L.append(f'| Total Income | {fmt(focus["totalIncome"])} |')
        L.append(f"| Net Cash Flow | {fmt(net)} |")
        L.append(f"| Savings Rate | {sr}% |")
        L.append(f'| Transactions | {focus["transactionCount"]} |')
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
        L.append("| Month | Expenses | Income | Net | Savings Rate |")
        L.append("|-------|----------|--------|-----|-------------|")
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
        L.append("| Category | Amount | % of Total |")
        L.append("|----------|--------|-----------|")
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

    data = load_storage_module()
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
            "notes": notes,
            "locks": [l for l in locks if l.get("locked")],
            "categories": [
                {"id": c["id"], "name": c["name"], "emoji": c["emoji"], "parentId": c.get("parentId")}
                for c in cats
            ],
        }
        print(json.dumps(output, indent=2))
    else:
        print(format_markdown(summaries, cats, budgets, notes, locks, options))

    print(
        "\n✅ Done. Copy the output above and paste it into any AI chat.",
        file=sys.stderr,
    )


if __name__ == "__main__":
    main()
