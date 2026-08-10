# Example Questions — Expense Q&A Skill

Organized by category with expected answer patterns. Use these as a reference
for how to structure responses to different types of financial questions.

---

## 💰 Spending Lookups

| Question | Answer Pattern |
|----------|---------------|
| "How much did I spend on groceries in July?" | `You spent **$X** on Groceries in July across Y transactions.` |
| "Show me all Amazon purchases this year" | Table of matching transactions with dates and amounts |
| "What are my top 5 largest expenses this month?" | Ranked list: `1. $X — Description (Category)` |
| "Find all transactions tagged 'vacation'" | Filtered transaction list grouped by month |
| "How much did I spend at Costco vs Instacart?" | Side-by-side comparison with totals and transaction counts |
| "List all transfers I made in June" | Filtered list excluding from spending totals |
| "What did I spend on last Tuesday?" | Date-specific transaction list |
| "Total spending excluding transfers and income" | Net expense-only total |

---

## 📊 Budget Analysis

| Question | Answer Pattern |
|----------|---------------|
| "Which categories are over budget?" | Table with 🔴 status indicators for each over-budget category |
| "How much budget do I have left for dining?" | `You have **$X remaining** (Y% used) for Food & Dining this month.` |
| "What percentage of my entertainment budget have I used?" | `Entertainment: **Z% used** ($X of $Y budget)` |
| "Suggest budgets for next month" | Table with current budgets, 3-month averages, and recommended adjustments |
| "Which sub-categories are driving my Housing overspend?" | Sub-category breakdown with individual amounts |
| "Am I trending to go over budget by end of month?" | EOM projection with daily velocity analysis |

---

## 📈 Trends & Forecasting

| Question | Answer Pattern |
|----------|---------------|
| "Is my spending going up or down?" | `Your spending is **↑/↓ X%** vs last month ($A → $B).` |
| "What's my projected spend by end of month?" | `At your current pace ($X/day), projected EOM total: **$Y** (budget: $Z)` |
| "Which day did I spend the most?" | `Peak spending day: **{date}** with $X across Y transactions` |
| "What's my daily spending average?" | `Daily average: **$X/day** (${TOTAL} over {DAYS} days)` |
| "Compare this month to same month last year" | Year-over-year monthly comparison table |
| "Show spending velocity — am I slowing down?" | Daily spending trend with acceleration/deceleration indicator |

---

## 💵 Cash Flow & Savings

| Question | Answer Pattern |
|----------|---------------|
| "What's my savings rate?" | `Your savings rate is **X%** ($Y saved from $Z income)` |
| "Best and worst months for cash flow?" | `Best: {Month} (+$X) • Worst: {Month} (-$Y)` |
| "Am I saving more than 3 months ago?" | Savings rate trend comparison with percentage deltas |
| "Annual income vs expenses?" | `YTD Income: $X • YTD Expenses: $Y • Net: +/-$Z` |
| "Year-end savings projection?" | `Projected annual savings: **$X** (based on ${MONTHS} months of data)` |
| "Which months was I cash-flow negative?" | List of negative months with amounts |

---

## 📝 Notes & Context

| Question | Answer Pattern |
|----------|---------------|
| "Why did food spending spike in July?" | Quote the budget note + show numerical context |
| "Summarize all monthly notes for 2026" | Chronological narrative with mood tags and key highlights |
| "Which months did I tag as 'Tough'?" | List of months with ⚠️ mood + spending summaries |
| "What context did I leave for March?" | Full note text with spending data for that month |
| "Show all notes for the Housing category" | All `*:housing` notes across months |
| "Annual retrospective from my notes" | Year narrative combining notes with financial data |

---

## 🏷️ Tags & Labels

| Question | Answer Pattern |
|----------|---------------|
| "How much on 'subscription' tagged items?" | `Total subscription spending: **$X** across Y transactions` |
| "Which tags have the highest spend?" | Ranked tag list with totals |
| "All 'birthday' expenses across all months" | Cross-month filtered list |
| "Essential vs discretionary spending split" | Tag-based breakdown with percentages |

---

## 🔒 Audit & Compliance

| Question | Answer Pattern |
|----------|---------------|
| "Which months are locked?" | `Locked months: July (finalized Jul 31), June (finalized Jun 30)` |
| "Any duplicate transactions?" | List of suspected duplicates with hash matches |
| "Summary of locked June for tax prep" | Formatted report with category totals, ready for export |
| "Validate my data integrity" | Check for orphaned categories, missing dates, zero-amounts |

---

## 🆚 Comparisons

| Question | Answer Pattern |
|----------|---------------|
| "This month vs last month" | Side-by-side comparison table with deltas |
| "Month-over-month: which categories grew most?" | Ranked category growth list with ↑ percentages |
| "Average monthly spend over last 6 months?" | Rolling average with trend indicator |
| "Q1 vs Q2 spending" | Quarterly comparison with category breakdowns |

---

## 🤖 Advisory & Planning

| Question | Answer Pattern |
|----------|---------------|
| "Top 3 areas to cut spending?" | Prioritized list with estimated savings potential |
| "Create a budget plan for next month" | Suggested allocations based on historical data |
| "Rate my financial health 1-10" | Score with multi-factor justification (savings rate, budget adherence, trend) |
| "What if I increase grocery budget by $200?" | Scenario model with impact on total budget and savings |
| "Hidden spending patterns?" | Anomaly detection, recurring charges, seasonal trends |
| "Prepare me for a big purchase next month" | Savings acceleration plan with category trade-offs |
