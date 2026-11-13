import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import module from 'node:module';

// Register extensionless TypeScript resolver hook for Node 24
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
const repoRoot = path.resolve(__dirname, '../..');

const { DEFAULT_CATEGORIES, LocalStorageAdapter } = await import(
  pathToFileURL(path.join(repoRoot, 'src/services/storage.ts')).href
);
const { computeMonthMetrics } = await import(
  pathToFileURL(path.join(repoRoot, 'src/utils/metrics.ts')).href
);
const {
  buildSavingsRateSvgPath,
  computeHorizonBucketMix,
  computeHorizonCategoryTrends,
  computeHorizonConcentration,
  computeHorizonMonthlySeries,
  normalizeMerchantPayee,
  resolveHorizonMonths,
} = await import(
  pathToFileURL(path.join(repoRoot, 'src/utils/trendsAnalytics.ts')).href
);
const {
  buildWorkspaceSnapshot,
  clearWorkspaceData,
  computeWorkspaceHygieneReport,
  parseAndValidateWorkspaceSnapshot,
  restoreWorkspaceSnapshot,
  serializeWorkspaceSnapshot,
} = await import(
  pathToFileURL(path.join(repoRoot, 'src/utils/workspacePortability.ts')).href
);
const {
  buildBreadcrumbs,
  computeParentRoute,
  parseHash,
  routeToHash,
} = await import(
  pathToFileURL(path.join(repoRoot, 'src/utils/navigation.ts')).href
);

test('TRD-01: resolveHorizonMonths resolves 6m, 12m, ytd, and all horizons accurately', () => {
  const txns = [
    {
      id: 't1',
      date: '2026-08-10',
      amount: 400,
      type: 'expense',
      category: 'groceries',
      description: 'Whole Foods',
      notes: '',
      labels: [],
      hash: 'h1',
    },
    {
      id: 't2',
      date: '2026-11-05',
      amount: 600,
      type: 'expense',
      category: 'shopping',
      description: 'Amazon',
      notes: '',
      labels: [],
      hash: 'h2',
    },
    {
      id: 'tr1',
      date: '2025-01-01',
      amount: 1000,
      type: 'transfer',
      category: 'transfers',
      description: 'Card Autopay',
      notes: '',
      labels: [],
      hash: 'h3',
    },
  ];

  const w6 = resolveHorizonMonths('6m', '2026-11', txns, '2026-11');
  assert.equal(w6.monthKeys.length, 6);
  assert.equal(w6.monthKeys[0], '2026-06');
  assert.equal(w6.monthKeys[5], '2026-11');

  const w12 = resolveHorizonMonths('12m', '2026-11', txns, '2026-11');
  assert.equal(w12.monthKeys.length, 12);
  assert.equal(w12.monthKeys[0], '2025-12');
  assert.equal(w12.monthKeys[11], '2026-11');

  const wYtd = resolveHorizonMonths('ytd', '2026-04', txns, '2026-11');
  assert.deepEqual(wYtd.monthKeys, ['2026-01', '2026-02', '2026-03', '2026-04']);

  // Transfers in 2025-01 must NOT stretch 'all' horizon span
  const wAll = resolveHorizonMonths('all', 'all', txns, '2026-11');
  assert.deepEqual(wAll.monthKeys, ['2026-08', '2026-09', '2026-10', '2026-11']);

  // Single active month in 'all' frames trailing 6 slots ending at that month
  const wSingleAll = resolveHorizonMonths('all', 'all', [txns[1]], '2026-11');
  assert.equal(wSingleAll.monthKeys.length, 6);
  assert.equal(wSingleAll.monthKeys[5], '2026-11');
});

