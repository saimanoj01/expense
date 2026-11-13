import type { AppRoute, BreadcrumbItem } from '../types/navigation';
import { DEFAULT_CATEGORIES, type Category, type SpendingBucket } from '../services/storage';
import { suggestSpendingBucket } from './categorizer';
import { doesBudgetMatchCategory, getCategoryAliasOptions } from './metrics';

function findCategoryCaseInsensitive(
  categoryId: string,
  categories: Category[] = []
): Category | undefined {
  const allCats = [...categories, ...DEFAULT_CATEGORIES];
  const aliasOpts = getCategoryAliasOptions(allCats);
  return (
    categories.find(c => doesBudgetMatchCategory(categoryId, c, aliasOpts)) ||
    DEFAULT_CATEGORIES.find(c => doesBudgetMatchCategory(categoryId, c, aliasOpts))
  );
}

export function getCurrentLocalMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

export function formatMonthLabel(monthKey?: string): string {
  if (!monthKey || monthKey === 'all') return 'All Time';
  const parts = monthKey.split('-');
  if (parts.length !== 2) return monthKey;
  const year = parts[0];
  const monthIdx = parseInt(parts[1], 10) - 1;
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[monthIdx] || parts[1]} ${year}`;
}

export function getBucketLabel(bucketId?: string): string {
  switch (bucketId?.toLowerCase()) {
    case 'fixed':
      return 'Fixed Commitments';
    case 'variable':
    case 'flexible':
      return 'Variable Spending';
    case 'non-monthly':
    case 'nonmonthly':
    case 'irregular':
      return 'Non-Monthly Irregular';
    case 'income':
    case 'inflow':
      return 'Inflow & Income';
    default:
      return bucketId ? bucketId.charAt(0).toUpperCase() + bucketId.slice(1) : 'Spending Bucket';
  }
}

const VALID_MONTH_RE = /^(?:\d{4}-(0[1-9]|1[0-2])|all)$/;
const VALID_BUCKETS = new Set([
  'fixed',
  'flexible',
  'variable',
  'non-monthly',
  'nonmonthly',
  'irregular',
  'income',
  'inflow',
]);

export function parseHash(hashString: string, fallbackMonth: string = getCurrentLocalMonth()): AppRoute {
  let hash = hashString;
  if (hash.startsWith('#')) hash = hash.slice(1);
  if (hash.startsWith('/')) hash = hash.slice(1);

  // Ignore OAuth tokens
  if (hash.includes('access_token=') || hash.includes('error=')) {
    return { view: 'overview', level: 1, month: fallbackMonth };
  }

  // Handle query params e.g. #/dashboard?project=123&month=2026-11
  let path = hash;
  let queryString = '';
  if (hash.includes('?')) {
    const parts = hash.split('?');
    path = parts[0];
    queryString = parts[1];
  }
  const queryParams = new URLSearchParams(queryString);
  const queryMonth = queryParams.get('month');
  const validQueryMonth = queryMonth && VALID_MONTH_RE.test(queryMonth) ? queryMonth : fallbackMonth;
  const queryProject = queryParams.get('project');

  // Strip trailing slashes
  path = path.replace(/\/+$/, '');

  // Secondary views
  if (path === 'budgets') {
    return { view: 'budgets', level: 1, month: validQueryMonth };
  }
  if (path === 'trends') {
    return { view: 'trends', level: 1, month: validQueryMonth };
  }
  if (path === 'reports') {
    return { view: 'reports', level: 1, month: validQueryMonth };
  }
  if (path === 'settings') {
    return { view: 'settings', level: 1, month: validQueryMonth };
  }
  if (path === 'transactions') {
    return { view: 'transactions', level: 4, month: validQueryMonth };
  }

  // Legacy dashboard / projects route compatibility: redirect to canonical overview
  if (path === 'dashboard' || path === 'projects' || path === '') {
    return {
      view: 'overview',
      level: 1,
      month: validQueryMonth,
      projectId: queryProject || undefined
    };
  }

  const segments = path.split('/').filter(Boolean);

  // Normalize segments:
  // Can be: ['month', '2026-11', ...] OR ['2026-11', ...]
  let month = fallbackMonth;
  let rest = segments;

  if (segments[0] === 'month' && segments.length > 1) {
    month = VALID_MONTH_RE.test(segments[1]) ? segments[1] : fallbackMonth;
    rest = segments.slice(2);
  } else if (VALID_MONTH_RE.test(segments[0])) {
    month = segments[0];
    rest = segments.slice(1);
  }

  // If no more segments: Canonical Level 1 Overview
  if (rest.length === 0) {
    return { view: 'overview', level: 1, month };
  }

  // Level 4 month transactions: #/month/:month/transactions
  if (rest[0] === 'transactions') {
    return { view: 'transactions', level: 4, month };
  }

  // Level 2 Bucket: #/month/:month/bucket/:bucketId
  if (rest[0] === 'bucket' && rest[1]) {
    const bucketId = rest[1].toLowerCase();
    if (!VALID_BUCKETS.has(bucketId)) {
      return { view: 'overview', level: 1, month };
    }
    return { view: 'bucket', level: 2, month, bucketId };
  }

  // Level 3 Category: #/month/:month/category/:catId
  // or Level 4 Category txns: #/month/:month/category/:catId/transactions
  if (rest[0] === 'category' && rest[1]) {
    let categoryId = rest[1];
    try {
      categoryId = decodeURIComponent(rest[1]);
    } catch {
      categoryId = rest[1];
    }
    const rawFromBucket = queryParams.get('fromBucket')?.toLowerCase();
    const validFromBucket =
      rawFromBucket && VALID_BUCKETS.has(rawFromBucket) ? rawFromBucket : undefined;
    if (rest[2] === 'transactions') {
      return {
        view: 'transactions',
        level: 4,
        month,
        categoryId,
        isCategoryTransactions: true,
        ...(validFromBucket ? { bucketId: validFromBucket } : {}),
      };
    }
    return {
      view: 'category',
      level: 3,
      month,
      categoryId,
      ...(validFromBucket ? { bucketId: validFromBucket } : {}),
    };
  }

  return { view: 'overview', level: 1, month };
}

export function routeToHash(route: AppRoute, defaultMonth: string = getCurrentLocalMonth()): string {
  const month = route.month || defaultMonth;

  switch (route.view) {
    case 'budgets':
      return `#/budgets?month=${month}`;
    case 'trends':
      return `#/trends?month=${month}`;
    case 'reports':
      return `#/reports?month=${month}`;
    case 'settings':
      return `#/settings?month=${month}`;
    case 'transactions':
      if (route.categoryId && route.isCategoryTransactions) {
        return `#/month/${month}/category/${encodeURIComponent(route.categoryId)}/transactions`;
      }
      return `#/transactions?month=${month}`;
    case 'category': {
      const encodedCat = encodeURIComponent(route.categoryId || 'misc');
      const bucketQuery =
        route.bucketId && VALID_BUCKETS.has(route.bucketId.toLowerCase())
          ? `?fromBucket=${route.bucketId.toLowerCase()}`
          : '';
      return `#/month/${month}/category/${encodedCat}${bucketQuery}`;
    }
    case 'bucket':
      return `#/month/${month}/bucket/${route.bucketId || 'variable'}`;
    case 'overview':
    default:
      return `#/month/${month}`;
  }
}

