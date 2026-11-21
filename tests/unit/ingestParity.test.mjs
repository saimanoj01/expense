import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { registerHooks } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (
      (specifier.startsWith('./') || specifier.startsWith('../')) &&
      !/\.[a-z]+$/i.test(specifier) &&
      context.parentURL
    ) {
      const parentDir = path.dirname(fileURLToPath(context.parentURL));
      const tsCandidate = path.resolve(parentDir, `${specifier}.ts`);
      if (fs.existsSync(tsCandidate)) {
        return { url: pathToFileURL(tsCandidate).href, shortCircuit: true };
      }
      const idxCandidate = path.resolve(parentDir, specifier, 'index.ts');
      if (fs.existsSync(idxCandidate)) {
        return { url: pathToFileURL(idxCandidate).href, shortCircuit: true };
      }
    }
    return nextResolve(specifier, context);
  },
});

const repoRoot = process.cwd();
const walletReconcilePy = path.join(
  repoRoot,
  '.agents/skills/expense-ingest/scripts/wallet_reconcile.py'
);
const exportExpenseContextPy = path.join(
  repoRoot,
  '.agents/skills/expense-qna/scripts/export_expense_context.py'
);

// Minimal localStorage shim for importing TS modules directly in Node
if (typeof globalThis.localStorage === 'undefined') {
  const store = new Map();
  globalThis.localStorage = {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: k => store.delete(k),
    clear: () => store.clear(),
  };
}