test('TRD-04: computeHorizonMonthlySeries & buildSavingsRateSvgPath mask inactive $0/$0 months, unclamp deficits, and emit valid single-path segments', () => {
  const txns = [
    // Oct 2026: Deficit (-157.14% unclamped)
    {
      id: 'oct-inc',
      date: '2026-10-01',
      amount: 1400,
      type: 'income',
      category: 'income',
      description: 'Paycheck',
      notes: '',
      labels: [],
      hash: 'o1',
    },
    {
      id: 'oct-exp',
      date: '2026-10-12',
      amount: 3600,
      type: 'expense',
      category: 'housing',
      description: 'Rent + Deposit',
      notes: '',
      labels: [],
      hash: 'o2',
    },
    // Nov 2026: $0 income deficit
    {
      id: 'nov-exp',
      date: '2026-11-05',
      amount: 500,
      type: 'expense',
      category: 'groceries',
      description: 'Costco',
      notes: '',
      labels: [],
      hash: 'n1',
    },
  ];

  const monthKeys = ['2026-08', '2026-09', '2026-10', '2026-11'];
  const { series, summary } = computeHorizonMonthlySeries(txns, monthKeys, DEFAULT_CATEGORIES);

  // Aug & Sep have $0/$0 -> inactive, plotSavingsRate === null
  assert.equal(series[0].hasActivity, false);
  assert.equal(series[0].plotSavingsRate, null);
  assert.equal(series[1].hasActivity, false);
  assert.equal(series[1].plotSavingsRate, null);

  // Oct has unclamped rawSavingsRate (-157.14%), clamped plotSavingsRate (-50)
  assert.equal(series[2].hasActivity, true);
  assert.ok(series[2].rawSavingsRate < -157 && series[2].rawSavingsRate > -158);
  assert.equal(series[2].plotSavingsRate, -50);

  // Nov has $0 income + $500 expense -> rawSavingsRate === null, plotSavingsRate === -50
  assert.equal(series[3].hasActivity, true);
  assert.equal(series[3].rawSavingsRate, null);
  assert.equal(series[3].plotSavingsRate, -50);

  assert.equal(summary.activeMonthsCount, 2);
  assert.equal(summary.avgDenominator, 2);
  assert.equal(summary.avgOutflow, (3600 + 500) / 2);

  // Single active point SVG path test (tier1:582 d.length > 10)
  const singlePointPath = buildSavingsRateSvgPath([
    { cx: 100, cy: null },
    { cx: 200, cy: 84.5 },
    { cx: 300, cy: null },
  ]);
  assert.ok(singlePointPath.length > 10);
  assert.equal(singlePointPath, 'M 192.0 83.9 L 208.0 85.1');

  // Multi-cluster gap SVG path test
  const gappedPath = buildSavingsRateSvgPath([
    { cx: 60, cy: 40 },
    { cx: 120, cy: 50 },
    { cx: 180, cy: null },
    { cx: 240, cy: 70 },
  ]);
  assert.equal(gappedPath, 'M 60.0 40.0 L 120.0 50.0 M 232.0 70.0 L 248.0 70.0');
});