export function computeParentRoute(route: AppRoute, categories: Category[] = []): AppRoute {
  const month = route.month || getCurrentLocalMonth();

  // Secondary views go back to Level 1
  if (['budgets', 'trends', 'reports', 'settings'].includes(route.view)) {
    return { view: 'overview', level: 1, month };
  }

  // Level 4: category transactions -> Level 3 category
  if (route.view === 'transactions' && route.categoryId) {
    return {
      view: 'category',
      level: 3,
      month,
      categoryId: route.categoryId,
      ...(route.bucketId ? { bucketId: route.bucketId } : {}),
    };
  }

  // Level 4: month transactions -> Level 1 overview
  if (route.view === 'transactions') {
    return { view: 'overview', level: 1, month };
  }

  // Level 3: category -> Level 2 bucket
  if (route.view === 'category' && route.categoryId) {
    if (route.bucketId && VALID_BUCKETS.has(route.bucketId.toLowerCase())) {
      return { view: 'bucket', level: 2, month, bucketId: route.bucketId.toLowerCase() };
    }
    const cat = findCategoryCaseInsensitive(route.categoryId, categories);
    const bucketId: SpendingBucket =
      cat?.defaultBucket || suggestSpendingBucket('', cat?.id || route.categoryId);
    return { view: 'bucket', level: 2, month, bucketId };
  }

  // Level 2: bucket -> Level 1 overview
  if (route.view === 'bucket') {
    return { view: 'overview', level: 1, month };
  }

  // Level 1 -> stay at overview
  return { view: 'overview', level: 1, month };
}