function withTempDir(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nebula-p1-parity-'));
  try {
    return fn(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test('P1-1: computeTxHash in TypeScript matches Python wallet_reconcile.py across ISO timestamps and signed amounts', async () => {
  const { computeTxHash } = await import(
    pathToFileURL(path.join(repoRoot, 'src/utils/crypto.ts')).href
  );

  const cases = [
    ['2026-07-15T14:30:00Z', '  Trader Joes #105  ', -42.5, 'EXPENSE'],
    ['2026-08-01', 'Bilt Housing Payment', 2850, 'expense'],
    ['2026-07-18', 'Nordstrom Return Credit', -65.12, 'income'],
  ];

  const pyScript = `
import json, sys, importlib.util
spec = importlib.util.spec_from_file_location("wr", sys.argv[1])
wr = importlib.util.module_from_spec(spec)
spec.loader.exec_module(wr)
cases = json.loads(sys.argv[2])
print(json.dumps([wr.compute_tx_hash(d, desc, amt, t) for d, desc, amt, t in cases]))
`;
  const pyHashes = JSON.parse(
    execFileSync('python3', ['-c', pyScript, walletReconcilePy, JSON.stringify(cases)], {
      encoding: 'utf8',
    })
  );

  for (let i = 0; i < cases.length; i++) {
    const [d, desc, amt, t] = cases[i];
    const tsHash = await computeTxHash(d, desc, amt, t);
    assert.equal(tsHash, pyHashes[i], `Hash mismatch for case ${i}`);
  }
});

test('P1-2: Costco Gas is transport-fuel and non-opaque in both TS and Python, and store numbers/years are never extracted as account digits', async () => {
  const normalizer = await import(
    pathToFileURL(path.join(repoRoot, 'src/services/ingestion/normalizer.ts')).href
  );

  assert.equal(normalizer.getMerchantFamily('COSTCO GAS #0110'), 'costco gas');
  assert.equal(normalizer.isMultiCategoryMarketplace('COSTCO GAS #0110'), false);
  assert.equal(normalizer.isOpaqueDescription('COSTCO GAS #0110'), false);
  assert.equal(normalizer.isOpaqueDescription('COSTCO WHSE #0110'), true);

  withTempDir(dir => {
    const inputPath = path.join(dir, 'in.json');
    fs.writeFileSync(
      inputPath,
      JSON.stringify([
        {
          date: '2026-07-15',
          description: 'COSTCO GAS #0110',
          amount: 54.2,
          status: 'Purchase',
          notes: 'Purchased on 2026-07-15 at station #0110',
        },
      ])
    );

    const out = JSON.parse(
      execFileSync(
        'python3',
        [walletReconcilePy, '--input', inputPath, '--reference-date', '2026-07-16'],
        { encoding: 'utf8' }
      )
    );

    assert.equal(out.summary.inserted, 1);
    assert.equal(out.summary.insertedFlagged, 0);
    const tx = out.insertedTransactions[0];
    assert.equal(tx.category, 'transport');
    assert.equal(tx.subCategory, 'transport-fuel');
    assert.equal(tx.spendingBucket, 'flexible');
    assert.ok(!tx.labels.includes('needs-review'));
    // Must NOT extract "2026" or "0110" as an account
    assert.equal(tx.meta.account, undefined);
  });
});

test('P1-3: Stage 1 history prioritizes user-verified rows, isolates enriched marketplace items, and excludes reimbursement/unresolved-category rows', () => {
  withTempDir(dir => {
    const existingGrid = {
      values: [
        ['id', 'date', 'category', 'subCategory', 'amount', 'type', 'description', 'notes', 'labels', 'hash', 'spendingBucket', 'meta'],
        // 3 legacy auto-categorized rows for Acme Club -> entertainment
        ['h1', '2026-04-10', 'entertainment', 'entertainment-movies', '50', 'expense', 'ACME CLUB', '', '[]', 'h1', 'flexible', JSON.stringify({ categorizedBy: 'keyword' })],
        ['h2', '2026-05-10', 'entertainment', 'entertainment-movies', '50', 'expense', 'ACME CLUB', '', '[]', 'h2', 'flexible', JSON.stringify({ categorizedBy: 'keyword' })],
        ['h3', '2026-06-10', 'entertainment', 'entertainment-movies', '50', 'expense', 'ACME CLUB', '', '[]', 'h3', 'flexible', JSON.stringify({ categorizedBy: 'keyword' })],
        // 1 user-verified override -> healthcare / healthcare-doctor
        ['h4', '2026-06-25', 'healthcare', 'healthcare-doctor', '50', 'expense', 'ACME CLUB', '', '[]', 'h4', 'fixed', JSON.stringify({ categorizedBy: 'user', userEdited: ['category'] })],
        // Enriched Amazon electronics history row — must NOT bleed into "Amazon: Baby Wipes"
        ['h5', '2026-06-20', 'merchandise', 'merchandise-electronics', '19.99', 'expense', 'Amazon: HDMI Cable', '', '[]', 'h5', 'flexible', JSON.stringify({ categorizedBy: 'user' })],
        // Reimbursement-labeled row & unresolved category-review row — must be ignored by history
        ['h6', '2026-06-21', 'travel', 'travel-hotels', '120', 'expense', 'BETA LODGE', '', '["reimbursement"]', 'h6', 'non-monthly', JSON.stringify({ categorizedBy: 'user' })],
        ['h7', '2026-06-22', 'shopping', 'shopping-general', '33', 'expense', 'GAMMA SHOP', '', '[]', 'h7', 'flexible', JSON.stringify({ review: { reason: 'category', flaggedAt: '2026-06-22T00:00:00Z' } })],
      ],
    };
    const txJsonPath = path.join(dir, 'txs.json');
    fs.writeFileSync(txJsonPath, JSON.stringify(existingGrid));

    const inputPath = path.join(dir, 'in.json');
    fs.writeFileSync(
      inputPath,
      JSON.stringify([
        { date: '2026-07-15', description: 'ACME CLUB', amount: 50.0, status: 'Purchase' },
        { date: '2026-07-15', description: 'Amazon: Baby Wipes', merchant: 'Amazon', amount: 24.5, status: 'Purchase' },
        { date: '2026-07-15', description: 'BETA LODGE', amount: 90.0, status: 'Purchase' },
        { date: '2026-07-15', description: 'GAMMA SHOP', amount: 18.0, status: 'Purchase' },
      ])
    );

    const out = JSON.parse(
      execFileSync(
        'python3',
        [
          walletReconcilePy,
          '--input',
          inputPath,
          '--transactions-json',
          txJsonPath,
          '--reference-date',
          '2026-07-16',
        ],
        { encoding: 'utf8' }
      )
    );

    const byDesc = Object.fromEntries(out.insertedTransactions.map(t => [t.description, t]));
    assert.equal(byDesc['ACME CLUB'].category, 'healthcare');
    assert.equal(byDesc['ACME CLUB'].subCategory, 'healthcare-doctor');
    assert.equal(byDesc['ACME CLUB'].spendingBucket, 'fixed');
    assert.equal(byDesc['ACME CLUB'].meta.categorizedBy, 'history');

    // Enriched Amazon item must NOT inherit "merchandise-electronics" from HDMI Cable
    assert.notEqual(byDesc['Amazon: Baby Wipes'].category, 'merchandise');
    assert.equal(byDesc['Amazon: Baby Wipes'].category, 'shopping');
    assert.equal(byDesc['Amazon: Baby Wipes'].meta.categorizedBy, 'keyword');

    // BETA LODGE (reimbursement) and GAMMA SHOP (unresolved category review) must NOT learn from history
    assert.equal(byDesc['BETA LODGE'].category, 'misc');
    assert.equal(byDesc['GAMMA SHOP'].category, 'misc');
  });
});

test('P1-4: Negative Purchase credits become refunds, notes do not bleed into Stage 2b, explicit category overrides work, and __meta_workspace_config__ merges accountMap', () => {
  withTempDir(dir => {
    const notesJsonPath = path.join(dir, 'notes.json');
    fs.writeFileSync(
      notesJsonPath,
      JSON.stringify({
        values: [
          ['key', 'note'],
          [
            '__meta_workspace_config__',
            JSON.stringify({
              text: JSON.stringify({
                accountMap: {
                  '3344': { label: 'custom sapphire', displayName: 'Chase Sapphire (3344)' },
                },
              }),
              updatedAt: '2026-07-15T00:00:00Z',
            }),
          ],
        ],
      })
    );

    const inputPath = path.join(dir, 'in.json');
    fs.writeFileSync(
      inputPath,
      JSON.stringify([
        // Negative credit marked "Purchase" -> refund
        { date: '2026-07-15', description: 'NORDSTROM', amount: -45.0, status: 'Purchase', account: '3344' },
        // Positive Return Credit -> refund
        { date: '2026-07-15', description: 'Target Return Credit', amount: 22.0, status: 'Purchase' },
        // Negative Plaid payroll deposit -> pure income (NOT refund)
        { date: '2026-07-15', description: 'GOOGLE LLC PAYROLL', amount: -3200.0, status: 'Deposit' },
        // Notes bleed test: notes mention "water bottle delivery" AND "your rental" / "payroll"
        {
          date: '2026-07-15',
          description: 'MYSTERY BOUTIQUE',
          amount: 31.0,
          status: 'Purchase',
          notes: 'Bought water bottle delivery gift for your rental with payroll bonus',
          account: 'Custom Card',
        },
        // Explicit 2-pass Gemini Spark category override
        {
          date: '2026-07-15',
          description: 'SMILE CARE STUDIO',
          amount: 185.0,
          status: 'Purchase',
          category: 'healthcare',
          subCategory: 'healthcare-dental',
          spendingBucket: 'flexible',
        },
      ])
    );

    const out = JSON.parse(
      execFileSync(
        'python3',
        [
          walletReconcilePy,
          '--input',
          inputPath,
          '--notes-json',
          notesJsonPath,
          '--reference-date',
          '2026-07-16',
        ],
        { encoding: 'utf8' }
      )
    );

    const byDesc = Object.fromEntries(out.insertedTransactions.map(t => [t.description, t]));

    assert.equal(byDesc['NORDSTROM'].type, 'income');
    assert.ok(byDesc['NORDSTROM'].labels.includes('refund'));
    assert.equal(byDesc['NORDSTROM'].amount, 45.0);
    assert.equal(byDesc['NORDSTROM'].meta.account, 'custom sapphire');

    assert.equal(byDesc['Target Return Credit'].type, 'income');
    assert.ok(byDesc['Target Return Credit'].labels.includes('refund'));

    assert.equal(byDesc['GOOGLE LLC PAYROLL'].type, 'income');
    assert.equal(byDesc['GOOGLE LLC PAYROLL'].category, 'income');
    assert.ok(!byDesc['GOOGLE LLC PAYROLL'].labels.includes('refund'));

    // Notes must NOT bleed into utilities-water, food-takeout, or pure income; custom raw_account preserved
    assert.equal(byDesc['MYSTERY BOUTIQUE'].type, 'expense');
    assert.equal(byDesc['MYSTERY BOUTIQUE'].category, 'misc');
    assert.equal(byDesc['MYSTERY BOUTIQUE'].meta.account, 'Custom Card');
    assert.ok(byDesc['MYSTERY BOUTIQUE'].labels.includes('needs-review'));

    // Explicit category override honored cleanly
    assert.equal(byDesc['SMILE CARE STUDIO'].category, 'healthcare');
    assert.equal(byDesc['SMILE CARE STUDIO'].subCategory, 'healthcare-dental');
    assert.equal(byDesc['SMILE CARE STUDIO'].meta.categorizedBy, 'llm');
    assert.ok(!byDesc['SMILE CARE STUDIO'].labels.includes('needs-review'));

    // Verify amazon-synchrony alias compatibility and labels-before-notes precedence in parse_sheet_row_dict
    const pyCheck = JSON.parse(
      execFileSync(
        'python3',
        [
          '-c',
          `import json, sys, importlib.util
s = importlib.util.spec_from_file_location("w", sys.argv[1])
w = importlib.util.module_from_spec(s)
s.loader.exec_module(w)
compat = w.accounts_are_compatible("amazon-synchrony", "Amazon Store Card", w.DEFAULT_RULES)
parsed = w.parse_sheet_row_dict(
    {"id":"r1","date":"2026-07-15","category":"transfers","amount":"500","type":"transfer","description":"Payment","notes":"BILT CARD PMT","labels":'["manoj bofa"]',"hash":"h1","spendingBucket":"","meta":"{}"},
    2,
    w.DEFAULT_RULES,
)
print(json.dumps({"compat": compat, "account": parsed["meta"].get("account")}))`,
          walletReconcilePy,
        ],
        { encoding: 'utf8' }
      )
    );
    assert.equal(pyCheck.compat, true);
    assert.equal(pyCheck.account, 'manoj bofa');
  });
});

test('P1-5: Same-day charges on different accounts are both inserted, parse_sheet_row_dict scans both labels+notes, and Bilt Day-27 pending upgrades to Day-29 settled + Leg 3 normalizes month-end', () => {
  withTempDir(dir => {
    const pyHash = (d, desc, amt, t) =>
      execFileSync(
        'python3',
        [
          '-c',
          'import sys, importlib.util; s=importlib.util.spec_from_file_location("w",sys.argv[1]); m=importlib.util.module_from_spec(s); s.loader.exec_module(m); print(m.compute_tx_hash(sys.argv[2],sys.argv[3],float(sys.argv[4]),sys.argv[5]))',
          walletReconcilePy,
          d,
          desc,
          String(amt),
          t,
        ],
        { encoding: 'utf8' }
      ).trim();

    const coffeeHash = pyHash('2026-07-28', 'STARBUCKS', 6.5, 'expense');
    const biltPendingHash = pyHash('2026-07-27', 'Bilt Housing Payment', 2900, 'expense');

    const txJsonPath = path.join(dir, 'txs.json');
    fs.writeFileSync(
      txJsonPath,
      JSON.stringify({
        values: [
          ['id', 'date', 'category', 'subCategory', 'amount', 'type', 'description', 'notes', 'labels', 'hash', 'spendingBucket', 'meta'],
          // Existing Starbucks charge on Bilt (7702) — account ONLY in notes, while labels has ["vacation"]!
          [
            'tx-coffee-bilt',
            '2026-07-28',
            'food',
            'food-takeout',
            '6.50',
            'expense',
            'STARBUCKS',
            'Google Wallet (Plaid) • Bilt Palladium (7702)',
            '["vacation"]',
            coffeeHash,
            'flexible',
            JSON.stringify({ sources: ['gpay-plaid'] }),
          ],
          // Pending Bilt Housing Payment on day 27 (2026-07-27)
          [
            'tx-bilt-pending',
            '2026-07-27',
            'housing',
            'housing-mortgage',
            '2900',
            'expense',
            'Bilt Housing Payment',
            'Google Wallet (Plaid) • Bilt Palladium (7702) • Pending',
            '[]',
            biltPendingHash,
            'fixed',
            JSON.stringify({ account: 'bilt', provisional: true, sources: ['gpay-plaid'] }),
          ],
        ],
      })
    );

    const inputPath = path.join(dir, 'in.json');
    fs.writeFileSync(
      inputPath,
      JSON.stringify([
        // Identical same-day Starbucks charge on DIFFERENT card (BofA Atmos 4692) -> must INSERT, not skip!
        {
          date: '2026-07-28',
          description: 'STARBUCKS',
          amount: 6.5,
          status: 'Purchase',
          account: 'BofA Atmos Ascent Visa (4692)',
        },
        // Settled Bilt Housing Payment on day 29 (2026-07-29 -> normalizes to 2026-08-01, 5d after day 27 pending)
        {
          date: '2026-07-29',
          description: 'Bilt Housing Payment',
          amount: 2900,
          status: 'Purchase',
          account: 'Bilt Palladium (7702)',
        },
        // Leg 3 Bilt Housing pass-through on BofA 9666 on day 29 -> must ALSO normalize to 2026-08-01!
        {
          date: '2026-07-29',
          description: 'BILT CARD DES:HOUSING ID:123',
          amount: 2900,
          status: 'Purchase',
          account: 'BofA SafeBalance (9666)',
        },
      ])
    );

    const out = JSON.parse(
      execFileSync(
        'python3',
        [
          walletReconcilePy,
          '--input',
          inputPath,
          '--transactions-json',
          txJsonPath,
          '--reference-date',
          '2026-07-30',
        ],
        { encoding: 'utf8' }
      )
    );

    // 1. Starbucks on BofA Atmos (4692) was inserted (NOT dropped as duplicate of Bilt 7702)
    const starbucksInserted = out.insertedTransactions.find(t => t.description === 'STARBUCKS');
    assert.ok(starbucksInserted, 'Same-day charge on different card should be inserted');
    assert.equal(starbucksInserted.meta.account, 'bofa atmos');
    assert.ok(!starbucksInserted.labels.includes('needs-review'));

    // 2. Day-27 pending Bilt Housing upgraded in-place to 2026-08-01 settled
    assert.equal(out.summary.updatedPendingToSettled, 1);
    assert.equal(out.updateOps[0].id, 'tx-bilt-pending');
    assert.equal(out.updateOps[0].tx.date, '2026-08-01');
    assert.equal(out.updateOps[0].tx.meta.provisional, false);

    // 3. Leg 3 Bilt Housing transfer on 9666 normalized to 2026-08-01
    const leg3 = out.insertedTransactions.find(t => t.description === 'Bilt' && t.type === 'transfer');
    assert.ok(leg3, 'Leg 3 Bilt Housing transfer should be inserted');
    assert.equal(leg3.date, '2026-08-01');
  });
});

test('P1-6: bucketOf/bucketSource parity and llmCategorizer partial batch preservation', async () => {
  const { bucketOf, bucketSource } = await import(
    pathToFileURL(path.join(repoRoot, 'src/utils/categorizer.ts')).href
  );
  const { classifyTransactionsWithLLM } = await import(
    pathToFileURL(path.join(repoRoot, 'src/services/llmCategorizer.ts')).href
  );
  const { DEFAULT_CATEGORIES } = await import(
    pathToFileURL(path.join(repoRoot, 'src/services/storage.ts')).href
  );

  assert.equal(bucketOf({ category: 'child-care' }), 'fixed');
  assert.equal(bucketOf({ category: 'travel' }), 'non-monthly');
  assert.equal(bucketOf({ category: 'insurance' }), 'non-monthly');
  assert.equal(bucketOf({ category: 'taxes' }), 'non-monthly');
  assert.equal(bucketOf({ category: 'transport', subCategory: 'transport-maint' }), 'non-monthly');
  assert.equal(bucketOf({ category: 'entertainment', subCategory: 'entertainment-subs' }), 'fixed');
  assert.equal(bucketSource({ category: 'healthcare' }), 'category');
  assert.equal(bucketSource({ category: 'child-care' }), 'category');
  assert.equal(bucketSource({ category: 'merchandise' }), 'category');
  assert.equal(bucketSource({ category: 'misc' }), 'category');

  // Verify llmCategorizer preserves Batch 1 when Batch 2 fails (55 items -> 2 batches of 50 & 5)
  globalThis.localStorage.setItem('expense_gemini_api_key', 'test-key');
  const origFetch = globalThis.fetch;
  let callCount = 0;
  globalThis.fetch = async () => {
    callCount += 1;
    if (callCount === 1) {
      return {
        ok: true,
        json: async () => ({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      classifications: [
                        { id: 'item-0', categoryId: 'entertainment', subCategoryId: 'entertainment-movies', spendingBucket: 'flexible', confidence: 0.91 },
                      ],
                    }),
                  },
                ],
              },
            },
          ],
        }),
      };
    }
    return {
      ok: false,
      status: 500,
      text: async () => 'Transient Gemini error on batch 2',
    };
  };

  try {
    const items = Array.from({ length: 55 }, (_, i) => ({
      id: `item-${i}`,
      description: i === 50 ? 'STARBUCKS #12' : `MERCHANT ${i}`,
      amount: 10 + i,
    }));
    const res = await classifyTransactionsWithLLM(items, DEFAULT_CATEGORIES);
    assert.equal(callCount, 2);
    assert.equal(res['item-0'].categoryId, 'entertainment');
    assert.equal(res['item-0'].confidenceSource, 'model');
    assert.equal(res['item-50'].categoryId, 'food');
    assert.equal(res['item-50'].confidenceSource, 'default');
  } finally {
    globalThis.fetch = origFetch;
    globalThis.localStorage.removeItem('expense_gemini_api_key');
  }
});