test('TRD-05: computeHorizonCategoryTrends divides by activeMonthsCount (never / 6), nets refunds floored at 0/mo, and rolls up sub-categories & aliases', () => {
  const txns = [
    // Oct 2026: Shopping sub-category $300 - $80 refund = $220; Rent alias $2000
    {
      id: '1',
      date: '2026-10-03',
      amount: 300,
      type: 'expense',
      category: 'shopping',
      subCategory: 'shopping-amazon',
      description: 'Amazon Order',
      notes: '',
      labels: [],
      hash: '1',
    },
    {
      id: '2',
      date: '2026-10-08',
      amount: 80,
      type: 'income',
      category: 'shopping',
      subCategory: 'shopping-amazon',
      description: 'Amazon Return',
      notes: '',
      labels: ['refund'],
      hash: '2',
    },
    {
      id: '3',
      date: '2026-10-01',
      amount: 2000,
      type: 'expense',
      category: 'Rent',
      description: 'Bilt Rent',
      notes: '',
      labels: [],
      hash: '3',
    },
    // Nov 2026: Food alias $180; Shopping refund exceeds spend ($50 expense - $90 refund -> floored at $0)
    {
      id: '4',
      date: '2026-11-04',
      amount: 180,
      type: 'expense',
      category: 'Food & Dining',
      description: 'Bistro',
      notes: '',
      labels: [],
      hash: '4',
    },
    {
      id: '5',
      date: '2026-11-10',
      amount: 50,
      type: 'expense',
      category: 'shopping',
      description: 'Uniqlo',
      notes: '',
      labels: [],
      hash: '5',
    },
    {
      id: '6',
      date: '2026-11-12',
      amount: 90,
      type: 'income',
      category: 'shopping',
      description: 'Uniqlo Return',
      notes: '',
      labels: ['refund'],
      hash: '6',
    },
    // Income & Transfers excluded
    {
      id: '7',
      date: '2026-11-01',
      amount: 6000,
      type: 'income',
      category: 'income',
      description: 'Payroll',
      notes: '',
      labels: [],
      hash: '7',
    },
    {
      id: '8',
      date: '2026-11-02',
      amount: 1500,
      type: 'transfer',
      category: 'transfers',
      description: 'Chase Autopay',
      notes: '',
      labels: [],
      hash: '8',
    },
  ];

  // 6-month window where only 2 months (Oct & Nov) have activity
  const monthKeys = ['2026-06', '2026-07', '2026-08', '2026-09', '2026-10', '2026-11'];
  const { series, summary } = computeHorizonMonthlySeries(txns, monthKeys, DEFAULT_CATEGORIES);
  assert.equal(summary.activeMonthsCount, 2);

  const cats = computeHorizonCategoryTrends(
    txns,
    monthKeys,
    DEFAULT_CATEGORIES,
    summary.activeMonthsCount,
    false
  );

  const housing = cats.find(c => c.id === 'housing');
  assert.ok(housing, 'Rent alias should roll into canonical housing');
  assert.equal(housing.horizonTotal, 2000);
  // Divided by 2 active months = $1000/mo, NEVER 2000 / 6 = $333.33!
  assert.equal(housing.avgMonthly, 1000);

  const shopping = cats.find(c => c.id === 'shopping');
  assert.ok(shopping);
  assert.deepEqual(shopping.values, [0, 0, 0, 0, 220, 0]);
  assert.equal(shopping.horizonTotal, 220);
  assert.equal(shopping.avgMonthly, 110);

  const food = cats.find(c => c.id === 'food');
  assert.ok(food);
  assert.equal(food.horizonTotal, 180);
  assert.equal(food.avgMonthly, 90);

  assert.equal(cats.find(c => c.id === 'income'), undefined);
  assert.equal(cats.find(c => c.id === 'transfers'), undefined);

  // Verify bucket mix reconciles with computeMonthMetrics
  const mix = computeHorizonBucketMix(series, summary);
  const octMetrics = computeMonthMetrics(txns, '2026-10', DEFAULT_CATEGORIES);
  const novMetrics = computeMonthMetrics(txns, '2026-11', DEFAULT_CATEGORIES);
  assert.equal(
    summary.totalOutflow,
    octMetrics.expenses + novMetrics.expenses
  );
  assert.equal(
    mix.items.reduce((s, item) => s + item.total, 0),
    summary.totalOutflow
  );
});