export function buildBreadcrumbs(
  route: AppRoute,
  categories: Category[] = [],
  txnCounts?: { categoryTxnCount?: number; monthTxnCount?: number }
): BreadcrumbItem[] {
  const items: BreadcrumbItem[] = [];
  const month = route.month || getCurrentLocalMonth();

  // Level 1: Month Overview root
  const monthLabel = formatMonthLabel(month);
  const overviewRoute: AppRoute = { view: 'overview', level: 1, month };

  if (route.view === 'overview') {
    items.push({
      id: 'month-overview',
      label: monthLabel,
      route: overviewRoute,
      isCurrent: true
    });
    return items;
  }

  // All drilldowns and secondary views start with the month ancestor
  items.push({
    id: 'month-root',
    label: monthLabel,
    route: overviewRoute,
    isCurrent: false
  });

  // Secondary views
  if (route.view === 'budgets') {
    items.push({ id: 'budgets', label: 'Budgets & Planning', route, isCurrent: true });
    return items;
  }
  if (route.view === 'trends') {
    items.push({ id: 'trends', label: 'Trends & Analytics', route, isCurrent: true });
    return items;
  }
  if (route.view === 'reports') {
    items.push({ id: 'reports', label: 'Monthly Report', route, isCurrent: true });
    return items;
  }
  if (route.view === 'settings') {
    items.push({ id: 'settings', label: 'Settings & Workspace', route, isCurrent: true });
    return items;
  }

  // Level 4 month transactions without category
  if (route.view === 'transactions' && !route.categoryId) {
    const countSuffix = txnCounts?.monthTxnCount !== undefined ? ` (${txnCounts.monthTxnCount})` : '';
    items.push({ id: 'transactions', label: `Transactions${countSuffix}`, route, isCurrent: true });
    return items;
  }

  // Determine bucket
  let bucketId = route.bucketId;
  let category: Category | undefined;
  if (route.categoryId) {
    category = findCategoryCaseInsensitive(route.categoryId, categories);
    if (!bucketId) {
      bucketId =
        category?.defaultBucket || suggestSpendingBucket('', category?.id || route.categoryId);
    }
  }

  // Level 2 Bucket
  if (bucketId) {
    const bucketRoute: AppRoute = { view: 'bucket', level: 2, month, bucketId };
    const bucketLabel = getBucketLabel(bucketId);
    const isCurrent = route.view === 'bucket';

    items.push({
      id: `bucket-${bucketId}`,
      label: bucketLabel,
      route: bucketRoute,
      isCurrent
    });

    if (isCurrent) return items;
  }

  // Level 3 Category
  if (route.categoryId) {
    const categoryRoute: AppRoute = {
      view: 'category',
      level: 3,
      month,
      categoryId: route.categoryId,
      ...(route.bucketId ? { bucketId: route.bucketId } : {}),
    };
    const catName = category ? `${category.emoji ? category.emoji + ' ' : ''}${category.name}` : route.categoryId;
    const isCurrent = route.view === 'category';

    items.push({
      id: `category-${route.categoryId}`,
      label: catName,
      route: categoryRoute,
      isCurrent
    });

    if (isCurrent) return items;
  }

  // Level 4 Category Transactions
  if (route.view === 'transactions' && route.categoryId) {
    const countSuffix = txnCounts?.categoryTxnCount !== undefined ? ` (${txnCounts.categoryTxnCount})` : '';
    items.push({
      id: `category-transactions-${route.categoryId}`,
      label: `Transactions${countSuffix}`,
      route,
      isCurrent: true
    });
  }

  return items;
}
