export type DrillDownLevel = 1 | 2 | 3 | 4;

export type PrimaryView = 
  | 'overview'       // Level 1: Month Overview
  | 'bucket'         // Level 2: Bucket View
  | 'category'       // Level 3: Category View
  | 'transactions'   // Level 4 (or Secondary) Transactions View
  | 'budgets'        // Secondary Budgets View
  | 'trends'         // Secondary Trends View
  | 'reports'        // Secondary Reports View
  | 'settings';      // Secondary Settings View

export interface AppRoute {
  view: PrimaryView;
  level: DrillDownLevel;
  month?: string; // YYYY-MM
  bucketId?: string; // 'fixed' | 'variable' | 'non-monthly' | 'income'
  categoryId?: string;
  isCategoryTransactions?: boolean;
  projectId?: string;
}

export interface BreadcrumbItem {
  id: string;
  label: string;
  route: AppRoute;
  isCurrent?: boolean;
}