test('TRD-08: computeHorizonConcentration normalizes merchants, excludes SYSTEM_LABELS from #tags, and groups canonical accounts', () => {
  assert.equal(normalizeMerchantPayee('TRADER JOES #142  11/04'), 'TRADER JOES');

  const txns = [
    {
      id: 'm1',
      date: '2026-11-01',
      amount: 120,
      type: 'expense',
      category: 'groceries',
      description: 'TRADER JOES #142',
      notes: '',
      labels: ['flexible', 'needs-review', 'family-dinner', 'amazon store card'],
      hash: 'm1',
      meta: { account: 'amazon store card' },
    },
    {
      id: 'm2',
      date: '2026-11-09',
      amount: 80,
      type: 'expense',
      category: 'groceries',
      description: 'Trader Joes 11/09',
      notes: '',
      labels: ['family-dinner'],
      hash: 'm2',
      meta: { account: 'amazon-synchrony' },
    },
    {
      id: 'm3',
      date: '2026-11-12',
      amount: 45,
      type: 'expense',
      category: 'food',
      description: 'Blue Bottle',
      notes: '',
      labels: ['work-trip'],
      hash: 'm3',
    },
  ];

  const conc = computeHorizonConcentration(txns, ['2026-11'], DEFAULT_CATEGORIES, 245);

  assert.equal(conc.merchants.length, 2);
  assert.equal(conc.merchants[0].name, 'Trader Joes');
  assert.equal(conc.merchants[0].expenseCount, 2);
  assert.equal(conc.merchants[0].netTotal, 200);
  assert.equal(conc.merchants[0].avgTicket, 100);

  // SYSTEM_LABELS ('flexible', 'needs-review') and account slugs ('amazon store card') excluded from tags
  assert.deepEqual(
    conc.tags.map(t => ({ tag: t.tag, netTotal: t.netTotal, count: t.count })),
    [
      { tag: 'family-dinner', netTotal: 200, count: 2 },
      { tag: 'work-trip', netTotal: 45, count: 1 },
    ]
  );

  // 'amazon store card' and 'amazon-synchrony' merge under canonical 'amazon-synchrony' ('Amazon Card'), missing -> 'unassigned'
  assert.deepEqual(
    conc.accounts.map(a => ({ key: a.accountKey, label: a.label, netTotal: a.netTotal })),
    [
      { key: 'amazon-synchrony', label: 'Amazon Card', netTotal: 200 },
      { key: 'unassigned', label: 'Unassigned', netTotal: 45 },
    ]
  );
});

