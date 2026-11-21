import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..');

const { GoogleSheetsAdapter } = await import(
  pathToFileURL(path.join(repoRoot, 'src/services/storage.ts')).href
);

function makeJsonResponse(status, body) {
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => text,
    json: async () => (text ? JSON.parse(text) : {}),
  };
}

test('P0-B1: GoogleSheetsAdapter deduplicates concurrent cold-load batchGet calls', async () => {
  globalThis.localStorage.setItem(
    'expense_google_projects',
    JSON.stringify([{ id: 'dedup-proj', name: 'Dedup', spreadsheetId: 'sheet-dedup' }])
  );
  const origFetch = globalThis.fetch;
  let batchGetCalls = 0;

  globalThis.fetch = async (url) => {
    const u = String(url);
    if (u.includes('/drive/v3/files/sheet-dedup?fields=modifiedTime')) {
      return makeJsonResponse(200, { modifiedTime: '2026-11-20T08:00:00.000Z' });
    }
    if (u.includes('/values:batchGet')) {
      batchGetCalls += 1;
      await new Promise((r) => setTimeout(r, 20));
      return makeJsonResponse(200, {
        valueRanges: [
          { values: [['id', 'date', 'category', 'subCategory', 'amount', 'type', 'description', 'notes', 'labels', 'hash', 'spendingBucket', 'meta']] },
          { values: [['id', 'name', 'color', 'emoji', 'parentId', 'defaultBucket']] },
          { values: [['category', 'amount']] },
          { values: [['month', 'locked', 'lockedAt']] },
          { values: [['key', 'note']] },
        ],
      });
    }
    return makeJsonResponse(200, {});
  };

  try {
    const adapter = new GoogleSheetsAdapter(() => 'tok-1');
    await Promise.all([
      adapter.getTransactions('dedup-proj'),
      adapter.getCategories('dedup-proj'),
      adapter.getBudgets('dedup-proj'),
      adapter.getLocks('dedup-proj'),
      adapter.getIngestState('dedup-proj'),
    ]);
    assert.equal(batchGetCalls, 1, 'Expected 5 concurrent reads to coalesce into 1 batchGet call');
  } finally {
    globalThis.fetch = origFetch;
  }
});

test('P0-B2: GoogleSheetsAdapter detects external Spark sync via Drive modifiedTime and merges instead of clobbering', async () => {
  globalThis.localStorage.setItem(
    'expense_google_projects',
    JSON.stringify([{ id: 'sync-proj', name: 'Sync', spreadsheetId: 'sheet-sync' }])
  );
  const origFetch = globalThis.fetch;

  let remoteModTime = '2026-11-20T07:00:00.000Z';
  let remoteTxRows = [
    ['id', 'date', 'category', 'subCategory', 'amount', 'type', 'description', 'notes', 'labels', 'hash', 'spendingBucket', 'meta'],
    ['tx-existing', '2026-11-19', 'food', 'food-takeout', 15, 'expense', 'Chipotle', '', '[]', 'h1', 'flexible', '{}'],
  ];

  globalThis.fetch = async (url, init) => {
    const u = String(url);
    const method = (init?.method || 'GET').toUpperCase();
    if (u.includes('/drive/v3/files/sheet-sync?fields=modifiedTime')) {
      return makeJsonResponse(200, { modifiedTime: remoteModTime });
    }
    if (u.includes('/values:batchGet')) {
      return makeJsonResponse(200, {
        valueRanges: [
          { values: remoteTxRows.map((r) => [...r]) },
          { values: [['id', 'name', 'color', 'emoji', 'parentId', 'defaultBucket']] },
          { values: [['category', 'amount']] },
          { values: [['month', 'locked', 'lockedAt']] },
          { values: [['key', 'note']] },
        ],
      });
    }
    if (method === 'PUT' && u.includes('/values/Transactions!')) {
      const parsed = JSON.parse(String(init?.body || '{}'));
      remoteTxRows = parsed.values;
      remoteModTime = '2026-11-20T09:05:00.000Z';
      return makeJsonResponse(200, { updatedRows: remoteTxRows.length });
    }
    return makeJsonResponse(200, {});
  };

  try {
    const adapter = new GoogleSheetsAdapter(() => 'tok-2');
    // 1. User opens tab at 7:00 AM
    const initial = await adapter.getTransactions('sync-proj');
    assert.equal(initial.length, 1);

    // 2. At 8:00 AM, Gemini Spark externally appends a new transaction and advances Drive modifiedTime
    remoteTxRows.push([
      'tx-spark-8am',
      '2026-11-20',
      'groceries',
      'groceries-supermarket',
      42.5,
      'expense',
      'Trader Joes',
      'Bilt Palladium (7702)',
      '[]',
      'h-spark',
      'flexible',
      JSON.stringify({ sources: ['gpay-plaid'], account: 'bilt' }),
    ]);
    remoteModTime = '2026-11-20T08:00:05.000Z';

    // 3. At 9:00 AM, user edits tx-existing in their still-open tab
    await adapter.saveTransaction('sync-proj', {
      ...initial[0],
      notes: 'Lunch with team',
    });

    // Both tx-existing (edited) AND tx-spark-8am (from external Spark run) MUST be preserved!
    const idsInSheet = remoteTxRows.slice(1).map((r) => r[0]);
    assert.deepEqual(idsInSheet, ['tx-existing', 'tx-spark-8am']);
    assert.equal(remoteTxRows[1][7], 'Lunch with team');
  } finally {
    globalThis.fetch = origFetch;
  }
});

