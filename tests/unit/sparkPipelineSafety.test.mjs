import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..');

const walletReconcilePath = path.join(
  repoRoot,
  '.agents/skills/expense-ingest/scripts/wallet_reconcile.py'
);
const cleanupScriptPath = path.join(
  repoRoot,
  '.agents/skills/expense-ingest/scripts/cleanup_sheet_labels.py'
);
const ingestCliPath = path.join(
  repoRoot,
  '.agents/skills/expense-ingest/scripts/ingest_transactions.py'
);

test('P0-A1: wallet_reconcile.py emits value_input RAW, sets tombstoneChunks for >400 tombstones, and clears legacy chunk 5', () => {
  const tmpDir = fs.mkdtempSync('/tmp/nebula-p0-a1-');
  try {
    const inputPath = path.join(tmpDir, 'wallet.json');
    const txJsonPath = path.join(tmpDir, 'txs.json');
    const notesPath = path.join(tmpDir, 'notes.json');
    const batchOutPath = path.join(tmpDir, 'batch.json');

    const inlineTombs = Array.from({ length: 400 }, (_, i) => `tomb_inline_${i}`);
    const chunk1Tombs = Array.from({ length: 400 }, (_, i) => `tomb_c1_${i}`);
    const chunk2Tombs = Array.from({ length: 150 }, (_, i) => `tomb_c2_${i}`);

    fs.writeFileSync(
      txJsonPath,
      JSON.stringify({
        values: [
          ['id', 'date', 'category', 'subCategory', 'amount', 'type', 'description', 'notes', 'labels', 'hash', 'spendingBucket', 'meta'],
          [
            'tx-pending-1',
            '2026-11-18',
            'food',
            'food-dine-in',
            '25.00',
            'expense',
            'Local Bistro',
            'Pending • Bilt Palladium (7702)',
            '[]',
            'oldhash1234567890',
            'flexible',
            JSON.stringify({ provisional: true, account: 'bilt', aliasHashes: ['oldhash123456789'] }),
          ],
        ],
      })
    );

    fs.writeFileSync(
      notesPath,
      JSON.stringify({
        values: [
          ['key', 'note'],
          [
            '__meta_ingest_state__',
            JSON.stringify({
              text: JSON.stringify({ version: 1, tombstones: inlineTombs, sources: {}, recentRuns: [] }),
              updatedAt: '2026-11-18T00:00:00Z',
            }),
          ],
          [
            '__meta_ingest_tombstones_1__',
            JSON.stringify({ text: JSON.stringify(chunk1Tombs), updatedAt: '2026-11-18T00:00:00Z' }),
          ],
          [
            '__meta_ingest_tombstones_2__',
            JSON.stringify({ text: JSON.stringify(chunk2Tombs), updatedAt: '2026-11-18T00:00:00Z' }),
          ],
          [
            '__meta_ingest_tombstones_5__',
            JSON.stringify({ text: JSON.stringify(['legacy_chunk_5']), updatedAt: '2026-11-18T00:00:00Z' }),
          ],
        ],
      })
    );

    fs.writeFileSync(
      inputPath,
      JSON.stringify([
        {
          date: '2026-11-19',
          description: 'Local Bistro',
          amount: 25.0,
          status: 'Purchase',
          account: 'Bilt Palladium (7702)',
        },
        {
          date: '2026-11-20',
          description: '=HYPERLINK("http://evil")',
          amount: 12.34,
          status: 'Purchase',
          account: 'Bilt Palladium (7702)',
        },
      ])
    );

    const res = spawnSync(
      'python3',
      [
        walletReconcilePath,
        '--input',
        inputPath,
        '--transactions-json',
        txJsonPath,
        '--notes-json',
        notesPath,
        '--reference-date',
        '2026-11-20',
        '--batch-out',
        batchOutPath,
      ],
      { encoding: 'utf8' }
    );
    assert.equal(res.status, 0, res.stderr);

    const batch = JSON.parse(fs.readFileSync(batchOutPath, 'utf8'));
    const writeAndAppendOps = batch.filter((op) => op.op === 'write' || op.op === 'append');
    assert.ok(writeAndAppendOps.length >= 4);
    for (const op of writeAndAppendOps) {
      assert.equal(op.value_input, 'RAW', `Expected RAW value_input on op ${JSON.stringify(op)}`);
    }

    const stateOp = batch.find(
      (op) => op.op === 'write' && op.range === 'Notes!A2:B2' && op.data?.[0]?.[0] === '__meta_ingest_state__'
    );
    assert.ok(stateOp, 'Expected __meta_ingest_state__ write op');
    const stateWrapper = JSON.parse(stateOp.data[0][1]);
    const inlineState = JSON.parse(stateWrapper.text);
    assert.equal(inlineState.tombstones.length, 400);
    assert.equal(inlineState.tombstoneChunks, 2);

    // Legacy chunk 5 at row 5 must be cleared
    const clearChunk5 = batch.find((op) => op.op === 'clear' && op.range === 'Notes!A5:B5');
    assert.ok(clearChunk5, 'Expected legacy chunk 5 row to be cleared');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('P0-A2: wallet_reconcile.py TSV loader uses QUOTE_NONE so leading quotes in notes never shift rowNumber', () => {
  const tmpDir = fs.mkdtempSync('/tmp/nebula-p0-a2-');
  try {
    const tsvPath = path.join(tmpDir, 'txs.tsv');
    const inputPath = path.join(tmpDir, 'wallet.json');
    const notesPath = path.join(tmpDir, 'notes.json');

    const header = ['id', 'date', 'category', 'subCategory', 'amount', 'type', 'description', 'notes', 'labels', 'hash', 'spendingBucket', 'meta'].join('\t');
    const row2 = ['tx-1', '2026-11-17', 'shopping', 'shopping-general', '10.00', 'expense', 'Target', '"Unclosed quote in note', '[]', 'hashrow2', 'flexible', '{}'].join('\t');
    const row3 = [
      'tx-2',
      '2026-11-18',
      'food',
      'food-takeout',
      '14.50',
      'expense',
      'Chipotle',
      'Pending • Bilt Palladium (7702)',
      '[]',
      'hashrow3',
      'flexible',
      JSON.stringify({ provisional: true, account: 'bilt' }),
    ].join('\t');
    fs.writeFileSync(tsvPath, `${header}\n${row2}\n${row3}\n`);
    fs.writeFileSync(notesPath, JSON.stringify({ values: [['key', 'note']] }));
    fs.writeFileSync(
      inputPath,
      JSON.stringify([
        {
          date: '2026-11-19',
          description: 'Chipotle',
          amount: 14.5,
          status: 'Purchase',
          account: 'Bilt Palladium (7702)',
        },
      ])
    );

    const res = spawnSync(
      'python3',
      [
        walletReconcilePath,
        '--input',
        inputPath,
        '--transactions-tsv',
        tsvPath,
        '--notes-json',
        notesPath,
        '--reference-date',
        '2026-11-20',
      ],
      { encoding: 'utf8' }
    );
    assert.equal(res.status, 0, res.stderr);
    const plan = JSON.parse(res.stdout);
    assert.equal(plan.summary.updatedPendingToSettled, 1);
    assert.equal(plan.updateOps[0].id, 'tx-2');
    assert.equal(plan.updateOps[0].rowNumber, 3, 'Row number must remain 3 despite unclosed quote on row 2');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('P0-A3: wallet_reconcile.py enforces --locks-json across inserts and settled upgrades, and reports holderId on active lock', () => {
  const tmpDir = fs.mkdtempSync('/tmp/nebula-p0-a3-');
  try {
    const txJsonPath = path.join(tmpDir, 'txs.json');
    const notesPath = path.join(tmpDir, 'notes.json');
    const locksPath = path.join(tmpDir, 'locks.json');
    const inputPath = path.join(tmpDir, 'wallet.json');
    const batchOutPath = path.join(tmpDir, 'batch.json');

    fs.writeFileSync(
      txJsonPath,
      JSON.stringify({
        values: [
          ['id', 'date', 'category', 'subCategory', 'amount', 'type', 'description', 'notes', 'labels', 'hash', 'spendingBucket', 'meta'],
          [
            'tx-oct-pending',
            '2026-10-30',
            'food',
            'food-dine-in',
            '40.00',
            'expense',
            'Osteria',
            'Pending • Bilt Palladium (7702)',
            '[]',
            'octhash123',
            'flexible',
            JSON.stringify({ provisional: true, account: 'bilt' }),
          ],
        ],
      })
    );
    fs.writeFileSync(
      locksPath,
      JSON.stringify({
        values: [
          ['month', 'locked', 'lockedAt'],
          ['2026-10', 'true', '2026-11-01T08:00:00Z'],
        ],
      })
    );
    fs.writeFileSync(notesPath, JSON.stringify({ values: [['key', 'note']] }));
    fs.writeFileSync(
      inputPath,
      JSON.stringify([
        {
          date: '2026-10-31',
          description: 'Osteria',
          amount: 40.0,
          status: 'Purchase',
          account: 'Bilt Palladium (7702)',
        },
        {
          date: '2026-10-31',
          description: 'Trader Joes',
          amount: 55.25,
          status: 'Purchase',
          account: 'Bilt Palladium (7702)',
        },
        {
          date: '2026-11-02',
          description: 'Starbucks',
          amount: 6.75,
          status: 'Purchase',
          account: 'Bilt Palladium (7702)',
        },
      ])
    );

    const res = spawnSync(
      'python3',
      [
        walletReconcilePath,
        '--input',
        inputPath,
        '--transactions-json',
        txJsonPath,
        '--notes-json',
        notesPath,
        '--locks-json',
        locksPath,
        '--reference-date',
        '2026-11-03',
        '--lookback-days',
        '7',
      ],
      { encoding: 'utf8' }
    );
    assert.equal(res.status, 0, res.stderr);
    const plan = JSON.parse(res.stdout);
    assert.equal(plan.summary.skippedLockedMonth, 2);
    assert.equal(plan.summary.updatedPendingToSettled, 0);
    assert.equal(plan.summary.inserted, 1);
    assert.equal(plan.deferredLocked.length, 2);
    assert.match(plan.digestMarkdown, /Skipped \(Locked Month/);

    // Verify active lease lock displays holderId properly
    const lockedNotesPath = path.join(tmpDir, 'locked_notes.json');
    fs.writeFileSync(
      lockedNotesPath,
      JSON.stringify({
        values: [
          ['key', 'note'],
          [
            '__meta_ingest_lock__',
            JSON.stringify({
              text: JSON.stringify({ holderId: 'spark-job-99', expiresAt: '2099-01-01T00:00:00Z' }),
              updatedAt: '2026-11-03T00:00:00Z',
            }),
          ],
        ],
      })
    );
    const lockedRes = spawnSync(
      'python3',
      [
        walletReconcilePath,
        '--input',
        inputPath,
        '--transactions-json',
        txJsonPath,
        '--notes-json',
        lockedNotesPath,
        '--batch-out',
        batchOutPath,
      ],
      { encoding: 'utf8' }
    );
    assert.equal(lockedRes.status, 3);
    assert.match(lockedRes.stderr, /spark-job-99/);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('P0-A4: cleanup_sheet_labels.py emits value_input RAW and ingest_transactions.py preserves workspace snapshot fields', () => {
  const tmpDir = fs.mkdtempSync('/tmp/nebula-p0-a4-');
  try {
    // 1. cleanup_sheet_labels.py RAW check
    const txGridPath = path.join(tmpDir, 'cleanup_txs.json');
    fs.writeFileSync(
      txGridPath,
      JSON.stringify({
        values: [
          ['id', 'date', 'category', 'subCategory', 'amount', 'type', 'description', 'notes', 'labels', 'hash', 'spendingBucket', 'meta'],
          ['tx-1', '2026-11-10', 'food', 'food-takeout', '12.00', 'expense', 'Chipotle', '', '["bilt","flexible"]', 'h1', '', '{}'],
        ],
      })
    );
    const cleanupBatchPath = path.join(tmpDir, 'cleanup_batch.json');
    const cleanupRes = spawnSync(
      'python3',
      [cleanupScriptPath, '--transactions-json', txGridPath, '--batch-out', cleanupBatchPath],
      { encoding: 'utf8' }
    );
    assert.equal(cleanupRes.status, 0, cleanupRes.stderr);
    const cleanupBatchOps = JSON.parse(fs.readFileSync(cleanupBatchPath, 'utf8'));
    assert.ok(cleanupBatchOps.length > 0);
    for (const op of cleanupBatchOps) {
      assert.equal(op.value_input, 'RAW');
    }

    // 2. ingest_transactions.py preserves budgets/notes/locks/project/schemaVersion in --state-file
    const statePath = path.join(tmpDir, 'workspace_state.json');
    fs.writeFileSync(
      statePath,
      JSON.stringify({
        schemaVersion: 2,
        project: { id: 'personal-finances', name: 'Personal Finances' },
        budgets: [{ category: 'food', amount: 650 }],
        notes: { '2026-11:__overall__': { text: 'Keep me', updatedAt: '2026-11-01T00:00:00Z' } },
        locks: [{ month: '2026-09', locked: true, lockedAt: '2026-10-01T00:00:00Z' }],
        transactions: [],
        categories: [],
        ingestState: { version: 1, tombstones: [], sources: {}, recentRuns: [] },
      })
    );

    const cliRes = spawnSync(
      'python3',
      [ingestCliPath, '--state-file', statePath, '--skip-llm'],
      {
        input: JSON.stringify([{ externalId: 'ext-keep-1', date: '2026-11-15', description: 'Chipotle', amount: 15.0 }]),
        encoding: 'utf8',
      }
    );
    assert.equal(cliRes.status, 0, cliRes.stderr);
    const updatedState = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    assert.equal(updatedState.schemaVersion, 2);
    assert.deepEqual(updatedState.project, { id: 'personal-finances', name: 'Personal Finances' });
    assert.deepEqual(updatedState.budgets, [{ category: 'food', amount: 650 }]);
    assert.deepEqual(updatedState.locks, [{ month: '2026-09', locked: true, lockedAt: '2026-10-01T00:00:00Z' }]);
    assert.equal(updatedState.notes['2026-11:__overall__'].text, 'Keep me');
    assert.equal(updatedState.transactions.length, 1);

    // 3. Partial state-file `{}` must NOT leak mock SEED_TRANSACTIONS or legacy SEED_CATEGORIES
    const partialPath = path.join(tmpDir, 'partial_state.json');
    fs.writeFileSync(partialPath, JSON.stringify({}));
    const partialRes = spawnSync(
      'python3',
      [ingestCliPath, '--state-file', partialPath, '--skip-llm'],
      {
        input: JSON.stringify([{ externalId: 'ext-partial-1', date: '2026-11-16', description: 'Starbucks', amount: 5.5 }]),
        encoding: 'utf8',
      }
    );
    assert.equal(partialRes.status, 0, partialRes.stderr);
    const partialState = JSON.parse(fs.readFileSync(partialPath, 'utf8'));
    assert.equal(partialState.transactions.length, 1, 'Partial state-file must not leak demo SEED_TRANSACTIONS');
    assert.ok(
      !partialState.categories.some((c) => c.id === 'salary' || c.id === 'rent'),
      'Partial state-file must not leak legacy SEED_CATEGORIES'
    );
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('P0-A5: fail-fast on missing --locks-json/--notes-json, shrink tombstones to 0 chunks, and clear duplicate chunk rows', () => {
  const tmpDir = fs.mkdtempSync('/tmp/nebula-p0-a5-');
  try {
    const inputPath = path.join(tmpDir, 'wallet.json');
    const notesPath = path.join(tmpDir, 'notes.json');
    const batchOutPath = path.join(tmpDir, 'batch.json');
    fs.writeFileSync(inputPath, JSON.stringify([]));

    // 1. Missing --locks-json must fail fast (never fail open)
    fs.writeFileSync(notesPath, JSON.stringify({ values: [['key', 'note']] }));
    const missingLocks = spawnSync(
      'python3',
      [walletReconcilePath, '--input', inputPath, '--notes-json', notesPath, '--locks-json', path.join(tmpDir, 'nope.json')],
      { encoding: 'utf8' }
    );
    assert.notEqual(missingLocks.status, 0, 'Missing --locks-json must fail fast');

    // 2. Missing --notes-json must fail fast
    const missingNotes = spawnSync(
      'python3',
      [walletReconcilePath, '--input', inputPath, '--notes-json', path.join(tmpDir, 'nope_notes.json')],
      { encoding: 'utf8' }
    );
    assert.notEqual(missingNotes.status, 0, 'Missing --notes-json must fail fast');

    // 3. Shrink tombstones <= 400 clears overflow chunk row AND duplicate chunk row, setting tombstoneChunks: 0
    fs.writeFileSync(
      notesPath,
      JSON.stringify({
        values: [
          ['key', 'note'],
          [
            '__meta_ingest_state__',
            JSON.stringify({
              text: JSON.stringify({ version: 1, tombstones: ['t1', 't2'], sources: {}, recentRuns: [] }),
              updatedAt: '2026-11-18T00:00:00Z',
            }),
          ],
          [
            '__meta_ingest_tombstones_1__',
            JSON.stringify({ text: JSON.stringify(['t3']), updatedAt: '2026-11-18T00:00:00Z' }),
          ],
          [
            '__meta_ingest_tombstones_1__',
            JSON.stringify({ text: JSON.stringify(['t4']), updatedAt: '2026-11-18T00:00:00Z' }),
          ],
        ],
      })
    );
    const shrinkRes = spawnSync(
      'python3',
      [
        walletReconcilePath,
        '--input',
        inputPath,
        '--notes-json',
        notesPath,
        '--reference-date',
        '2026-11-20',
        '--batch-out',
        batchOutPath,
      ],
      { encoding: 'utf8' }
    );
    assert.equal(shrinkRes.status, 0, shrinkRes.stderr);
    const batch = JSON.parse(fs.readFileSync(batchOutPath, 'utf8'));
    const stateOp = batch.find((op) => op.op === 'write' && op.range === 'Notes!A2:B2');
    const inlineState = JSON.parse(JSON.parse(stateOp.data[0][1]).text);
    assert.equal(inlineState.tombstoneChunks, 0);
    assert.deepEqual(inlineState.tombstones, ['t1', 't2', 't3', 't4']);
    assert.ok(batch.some((op) => op.op === 'clear' && op.range === 'Notes!A3:B3'), 'Old chunk 1 row must be cleared');
    assert.ok(batch.some((op) => op.op === 'clear' && op.range === 'Notes!A4:B4'), 'Duplicate chunk 1 row must be cleared');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('P0-A6: locked-month edge cases (Step 2 exact pending, Step 4 tip drift, settled dup stays duplicate, userEdited date allowed, --override-locks)', async () => {
  const tmpDir = fs.mkdtempSync('/tmp/nebula-p0-a6-');
  try {
    const txJsonPath = path.join(tmpDir, 'txs.json');
    const notesPath = path.join(tmpDir, 'notes.json');
    const locksPath = path.join(tmpDir, 'locks.json');
    const inputPath = path.join(tmpDir, 'wallet.json');

    // Compute exact SHA-256 hashes matching wallet_reconcile.py
    const crypto = await import('node:crypto');
    const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
    const exactPendingHash = sha('2026-10-30|cafe luna|12.00|expense');
    const settledDupHash = sha('2026-10-29|safeway|50.00|expense');

    fs.writeFileSync(
      txJsonPath,
      JSON.stringify({
        values: [
          ['id', 'date', 'category', 'subCategory', 'amount', 'type', 'description', 'notes', 'labels', 'hash', 'spendingBucket', 'meta'],
          ['tx-exact-pend', '2026-10-30', 'food', 'food-takeout', '12.00', 'expense', 'Cafe Luna', 'Pending • Bilt Palladium (7702)', '[]', exactPendingHash, 'flexible', JSON.stringify({ provisional: true, account: 'bilt' })],
          ['tx-settled-dup', '2026-10-29', 'groceries', 'groceries-supermarket', '50.00', 'expense', 'Safeway', 'Bilt Palladium (7702)', '[]', settledDupHash, 'flexible', JSON.stringify({ provisional: false, account: 'bilt' })],
          ['tx-tip-pend', '2026-10-30', 'food', 'food-dine-in', '40.00', 'expense', 'Sushi Bar', 'Pending • Bilt Palladium (7702)', '[]', 'tipoldhash', 'flexible', JSON.stringify({ provisional: true, account: 'bilt' })],
          ['tx-user-date', '2026-11-01', 'food', 'food-dine-in', '30.00', 'expense', 'Taco Place', 'Pending • Bilt Palladium (7702)', '[]', 'userdatehash', 'flexible', JSON.stringify({ provisional: true, account: 'bilt', userEdited: ['date'] })],
        ],
      })
    );
    fs.writeFileSync(
      locksPath,
      JSON.stringify({
        values: [
          ['month', 'locked', 'lockedAt'],
          ['2026-10', 'TRUE', '2026-11-01T08:00:00Z'],
          ['2026-11', 'false', ''],
        ],
      })
    );
    fs.writeFileSync(notesPath, JSON.stringify({ values: [['key', 'note']] }));
    fs.writeFileSync(
      inputPath,
      JSON.stringify([
        { date: '2026-10-30', description: 'Cafe Luna', amount: 12.0, status: 'Purchase', account: 'Bilt Palladium (7702)' },
        { date: '2026-10-29', description: 'Safeway', amount: 50.0, status: 'Purchase', account: 'Bilt Palladium (7702)' },
        { date: '2026-10-31', description: 'Sushi Bar', amount: 48.0, status: 'Purchase', account: 'Bilt Palladium (7702)' },
        { date: '2026-10-31', description: 'Taco Place', amount: 30.0, status: 'Purchase', account: 'Bilt Palladium (7702)' },
      ])
    );

    const res = spawnSync(
      'python3',
      [
        walletReconcilePath,
        '--input',
        inputPath,
        '--transactions-json',
        txJsonPath,
        '--notes-json',
        notesPath,
        '--locks-json',
        locksPath,
        '--reference-date',
        '2026-11-02',
        '--lookback-days',
        '7',
      ],
      { encoding: 'utf8' }
    );
    assert.equal(res.status, 0, res.stderr);
    const plan = JSON.parse(res.stdout);
    // Cafe Luna (Step 2 exact pending in locked 2026-10) + Sushi Bar (Step 4 tip drift in locked 2026-10) -> deferred
    assert.equal(plan.summary.skippedLockedMonth, 2);
    assert.ok(plan.deferredLocked.some((d) => d.description === 'Cafe Luna' && d.action === 'updated_pending_to_settled'));
    assert.ok(plan.deferredLocked.some((d) => d.description === 'Sushi Bar' && d.action === 'merged_tip_adjusted'));
    // Safeway (already settled in locked 2026-10) -> skipped_exact_duplicate (NOT skipped_locked_month)
    assert.equal(plan.summary.skippedDuplicate, 1);
    // Taco Place (in unlocked 2026-11 with userEdited: ['date']) -> settles cleanly without touching locked 2026-10
    assert.equal(plan.summary.updatedPendingToSettled, 1);
    assert.equal(plan.updateOps[0].tx.date, '2026-11-01');

    // With --override-locks, all 3 pending rows settle/tip-adjust
    const overrideRes = spawnSync(
      'python3',
      [
        walletReconcilePath,
        '--input',
        inputPath,
        '--transactions-json',
        txJsonPath,
        '--notes-json',
        notesPath,
        '--locks-json',
        locksPath,
        '--override-locks',
        '--reference-date',
        '2026-11-02',
        '--lookback-days',
        '7',
      ],
      { encoding: 'utf8' }
    );
    assert.equal(overrideRes.status, 0, overrideRes.stderr);
    const overridePlan = JSON.parse(overrideRes.stdout);
    assert.equal(overridePlan.summary.skippedLockedMonth, 0);
    assert.equal(overridePlan.summary.updatedPendingToSettled, 2);
    assert.equal(overridePlan.summary.mergedTipAdjusted, 1);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('P0-A7: export_expense_context.py handles UTF-8 BOM, unclosed quotes, and CRLF in TSV mode', () => {
  const tmpDir = fs.mkdtempSync('/tmp/nebula-p0-a7-');
  const exportScript = path.join(repoRoot, '.agents/skills/expense-qna/scripts/export_expense_context.py');
  try {
    const tsvPath = path.join(tmpDir, 'bom_quotes.tsv');
    const header = '\uFEFFid\tdate\tcategory\tsubCategory\tamount\ttype\tdescription\tnotes\tlabels\thash\tspendingBucket\tmeta';
    const row1 = 'tx-1\t2026-11-05\tfood\tfood-takeout\t20.00\texpense\tChipotle\t"Unclosed quote\t[]\th1\tflexible\t{}';
    const row2 = 'tx-2\t2026-11-06\tfood\tfood-dine-in\t30.00\texpense\tOsteria\tNormal note\t[]\th2\tflexible\t{}';
    fs.writeFileSync(tsvPath, `${header}\r\n${row1}\r\n${row2}\r\n`);

    const res = spawnSync(
      'python3',
      [exportScript, '--tsv', tsvPath, '--month', '2026-11', '--scope', 'month', '--json'],
      { encoding: 'utf8' }
    );
    assert.equal(res.status, 0, res.stderr);
    const parsed = JSON.parse(res.stdout);
    const novSummary = parsed.summaries.find((s) => s.month === '2026-11');
    assert.ok(novSummary, 'Expected 2026-11 summary');
    assert.equal(novSummary.totalExpenses, 50);
    assert.equal(novSummary.transactionCount, 2);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