test('SET-01/G7: workspacePortability exports, validates, strips __meta_ notes, restores over locked months, preserves budgets on partial CLI state files, clears cleanly, and passes export_expense_context.py', async () => {
  globalThis.localStorage.clear();
  const adapter = new LocalStorageAdapter();
  const project = await adapter.createProject('Household Primary');

  await adapter.saveTransactions(project.id, [
    {
      id: 'tx-1',
      date: '2026-10-15',
      category: 'housing',
      amount: 2200,
      type: 'expense',
      description: 'Bilt Rent',
      notes: '',
      labels: ['fixed'],
      hash: 'h-tx-1',
      meta: { account: 'bilt' },
    },
    {
      id: 'tx-2',
      date: '2026-10-01',
      category: 'income',
      amount: 6500,
      type: 'income',
      description: 'Direct Deposit',
      notes: '',
      labels: [],
      hash: 'h-tx-2',
    },
    {
      id: 'tx-uncat',
      date: '2026-10-20',
      category: '',
      amount: 35,
      type: 'expense',
      description: 'Corner Market Pending',
      notes: 'Pending',
      labels: ['needs-review'],
      hash: 'h-tx-3',
    },
  ]);

  await adapter.saveBudgets(project.id, [{ category: 'housing', amount: 2200 }]);
  await adapter.saveBudgetNote(project.id, '2026-10:__overall__', {
    text: 'October closed cleanly',
    updatedAt: '2026-10-31T00:00:00.000Z',
  });
  await adapter.saveLock(project.id, {
    month: '2026-10',
    locked: true,
    lockedAt: '2026-11-01T00:00:00.000Z',
  });
  await adapter.saveIngestState(project.id, {
    version: 1,
    tombstones: ['deadbeef12345678'],
    sources: {
      'bilt-plaid': {
        sourceId: 'bilt-plaid',
        lastSyncAt: '2026-10-31T12:00:00.000Z',
        totalIngested: 2,
      },
    },
    recentRuns: [],
  });

  // Hygiene audit check
  const hygiene = computeWorkspaceHygieneReport({
    transactions: await adapter.getTransactions(project.id),
    categories: await adapter.getCategories(project.id),
    locks: await adapter.getLocks(project.id),
    ingestState: await adapter.getIngestState(project.id),
  });
  assert.equal(hygiene.totalTransactions, 3);
  assert.equal(hygiene.activeMonthsCount, 1);
  assert.equal(hygiene.lockedMonthsCount, 1);
  assert.equal(hygiene.needsReviewCount, 1);
  assert.equal(hygiene.pendingCount, 1);
  assert.equal(hygiene.uncategorizedCount, 1);
  assert.deepEqual(hygiene.syncSummary.sourceIds, ['bilt-plaid']);

  // Build snapshot
  const snapshot = await buildWorkspaceSnapshot({
    project,
    storageAdapter: adapter,
    exportedAt: '2026-11-12T10:00:00.000Z',
  });
  assert.equal(snapshot.schemaVersion, 1);
  assert.equal(snapshot.app, 'nebula-expense-tracker');
  assert.equal(snapshot.transactions[0].id, 'tx-2'); // Chronological sort (2026-10-01 first)
  assert.ok(snapshot.categories.every(c => typeof c.emoji === 'string' && c.emoji.length > 0));

  // Verify real CLI round-trip with export_expense_context.py --state-file
  const tmpFile = path.join(os.tmpdir(), `nebula-snap-test-${process.pid}-${Date.now()}.json`);
  try {
    fs.writeFileSync(tmpFile, serializeWorkspaceSnapshot(snapshot), 'utf8');
    const scriptPath = path.join(
      repoRoot,
      '.agents/skills/expense-qna/scripts/export_expense_context.py'
    );
    const cliStdout = execFileSync(
      'python3',
      [scriptPath, '--state-file', tmpFile, '--month', '2026-10', '--json'],
      { encoding: 'utf8' }
    );
    const cliParsed = JSON.parse(cliStdout);
    assert.ok(Array.isArray(cliParsed.summaries));
    const octSummary = cliParsed.summaries.find(s => s.month === '2026-10');
    assert.ok(octSummary);
    assert.equal(octSummary.totalIncome, 6500);
    assert.equal(octSummary.totalExpenses, 2235);

    // Also verify Markdown formatting mode (exercises pc["emoji"] & notes/locks formatting)
    const cliMarkdown = execFileSync(
      'python3',
      [scriptPath, '--state-file', tmpFile, '--month', '2026-10'],
      { encoding: 'utf8' }
    );
    assert.ok(cliMarkdown.includes('Housing'));
    assert.ok(cliMarkdown.includes('$6,500.00'));
  } finally {
    if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
  }

  // Reject invalid JSON payloads
  assert.equal(parseAndValidateWorkspaceSnapshot('not json').ok, false);
  assert.equal(parseAndValidateWorkspaceSnapshot('[]').ok, false);
  assert.equal(parseAndValidateWorkspaceSnapshot('{"transactions": "bad"}').ok, false);
  assert.equal(
    parseAndValidateWorkspaceSnapshot(
      JSON.stringify({
        transactions: [
          { id: 'x', date: '10/15/2026', amount: 10, type: 'expense', category: 'food', description: 'Bad date' },
        ],
      })
    ).ok,
    false
  );

  // Mutate workspace (with 2026-10 STILL LOCKED) and verify restoreWorkspaceSnapshot succeeds cleanly
  await adapter.saveTransactions(
    project.id,
    [
      {
        id: 'tx-extra',
        date: '2026-11-02',
        category: 'food',
        amount: 99,
        type: 'expense',
        description: 'Extra',
        notes: '',
        labels: [],
        hash: 'h-extra',
      },
    ],
    { ignoreLocks: true }
  );

  // Inject a __meta_ key in incoming JSON to verify Guardrail G7 strips it
  const rawWithMeta = JSON.parse(serializeWorkspaceSnapshot(snapshot));
  rawWithMeta.notes.__meta_deleted_categories__ = {
    text: 'malicious',
    updatedAt: '2026-11-12T00:00:00.000Z',
  };
  const parsedFull = parseAndValidateWorkspaceSnapshot(JSON.stringify(rawWithMeta), project);
  assert.equal(parsedFull.ok, true);
  assert.equal(
    Object.prototype.hasOwnProperty.call(parsedFull.snapshot.notes, '__meta_deleted_categories__'),
    false
  );

  await restoreWorkspaceSnapshot(adapter, project.id, parsedFull);
  const restoredTxns = await adapter.getTransactions(project.id);
  assert.equal(restoredTxns.length, 3);
  assert.equal(restoredTxns.some(t => t.id === 'tx-extra'), false);
  const restoredLocks = await adapter.getLocks(project.id);
  assert.equal(restoredLocks.find(l => l.month === '2026-10')?.locked, true);

  // Partial CLI state-file restore (omits budgets/notes/locks, like ingest_transactions.py)
  const partialCliJson = JSON.stringify({
    projectId: project.id,
    updatedAt: '2026-11-12T12:00:00.000Z',
    transactions: [
      ...restoredTxns,
      {
        id: 'tx-cli-new',
        date: '2026-11-08',
        category: 'groceries',
        amount: 88.5,
        type: 'expense',
        description: 'Trader Joes',
        notes: '',
        labels: [],
        hash: 'h-cli-new',
      },
    ],
    categories: snapshot.categories,
    ingestState: snapshot.ingestState,
  });
  const parsedPartial = parseAndValidateWorkspaceSnapshot(partialCliJson, project);
  assert.equal(parsedPartial.ok, true);
  assert.equal(parsedPartial.summary.isPartialCliStateFile, true);
  await restoreWorkspaceSnapshot(adapter, project.id, parsedPartial);

  assert.equal((await adapter.getTransactions(project.id)).length, 4);
  // Preserved existing budgets, notes, and locks!
  assert.equal((await adapter.getBudgets(project.id)).length, 1);
  assert.equal((await adapter.getLocks(project.id)).find(l => l.month === '2026-10')?.locked, true);
  assert.ok((await adapter.getBudgetNotes(project.id))['2026-10:__overall__']);

  // Clear workspace data (lock-safe) preserves project & categories
  await clearWorkspaceData(adapter, project.id);
  assert.equal((await adapter.getTransactions(project.id)).length, 0);
  assert.equal((await adapter.getBudgets(project.id)).length, 0);
  assert.equal(Object.keys(await adapter.getBudgetNotes(project.id)).length, 0);
  assert.equal((await adapter.getLocks(project.id)).filter(l => l.locked).length, 0);
  assert.ok((await adapter.getCategories(project.id)).length > 0);
});