test('P0-B3: GoogleSheetsAdapter does not silently drop Notes on 500, rethrows Notes write failures, preserves __meta_ingest_lock__, and persists Categories!A:F defaultBucket', async () => {
  globalThis.localStorage.setItem(
    'expense_google_projects',
    JSON.stringify([{ id: 'safe-proj', name: 'Safe', spreadsheetId: 'sheet-safe' }])
  );
  const origFetch = globalThis.fetch;
  let failBatchGet500 = true;
  let failNotesPut429 = false;

  let storedCatRows = [
    ['id', 'name', 'color', 'emoji', 'parentId', 'defaultBucket'],
  ];
  let storedNotesRows = [
    ['key', 'note'],
    [
      '__meta_ingest_lock__',
      JSON.stringify({
        text: JSON.stringify({ holderId: 'spark-cron', expiresAt: '2099-01-01T00:00:00Z' }),
        updatedAt: '2026-11-20T08:00:00Z',
      }),
    ],
  ];

  globalThis.fetch = async (url, init) => {
    const u = String(url);
    const method = (init?.method || 'GET').toUpperCase();
    if (u.includes('/drive/v3/files/sheet-safe?fields=modifiedTime')) {
      return makeJsonResponse(200, { modifiedTime: '2026-11-20T08:00:00Z' });
    }
    if (u.includes('/values:batchGet')) {
      if (failBatchGet500) {
        return makeJsonResponse(500, 'Internal Server Error');
      }
      return makeJsonResponse(200, {
        valueRanges: [
          { values: [['id', 'date', 'category', 'subCategory', 'amount', 'type', 'description', 'notes', 'labels', 'hash', 'spendingBucket', 'meta']] },
          { values: storedCatRows.map((r) => [...r]) },
          { values: [['category', 'amount']] },
          { values: [['month', 'locked', 'lockedAt']] },
          { values: storedNotesRows.map((r) => [...r]) },
        ],
      });
    }
    if (method === 'PUT' && u.includes('/values/Categories!')) {
      storedCatRows = JSON.parse(String(init?.body || '{}')).values;
      return makeJsonResponse(200, {});
    }
    if (method === 'PUT' && u.includes('/values/Notes!')) {
      if (failNotesPut429) {
        return makeJsonResponse(429, 'Quota exceeded');
      }
      storedNotesRows = JSON.parse(String(init?.body || '{}')).values;
      return makeJsonResponse(200, {});
    }
    return makeJsonResponse(200, {});
  };

  try {
    const adapter = new GoogleSheetsAdapter(() => 'tok-3');

    // 1. Transient 500 on batchGet MUST throw (not silently fall back without Notes!)
    await assert.rejects(() => adapter.getTransactions('safe-proj'), /API Error 500/);

    // 2. Now succeed load, save a custom category with defaultBucket='fixed', invalidate cache, and reload
    failBatchGet500 = false;
    await adapter.saveCategory('safe-proj', {
      id: 'child-care',
      name: 'Child Care',
      color: '#f5f83a',
      emoji: '👶',
      parentId: null,
      defaultBucket: 'fixed',
    });
    adapter.invalidateCache('safe-proj');
    const reloadedCats = await adapter.getCategories('safe-proj');
    const childCare = reloadedCats.find((c) => c.id === 'child-care');
    assert.ok(childCare);
    assert.equal(childCare.defaultBucket, 'fixed', 'defaultBucket must round-trip via Categories!A:F');

    // 3. saveIngestState MUST preserve __meta_ingest_lock__ in Notes!A:B
    await adapter.saveIngestState('safe-proj', {
      version: 1,
      tombstones: ['abc1234567890123'],
      sources: {},
      recentRuns: [],
    });
    assert.ok(
      storedNotesRows.some((r) => r[0] === '__meta_ingest_lock__'),
      '__meta_ingest_lock__ must not be stripped by saveIngestState'
    );

    // 4. 429 error on Notes write MUST throw (never silently swallowed)
    failNotesPut429 = true;
    await assert.rejects(
      () =>
        adapter.saveIngestState('safe-proj', {
          version: 1,
          tombstones: ['abc1234567890123', 'def4567890123456'],
          sources: {},
          recentRuns: [],
        }),
      /API Error 429/
    );
  } finally {
    globalThis.fetch = origFetch;
  }
});

