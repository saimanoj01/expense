# Original User Request

## Initial Request — 2026-07-16T21:00:36Z

A serverless, decentralized web application for tracking personal and project expenses where all data is stored entirely within the user's own Google Workspace (Drive/Sheets) and runs on GitHub Pages.

Working directory: /Users/saimanojb/github/Expense Tracker and Budget Planning
Integrity mode: development

## Requirements

### R1. Google Authentication & Namespaced Storage
- Users must login with Google OAuth 2.0 to access the app.
- Each expense project must map to a unique Google Spreadsheet stored in Google Drive.
- Newly logged-in users must be prompted to create a default project if none exist.
- Projects must be shareable individually with other Google users (Editor or Viewer permissions).
- A schema validation routine must run on project load to verify sheets and headers, offering auto-repair.

### R2. Core Transactions & Budgets
- Manual entry must feature an explicit Income/Expense toggle and support Date, Category, Amount, Description, Notes, and Labels.
- Editing and deleting transactions must be supported.
- Monthly category budgets must be configurable in a dedicated grid.
- Custom categories can be created, edited, and customized with name, color, and emoji.

### R3. CSV Statement Import & Deduplication
- Support uploading CSV files, mapping columns (Debit, Credit, Amount, Date, Payee).
- Exclude or flag duplicate transactions automatically using a computed SHA-256 hash.

### R4. Month Locking & Email Reports
- Support locking/unlocking months; locking disables transaction edits for that month.
- Locking a month must send a beautifully formatted HTML report email via Gmail API to all project collaborators fetched from Drive.

### R5. Interactive UI/UX & Analytics
- Highly polished, futuristic dark-first theme with glassmorphism layout, responsive design, and CSS animations.
- Visual charts: expense breakdown pie chart, monthly trend area chart, and budget vs actual bar chart (built natively with SVG/CSS).
- Fuzzy search and multi-filtering panel for transactions.
- CSV and PDF export options for monthly reports.

### R6. Developer Mock / Demo Mode
- The application must support a Mock/Demo Mode that activates when no valid Google Client ID is configured in `.env.local` (or via a "Mock Login" toggle).
- Under Mock Mode, all database read/write actions must seamlessly fall back to browser `localStorage` with a pre-seeded mockup database (containing test projects, categories, budgets, and transactions) so the entire web app features can be fully operated and verified without real Google APIs.

## Acceptance Criteria

### Technical & Quality Guardrails
- [ ] **Zero-Error Build**: React single-page application must build without linting errors or compilation warnings (`npm run build`).
- [ ] **UI Aesthetics**: Futuristic, dark-first premium design (custom HSL gradients, glassmorphism, responsive grid down to 320px screen width).
- [ ] **No Charting Libraries**: All dashboard visualizations (pie/donut breakdown, line trend, budget vs actual bars) must be constructed with clean, native SVG elements and CSS animations. No ChartJS, Recharts, or other canvas/SVG wrapper libraries.
- [ ] **Google OAuth & APIs**: Functional implementation of OAuth login, file search/sharing via Drive API, tab-level CRUD via Sheets API, and HTML email send via Gmail API.
- [ ] **Pluggable AI stubs**: `LLMAdapter` code stubs defined for both Gemini and Claude.

### Functional Requirements
- [ ] **Mock/Demo Mode**: Application fully operates out of the box using `localStorage` when no `.env.local` is present, with preloaded mock transactions, categories, budgets, and locks.
- [ ] **Core CRUD & Navigation**: Drill-down from Project grid → Month overview grid → Monthly transactions details. Adding/editing/deleting transactions and updating budgets must save to storage (Sheets or mock).
- [ ] **Fuzzy Search & Filters**: Active filtering of transactions by date, category, tags, amount range, type, and fuzzy text search matching payee or notes.
- [ ] **Deduplication on Import**: CSV mapping imports successfully, computing SHA-256 hashes for each row. Highlight and default-exclude any overlapping rows with existing hashes.
- [ ] **Month Locking & Email Dispatch**: Locking a month disables all transaction inputs and triggers an HTML email with summary KPIs, tables, and progress bars. Unlocking must delete the lock record and restore edit buttons.

## Verification Plan

An independent audit agent will verify the build using the following programmatic and manual guidelines:
1. Run `npm run build` to confirm compilation success.
2. Open the web app in a browser without any `.env.local` configured. Verify it launches directly in **Mock/Demo Mode**.
3. Create a mock project, navigate to it, verify the Month overview progress bars, and click a month.
4. Add 3 manual transactions, edit 1, and delete 1. Verify the summary KPI cards update immediately.
5. Set budgets for 2 categories. Verify that the budget vs. actual SVG bar chart adjusts.
6. Upload a sample CSV containing 5 transactions (2 duplicates of existing items). Verify that the mapping wizard allows column assignments, the preview flags 2 duplicates, and importing writes exactly 3 rows.
7. Click "Lock Month". Verify all editing/adding controls disappear. Verify that the console logs the full compiled HTML email payload to be dispatched.
8. Click "Unlock Month". Verify edit controls reappear.
9. Verify CSS dark/light mode toggle and mobile responsive layout (using browser responsive tools).
