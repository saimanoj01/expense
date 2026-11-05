export const BUCKETS = {
  fixed:        { id: 'fixed',        route: 'fixed',       label: 'Fixed',        long: 'Fixed bills',         cssVar: '--c-fixed' },
  flexible:     { id: 'flexible',     route: 'variable',    label: 'Variable',     long: 'Day-to-day spending', cssVar: '--c-variable' },
  'non-monthly':{ id: 'non-monthly', route: 'non-monthly', label: 'Non-monthly', long: 'Occasional & annual', cssVar: '--c-nonmonthly' },
  saved:        { id: 'saved',        route: 'income',      label: 'Saved',        long: 'Left over',           cssVar: '--c-saved' },
} as const;

export type BucketKey = keyof typeof BUCKETS;

export const bucketColor = (k: BucketKey) => `hsl(var(${BUCKETS[k].cssVar}))`;
export const negativeColor = () => `hsl(var(--c-negative))`;