test('DRL-03/G8: navigation parseHash, routeToHash, computeParentRoute, and buildBreadcrumbs preserve ?fromBucket and encode categoryId', () => {
  const parsed = parseHash('#/month/2026-11/category/housing?fromBucket=non-monthly', '2026-11');
  assert.equal(parsed.view, 'category');
  assert.equal(parsed.month, '2026-11');
  assert.equal(parsed.categoryId, 'housing');
  assert.equal(parsed.bucketId, 'non-monthly');

  // Changing month via routeToHash preserves ?fromBucket=non-monthly
  const switchedHash = routeToHash({ ...parsed, month: '2026-10' }, '2026-11');
  assert.equal(switchedHash, '#/month/2026-10/category/housing?fromBucket=non-monthly');

  // Plain category route without bucketId keeps clean URL for tier12/tier15 compatibility
  assert.equal(
    routeToHash({ view: 'category', level: 3, month: '2026-11', categoryId: 'housing' }, '2026-11'),
    '#/month/2026-11/category/housing'
  );

  // Special characters in custom categoryId encode/decode cleanly
  const specialHash = routeToHash(
    { view: 'category', level: 3, month: '2026-11', categoryId: 'Dining & Takeout' },
    '2026-11'
  );
  assert.equal(specialHash, '#/month/2026-11/category/Dining%20%26%20Takeout');
  assert.equal(parseHash(specialHash, '2026-11').categoryId, 'Dining & Takeout');

  // Parent route returns to non-monthly (fromBucket) instead of default fixed
  const parent = computeParentRoute(parsed, DEFAULT_CATEGORIES);
  assert.equal(parent.view, 'bucket');
  assert.equal(parent.bucketId, 'non-monthly');

  // Breadcrumbs keep breadcrumb-item-category-housing ID intact while using non-monthly ancestor
  const crumbs = buildBreadcrumbs(parsed, DEFAULT_CATEGORIES);
  assert.equal(crumbs[1].id, 'bucket-non-monthly');
  assert.equal(crumbs[2].id, 'category-housing');
});