test('P0-B4: invalidateCache mid-flight epoch guard discards obsolete load and unrelated HTTP 400 does not trigger Notes fallback', async () => {
  globalThis.localStorage.setItem(
    'expense_google_projects',
    JSON.stringify([{ id: 'epoch-proj', name: 'Epoch', spreadsheetId: 'sheet-epoch' }])
  );
  const origFetch = globalThis.fetch;

  let callCount = 0;
  let resolveFirstLoad;
  const firstLoadStarted = new Promise((r) => {
    resolveFirstLoad = r;
  });
  let releaseFirstLoad;
  const firstLoadGate = new Promise((r) => {
    releaseFirstLoad = r;
  });

  globalThis.fetch = async (url) => {
    const u = String(url);
    if (u.includes('/drive/v3/files/sheet-epoch?fields=modifiedTime')) {
      return makeJsonResponse(200, { modifiedTime: callCount <= 1 ? '2026-11-20T07:00:00Z' : '2026-11-20T08:00:00Z' });
    }
    if (u.includes('/values:batchGet')) {
      callCount += 1;
      const myCall = callCount;
      if (myCall === 1) {
        resolveFirstLoad();
        await firstLoadGate;
        return makeJsonResponse(200, {
          valueRanges: [
            {
              values: [
                ['id', 'date', 'category', 'subCategory', 'amount', 'type', 'description', 'notes', 'labels', 'hash', 'spendingBucket', 'meta'],
                ['stale-tx', '2026-11-19', 'food', '', 10, 'expense', 'Stale', '', '[]', 'h-stale', 'flexible', '{}'],
              ],
            },
            { values: [['id', 'name', 'color', 'emoji', 'parentId', 'defaultBucket']] },
            { values: [['category', 'amount']] },
            { values: [['month', 'locked', 'lockedAt']] },
            { values: [['key', 'note']] },
          ],
        });
      }
      return makeJsonResponse(200, {
        valueRanges: [
          {
            values: [
              ['id', 'date', 'category', 'subCategory', 'amount', 'type', 'description', 'notes', 'labels', 'hash', 'spendingBucket', 'meta'],
              ['fresh-tx', '2026-11-20', 'food', '', 25, 'expense', 'Fresh', '', '[]', 'h-fresh', 'flexible', '{}'],
            ],
          },
          { values: [['id', 'name', 'color', 'emoji', 'parentId', 'defaultBucket']] },
          { values: [['category', 'amount']] },
          { values: [['month', 'locked', 'lockedAt']] },
          { values: [['key', 'note']] },
        ],
      });
    }
    return makeJsonResponse(200, {});
  };

  try {
    const adapter = new GoogleSheetsAdapter(() => 'tok-epoch');
    const p1 = adapter.getTransactions('epoch-proj');
    await firstLoadStarted;

    // Invalidate mid-flight and start a newer load #2 that finishes BEFORE load #1
    adapter.invalidateCache('epoch-proj');
    const txs2 = await adapter.getTransactions('epoch-proj');
    assert.deepEqual(txs2.map((t) => t.id), ['fresh-tx']);

    // Release slow obsolete load #1 — it MUST NOT overwrite fresh cache!
    releaseFirstLoad();
    const txs1 = await p1;
    assert.deepEqual(txs1.map((t) => t.id), ['fresh-tx']);

    const afterBoth = await adapter.getTransactions('epoch-proj');
    assert.deepEqual(afterBoth.map((t) => t.id), ['fresh-tx']);

    // Verify unrelated HTTP 400 mentioning "Notes" does NOT fall back without Notes
    adapter.invalidateCache('epoch-proj');
    globalThis.fetch = async (url) => {
      if (String(url).includes('/values:batchGet')) {
        return makeJsonResponse(400, 'Invalid argument: malformed request near Notes field');
      }
      return makeJsonResponse(200, {});
    };
    await assert.rejects(() => adapter.getTransactions('epoch-proj'), /API Error 400/);
  } finally {
    globalThis.fetch = origFetch;
  }
});