test('P1-7: export_expense_context.py does not mix SEED_BUDGETS into live exports and supports live sheet JSON tabs', () => {
  withTempDir(dir => {
    const txPath = path.join(dir, 'txs.json');
    const budgetsPath = path.join(dir, 'budgets.json');
    const catsPath = path.join(dir, 'cats.json');
    const notesPath = path.join(dir, 'notes.json');
    const locksPath = path.join(dir, 'locks.json');

    fs.writeFileSync(
      txPath,
      JSON.stringify({
        values: [
          ['id', 'date', 'category', 'subCategory', 'amount', 'type', 'description', 'notes', 'labels', 'hash', 'spendingBucket', 'meta'],
          ['t1', '2026-07-10', 'travel', 'travel-flights', '420', 'expense', 'ALASKA AIR', '', '[]', 'h1', '', '{}'],
          ['t2', '2026-07-12', 'reimbursement', '', '100', 'income', 'Employer Refund', '', '[]', 'h2', 'non-monthly', '{}'],
          ['t3', '2026-07-14', 'custom-gym', '', '80', 'expense', 'GOLD GYM', '', '[]', 'h3', '', '{}'],
        ],
      })
    );
    fs.writeFileSync(
      budgetsPath,
      JSON.stringify({ values: [['category', 'amount'], ['travel', '500'], ['custom-gym', '100']] })
    );
    fs.writeFileSync(
      catsPath,
      JSON.stringify({
        values: [
          ['id', 'name', 'color', 'emoji', 'parentId', 'defaultBucket'],
          ['travel', 'Travel', '#38BDF8', '✈️', '', 'non-monthly'],
          ['custom-gym', 'Gym', '#22C55E', '🏋️', '', 'fixed'],
        ],
      })
    );
    fs.writeFileSync(
      notesPath,
      JSON.stringify({
        values: [
          ['key', 'note'],
          ['__meta_ingest_state__', JSON.stringify({ text: '{"version":1}', updatedAt: '2026-07-15T00:00:00Z' })],
          ['__meta_deleted_categories__', JSON.stringify({ text: '["entertainment"]', updatedAt: '2026-07-15T00:00:00Z' })],
          ['2026-07:__overall__', JSON.stringify({ text: 'Summer trip month', mood: '👍', updatedAt: '2026-07-15T00:00:00Z' })],
        ],
      })
    );
    fs.writeFileSync(
      locksPath,
      JSON.stringify({ values: [['month', 'locked', 'lockedAt'], ['2026-06', 'true', '2026-07-01T00:00:00Z']] })
    );

    // 1. Live --json-grid WITHOUT --budgets-json must NOT inject SEED_BUDGETS
    const noBudgetsOut = JSON.parse(
      execFileSync(
        'python3',
        [exportExpenseContextPy, '--json-grid', txPath, '--month', '2026-07', '--scope', 'month', '--json'],
        { encoding: 'utf8' }
      )
    );
    assert.deepEqual(noBudgetsOut.budgets, []);

    // 2. Live --json-grid WITH live tab JSONs
    const liveOut = JSON.parse(
      execFileSync(
        'python3',
        [
          exportExpenseContextPy,
          '--json-grid',
          txPath,
          '--budgets-json',
          budgetsPath,
          '--categories-json',
          catsPath,
          '--notes-json',
          notesPath,
          '--locks-json',
          locksPath,
          '--month',
          '2026-07',
          '--scope',
          'month',
          '--json',
        ],
        { encoding: 'utf8' }
      )
    );
    assert.equal(liveOut.budgets.length, 2);
    assert.equal(liveOut.summaries[0].grossExpenses, 500);
    assert.equal(liveOut.summaries[0].totalRefunds, 100);
    assert.equal(liveOut.summaries[0].totalExpenses, 400);
    // custom-gym has defaultBucket=fixed (80); travel=420 - refund=100 -> non-monthly=320
    assert.equal(liveOut.summaries[0].bucketBreakdown.fixed, 80);
    assert.equal(liveOut.summaries[0].bucketBreakdown['non-monthly'], 320);
    // Live Categories!A:F overlays onto defaults (preserving 'food') and honors __meta_deleted_categories__ ('entertainment')
    const liveCatIds = new Set(liveOut.categories.map(c => c.id));
    assert.ok(liveCatIds.has('custom-gym'));
    assert.ok(liveCatIds.has('food'));
    assert.ok(!liveCatIds.has('entertainment'));
    // __meta_ingest_state__ and __meta_deleted_categories__ excluded from user notes
    assert.equal(Object.keys(liveOut.notes).length, 1);
    assert.equal(liveOut.notes['2026-07:__overall__'].text, 'Summer trip month');
    assert.equal(liveOut.locks.length, 1);
    assert.equal(liveOut.locks[0].month, '2026-06');
  });
});

