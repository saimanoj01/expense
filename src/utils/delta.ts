export type DeltaKind = 'income' | 'expense' | 'saved' | 'rate';
export type DeltaTone = 'positive' | 'negative' | 'neutral';

export interface DeltaResult {
  text: string;
  tone: DeltaTone;
  pct?: number;
}

export function formatShortMonth(monthStr?: string | null): string {
  if (!monthStr) return 'last month';
  if (/^\d{4}-\d{2}$/.test(monthStr)) {
    const [yStr, mStr] = monthStr.split('-');
    const date = new Date(Date.UTC(parseInt(yStr, 10), parseInt(mStr, 10) - 1, 1));
    return date.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' });
  }
  return monthStr;
}

export function delta(
  curr: number,
  prev: number | null | undefined,
  kind: DeltaKind,
  prevMonthShort: string = 'last month'
): DeltaResult {
  if (prev == null) return { text: 'No prior month', tone: 'neutral' };
  const shortLabel = formatShortMonth(prevMonthShort);
  if (kind === 'rate') {
    if (prev === 0 && curr === 0) return { text: '—', tone: 'neutral' };
    const diffPts = curr - prev;
    if (Math.abs(diffPts) < 0.5) return { text: `≈ same as ${shortLabel}`, tone: 'neutral', pct: diffPts };
    const big = Math.abs(diffPts) >= 2;
    return {
      text: `${diffPts > 0 ? '↑' : '↓'} ${Math.abs(diffPts).toFixed(1)} pts vs ${shortLabel}`,
      tone: !big ? 'neutral' : diffPts > 0 ? 'positive' : 'negative',
      pct: diffPts,
    };
  }
  if (prev === 0) return { text: curr === 0 ? '—' : 'New', tone: 'neutral' };
  const pct = ((curr - prev) / Math.abs(prev)) * 100;
  if (Math.abs(pct) < 3) return { text: `≈ same as ${shortLabel}`, tone: 'neutral', pct };
  const good = kind === 'expense' ? pct < 0 : pct > 0;
  const big = Math.abs(pct) >= 10;
  return {
    text: `${pct > 0 ? '↑' : '↓'} ${Math.abs(pct).toFixed(0)}% vs ${shortLabel}`,
    tone: !big ? 'neutral' : good ? 'positive' : 'negative',
    pct,
  };
}

export function deltaToneClass(tone: DeltaTone): string {
  if (tone === 'positive') return 'text-bucket-saved';
  if (tone === 'negative') return 'text-negative';
  return 'text-muted-foreground';
}
