# Data Schema Reference — Nebula Expense Tracker

This document provides the complete data model reference for all entities in the
Nebula Expense Tracker & Budget Planning app.

---

## Transaction

Each financial record — an expense, income deposit, or internal transfer.

```typescript
interface Transaction {
  id: string;                         // UUID (auto-generated)
  date: string;                       // ISO date: "2026-07-15"
  category: string;                   // Parent category ID (e.g., "food", "groceries")
  subCategory?: string | null;        // Sub-category ID (e.g., "food-takeout", "groceries-costco")
  amount: number;                     // Positive number (always positive, type determines direction)
  type: 'income' | 'expense' | 'transfer';
  description: string;                // Payee or record summary (e.g., "Costco Weekly Run")
  notes: string;                      // Extended details/comments
  labels: string[];                   // User-defined tags (e.g., ["vacation", "essential"])
  hash: string;                       // SHA-256 deduplication hash of (date|description|amount|type)
}
```

### Transaction Type Semantics
| Type | Meaning | Include in Spending? | Include in Income? |
|------|---------|---------------------|--------------------|
| `expense` | Money out | ✅ Yes | No |
| `income` | Money in | No | ✅ Yes |
| `transfer` | Internal move (CC payment, bank transfer) | ❌ No (avoids double-counting) | No |

---

## Category

Hierarchical 2-level tree. Parent categories group related sub-categories.

```typescript
interface Category {
  id: string;                         // Unique slug (e.g., "food", "groceries-costco")
  name: string;                       // Display name (e.g., "Food & Dining", "Costco")
  color: string;                      // Hex color (e.g., "#FF6B6B")
  emoji: string;                      // Icon emoji (e.g., "🍔")
  parentId?: string | null;           // Parent category ID (null = top-level parent)
}
```

### Default Category Tree

| Parent | ID | Emoji | Sub-Categories |
|--------|-----|-------|---------------|
| Groceries | `groceries` | 🛒 | Costco, Instacart, Supermarket |
| Shopping | `shopping` | 🛍️ | Amazon, Apparel & Clothing, General Shopping |
| Merchandise | `merchandise` | 📦 | Retail Goods, Electronics & Supplies |
| Utilities | `utilities` | ⚡ | Phone & Mobile, Electricity, Water & Sewer, Gas & Heating, Internet & TV |
| Food & Dining | `food` | 🍔 | Dine in, Takeout & Delivery |
| Entertainment | `entertainment` | 🎬 | Subscriptions & Streaming, Movies & Events |
| Miscellaneous | `misc` | 📦 | Salon & Personal Care, Other Miscellaneous |
| Income | `income` | 💰 | Salary & Wages, Freelance & Side Hustles, Investments & Dividends |
| Transfers | `transfers` | ↔️ | Credit Card Payment, Bank Transfer |
| Travel | `travel` | ✈️ | Flights & Airfare, Hotels & Lodging, Car Rental |
| Housing | `housing` | 🏠 | Mortgage & Rent, HOA Fees & Dues |
| Transport | `transport` | 🚗 | Gas & Fuel, Rideshare & Transit, Vehicle Maintenance |
| Health & Medical | `healthcare` | 🏥 | Doctor & Copay, Pharmacy & Meds, Dental & Vision |

### Roll-Up Rules
- **Sub-category spending rolls up** into parent totals automatically
- When a user asks about "Food" spending, sum all `food-*` sub-categories + direct `food` transactions
- Budget caps can be set at either parent or sub-category level

---

## Budget

Monthly spending target per category.

```typescript
interface Budget {
  category: string;                   // Category ID this budget applies to
  amount: number;                     // Monthly budget cap in dollars
}
```

### Budget Utilization Calculation
```
spent = SUM(transactions WHERE category matches AND type = 'expense' AND month matches)
percent = (spent / budget) * 100
remaining = budget - spent
status = percent > 100 ? "Over" : percent >= 80 ? "Near Limit" : "On Track"
```

---

## Budget Note

Contextual annotations attached to months or categories. Used for explaining spending spikes, recording financial context, and year-end retrospectives.

```typescript
interface BudgetNote {
  text: string;                       // Note content (free text)
  updatedAt: string;                  // ISO 8601 timestamp of last edit
  mood?: string;                      // Emoji mood tag (only for __overall__ notes)
}
```

### Key Pattern
Notes are stored as a flat `Record<string, BudgetNote>` with composite keys:

| Key Format | Scope | Example |
|---|---|---|
| `{YYYY-MM}:__overall__` | Whole-month overview | `2026-07:__overall__` |
| `{YYYY-MM}:{categoryId}` | Parent category note | `2026-07:food` |
| `{YYYY-MM}:{subCategoryId}` | Sub-category note | `2026-07:food-takeout` |

### Mood Tags (Overall Notes Only)
| Emoji | Meaning |
|-------|---------|
| 👍 | Good month |
| ⚠️ | Tough / challenging month |
| 🎉 | Great / celebratory month |
| 📉 | Cutback / austerity month |

---

## Project

An independent workspace containing its own transactions, categories, budgets, and notes.

```typescript
interface Project {
  id: string;                         // Unique ID or slug
  name: string;                       // Display name (e.g., "Personal Finances")
  spreadsheetId?: string;             // Google Sheets ID (null in demo/mock mode)
  collaborators?: string[];           // Emails of shared collaborators
}
```

---

## Monthly Lock

Locks a specific month to prevent further edits. Used for finalization and audit trails.

```typescript
interface MonthlyLock {
  month: string;                      // YYYY-MM format
  locked: boolean;                    // Lock status
  lockedAt?: string;                  // ISO timestamp when locked
}
```

---

## Computed Analytics (Derived Data)

These values are computed in React hooks, not stored persistently:

### KPI Metrics (`useTransactions`)
- **Total Expenses**: Sum of all `expense` type transactions for filtered month
- **Total Income**: Sum of all `income` type transactions for filtered month
- **Total Transfers**: Sum of all `transfer` type transactions (excluded from budget calculations)

### Cumulative Pacing (`useTransactions`)
- Daily cumulative spending curve for the current month
- Previous month trajectory overlay for comparison
- Ideal budget pace line (linear: `totalBudget / daysInMonth * dayNumber`)
- End-of-month (EOM) projection based on current daily average

### Cash Flow (`useTransactions`)
- Monthly income vs expense comparison across all available months
- Net cash flow = income - expenses
- Savings rate = `(income - expenses) / income * 100`

### Spending History (`useBudgets`)
- Per-category last month spending total
- Per-category 3-month rolling average
- Used for contextual comparison in budget notes UI

### Category Summary (`useBudgets`)
- Hierarchical budget vs actual comparisons
- Parent category totals (direct spend + sub-category rollup)
- Percentage utilization and remaining balance per category

---

## Storage Backends

| Backend | When Used | Notes |
|---------|-----------|-------|
| **LocalStorageAdapter** | Demo/Mock mode | Browser localStorage with `expense_*` key prefix |
| **GoogleSheetsAdapter** | Authenticated Google mode | Creates spreadsheets named `Nebula Expense - [Project Name]` with 5 tabs |