test('P1-8: restoreWorkspaceSnapshot batches Categories, Notes, and Locks into O(1) PUTs per tab on GoogleSheetsAdapter', async () => {
  const { GoogleSheetsAdapter, DEFAULT_CATEGORIES } = await import(
    pathToFileURL(path.join(repoRoot, 'src/services/storage.ts')).href
  );
  const { parseAndValidateWorkspaceSnapshot, restoreWorkspaceSnapshot } = await import(
    pathToFileURL(path.join(repoRoot, 'src/utils/workspacePortability.ts')).href
  );

  globalThis.localStorage.setItem(
    'expense_google_projects',
    JSON.stringify([{ id: 'sheet-batch', name: 'Batch Test', spreadsheetId: 'sheet-batch' }])
  );

  let putCount = 0;
  let storedNotesRows = [
    ['key', 'note'],
    [
      '__meta_ingest_state__',
      JSON.stringify({
        text: JSON.stringify({ version: 1, tombstones: ['keep-me'], sources: {}, recentRuns: [] }),
        updatedAt: '2026-07-01T00:00:00Z',
      }),
    ],
  ];
  let storedCatRows = [['id', 'name', 'color', 'emoji', 'parentId', 'defaultBucket']];
  let storedLockRows = [
    ['month', 'locked', 'lockedAt'],
    ['2026-05', 'true', '2026-06-01T00:00:00Z'],
    ['2026-06', 'true', '2026-07-01T00:00:00Z'],
  ];

  const origFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    const urlStr = String(url);
    const method = (init?.method || 'GET').toUpperCase();
    if (urlStr.includes('drive/v3/files/sheet-batch')) {
      return { ok: true, json: async () => ({ modifiedTime: '2026-07-15T00:00:00Z' }), text: async () => '{}' };
    }
    if (method === 'GET') {
      const payload = {
        valueRanges: [
          { values: [['id', 'date', 'category', 'subCategory', 'amount', 'type', 'description', 'notes', 'labels', 'hash', 'spendingBucket', 'meta']] },
          { values: storedCatRows },
          { values: [['category', 'amount']] },
          { values: storedLockRows },
          { values: storedNotesRows },
        ],
      };
      return { ok: true, json: async () => payload, text: async () => JSON.stringify(payload) };
    }
    if (method === 'PUT') {
      putCount += 1;
      const body = JSON.parse(init.body);
      if (urlStr.includes('Notes!')) storedNotesRows = body.values;
      if (urlStr.includes('Categories!')) storedCatRows = body.values;
      if (urlStr.includes('Locks!')) storedLockRows = body.values;
    }
    return { ok: true, json: async () => ({}), text: async () => '{}' };
  };

  try {
    const adapter = new GoogleSheetsAdapter(() => 'mock-token');
    const manyNotes = Object.fromEntries(
      Array.from({ length: 10 }, (_, i) => [
        `2026-07:cat-${i}`,
        { text: `Note ${i}`, updatedAt: '2026-07-15T00:00:00Z' },
      ])
    );
    const snapshot = {
      schemaVersion: 1,
      exportedAt: '2026-07-15T00:00:00Z',
      project: { id: 'sheet-batch', name: 'Batch Test' },
      transactions: [
        {
          id: 'tx-1',
          date: '2026-07-15',
          category: 'food',
          subCategory: null,
          amount: 12.5,
          type: 'expense',
          description: 'Cafe',
          notes: '',
          labels: [],
          hash: 'h-1',
        },
      ],
      categories: DEFAULT_CATEGORIES.slice(0, 15),
      budgets: [{ category: 'food', amount: 400 }],
      notes: manyNotes,
      locks: [
        { month: '2026-05', locked: true, lockedAt: '2026-06-01T00:00:00Z' },
        { month: '2026-06', locked: false },
      ],
    };

    const parsed = parseAndValidateWorkspaceSnapshot(JSON.stringify(snapshot));
    assert.equal(parsed.ok, true);
    await restoreWorkspaceSnapshot(adapter, 'sheet-batch', parsed);

    // 1 unlock PUT + 1 Notes PUT + 1 Categories PUT + 1 Notes(__meta_deleted_categories__) PUT + 1 Transactions PUT + 1 Budgets PUT + 1 Locks PUT = 7 PUTs (vs 35+ unbatched!)
    assert.ok(putCount <= 8, `Expected <= 8 batched PUTs, got ${putCount}`);
    // Existing __meta_ingest_state__ in Notes!A:B must be preserved!
    assert.ok(
      storedNotesRows.some(row => row[0] === '__meta_ingest_state__'),
      '__meta_ingest_state__ must be preserved across batched saveBudgetNotes'
    );
    assert.equal(storedCatRows.length, 16); // header + 15 categories
  } finally {
    globalThis.fetch = origFetch;
  }
});
