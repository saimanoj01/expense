# Prompt Templates — Expense Q&A Skill

Ready-to-use prompt templates for common financial analysis workflows.
Each template includes the system context, user prompt, and expected output format.

---

## 1. Monthly Financial Review

**Use when**: User wants a comprehensive health check for a specific month.

### System Context
```
You are a personal finance analyst reviewing monthly expense data.
Provide a balanced, data-driven assessment with clear metrics.
```

### Prompt Template
```
Here is my expense data for {MONTH}:

## Summary
- Total Budget: ${TOTAL_BUDGET}
- Total Expenses: ${TOTAL_EXPENSES} ({TRANSACTION_COUNT} transactions)
- Total Income: ${TOTAL_INCOME}
- Net Cash Flow: ${NET_CASH_FLOW}
- Savings Rate: {SAVINGS_RATE}%

## Category Breakdown
{CATEGORY_TABLE}

## Budget Notes
{MONTHLY_NOTES}

Please provide:
1. A financial health score (1-10) with brief justification
2. Top 3 highlights (positive or concerning)
3. Month-over-month comparison if prior month data is available
4. 2 specific, actionable recommendations
```

### Expected Output Format
```markdown
## 📊 Monthly Review: {Month Year}

**Financial Health Score: X/10** — {one-line justification}

### Highlights
1. ✅ {positive finding with numbers}
2. ⚠️ {concern with numbers}
3. 📈 {trend observation}

### Month-over-Month
| Metric | This Month | Last Month | Change |
|--------|-----------|------------|--------|
| Expenses | $X | $Y | ↑/↓ Z% |

### Recommendations
- 💡 {actionable suggestion 1}
- 💡 {actionable suggestion 2}
```

---

## 2. Budget Audit & Rebalancing

**Use when**: User wants to optimize their budget allocations.

### Prompt Template
```
Review my budget utilization and suggest rebalancing:

## Current Budget Allocations vs Actual Spending
{BUDGET_VS_ACTUAL_TABLE}

## 3-Month Spending Averages
{THREE_MONTH_AVERAGES}

## Context Notes
{CATEGORY_NOTES}

Please:
1. Identify categories where the budget is consistently unrealistic (too high or too low)
2. Suggest specific dollar adjustments for each category
3. Keep the total budget at ${TOTAL_BUDGET} (zero-sum rebalancing)
4. Flag any categories where spending has changed significantly
```

---

## 3. Annual Retrospective

**Use when**: User wants a year-in-review narrative combining data and notes.

### Prompt Template
```
Create a year-in-review financial narrative for {YEAR}:

## Monthly Summaries
{MONTHLY_SUMMARY_TABLE}

## Monthly Overview Notes & Mood Tags
{ALL_MONTHLY_NOTES_WITH_MOODS}

## Category Trends (Year-over-Year)
{CATEGORY_YEARLY_TOTALS}

Please:
1. Write a narrative arc of the financial year (500 words max)
2. Identify the best and worst months with context from the notes
3. Calculate annual totals: income, expenses, savings, savings rate
4. Highlight the top 3 spending categories and their yearly trends
5. Provide 3 goals/resolutions for next year based on patterns
```

---

## 4. Subscription & Recurring Charge Audit

**Use when**: User wants to identify and review recurring expenses.

### Prompt Template
```
Analyze my transactions to identify recurring charges:

## All Transactions (Last 3 Months)
{RAW_TRANSACTIONS_3_MONTHS}

Please:
1. Identify all likely recurring/subscription charges by matching similar descriptions across months
2. Group them into: Essential vs Discretionary
3. Calculate the total monthly recurring cost
4. Flag any subscriptions with price increases
5. Suggest which subscriptions to review for potential cancellation

Format as a table:
| Service | Monthly Cost | Category | Essential? | Recommendation |
```

---

## 5. Tax Preparation Summary

**Use when**: User wants to organize expenses for tax filing.

### Prompt Template
```
Generate a tax-preparation expense summary for {YEAR}:

## All Transactions
{ALL_TRANSACTIONS_FOR_YEAR}

## Categories
{CATEGORY_LIST}

Please:
1. Group expenses into tax-relevant categories:
   - Business/Self-Employment
   - Medical & Health
   - Charitable Donations (if tagged)
   - Home Office / Housing
   - Education
   - Other Deductible
2. Calculate totals for each tax category
3. Flag transactions that might need receipts or documentation
4. Note: This is for organization only, not tax advice
```

---

## 6. Savings Scenario Modeling

**Use when**: User wants to model "what if" spending adjustments.

### Prompt Template
```
Model the impact of spending changes on my annual savings:

## Current Monthly Averages (3-month rolling)
{CATEGORY_AVERAGES}

## Current Monthly Income
${MONTHLY_INCOME}

## Proposed Changes
{USER_SCENARIO_DESCRIPTION}

Please:
1. Calculate current annual savings projection
2. Apply the proposed changes and calculate new projection
3. Show the monthly and annual impact in a comparison table
4. Suggest additional quick wins that could boost savings

| Scenario | Monthly Expenses | Monthly Savings | Annual Savings |
|----------|-----------------|-----------------|----------------|
| Current  | $X              | $Y              | $Z             |
| Proposed | $A              | $B              | $C             |
| Delta    |                 | +$D/month       | +$E/year       |
```

---

## 7. Spending Anomaly Deep-Dive

**Use when**: User notices something unusual and wants an explanation.

### Prompt Template
```
Help me understand a spending anomaly:

## Current Month ({MONTH}) Category Spending
{CURRENT_MONTH_CATEGORIES}

## Previous Month Category Spending
{PREVIOUS_MONTH_CATEGORIES}

## 3-Month Rolling Averages
{THREE_MONTH_AVERAGES}

## Budget Notes for Affected Categories
{RELEVANT_NOTES}

## Top Individual Transactions This Month
{TOP_10_TRANSACTIONS}

Please:
1. Identify the specific categories or transactions driving the anomaly
2. Quantify the deviation from the 3-month average ($ and %)
3. Check if any budget notes explain the spike
4. Determine if this is a one-time event or emerging pattern
5. Suggest whether the budget needs adjustment
```

---

## 8. Cross-Category Correlation Analysis

**Use when**: User wants to discover hidden spending relationships.

### Prompt Template
```
Analyze correlations between my spending categories:

## Monthly Category Totals (6 months)
{MONTHLY_CATEGORY_MATRIX}

Please:
1. Identify categories that tend to rise/fall together
2. Find inverse correlations (when one goes up, another goes down)
3. Detect seasonal patterns (e.g., travel spikes in summer)
4. Note any category that has been steadily increasing month-over-month
5. Suggest lifestyle patterns that might explain the correlations
```

---

## Usage Notes

- **Replace `{PLACEHOLDERS}`** with actual data from the export script or manual extraction
- **Token optimization**: For templates 1-3 and 6-8, use aggregated monthly summaries.
  For templates 4-5, raw transaction data is required.
- **Multi-model compatible**: These prompts work with Gemini, Claude, ChatGPT, and local LLMs.
  Adjust verbosity expectations based on model capabilities.
