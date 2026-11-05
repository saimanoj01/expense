export function parseCurrencyAmount(raw: string): { amount: number; isNegative: boolean; isCredit: boolean } {
  if (!raw || typeof raw !== 'string') return { amount: 0, isNegative: false, isCredit: false };
  let str = raw.trim();
  if (!str) return { amount: 0, isNegative: false, isCredit: false };

  let isNegative = false;
  let isCredit = false;

  // Check CR / DR suffixes or prefixes
  if (/\bcr\b/i.test(str)) {
    isCredit = true;
    str = str.replace(/\bcr\b/gi, '').trim();
  } else if (/\bdr\b/i.test(str)) {
    isNegative = true;
    str = str.replace(/\bdr\b/gi, '').trim();
  }

  // Check parentheses e.g. ($50.00) or (50.00)
  if (str.startsWith('(') && str.endsWith(')')) {
    isNegative = true;
    str = str.slice(1, -1).trim();
  }

  // Check trailing minus e.g. 50.00- or -$50.00 or $-50.00
  if (str.endsWith('-')) {
    isNegative = true;
    str = str.slice(0, -1).trim();
  } else if (str.startsWith('-')) {
    isNegative = true;
    str = str.slice(1).trim();
  }

  // Strip currency symbols ($ € £ ¥ ₹) and any whitespace
  str = str.replace(/[$€£¥₹\s]/g, '');

  // If there's still a minus after currency symbol e.g. $-50
  if (str.startsWith('-')) {
    isNegative = true;
    str = str.slice(1).trim();
  }

  // Handle commas as thousand separators e.g. 1,234.56
  if (str.includes(',') && str.includes('.')) {
    str = str.replace(/,/g, '');
  } else if (str.includes(',')) {
    const parts = str.split(',');
    if (parts.length === 2 && parts[1].length === 2) {
      str = parts[0] + '.' + parts[1];
    } else {
      str = str.replace(/,/g, '');
    }
  }

  const num = parseFloat(str);
  const finalAmt = isNaN(num) ? 0 : Math.abs(num);
  return {
    amount: finalAmt,
    isNegative,
    isCredit
  };
}

export function parseCsv(text: string): string[][] {
  const clean = text.replace(/^\uFEFF/, '');
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = '';
  let inQuotes = false;
  let i = 0;
  const len = clean.length;

  while (i < len) {
    const char = clean[i];

    if (inQuotes) {
      if (char === '"') {
        if (i + 1 < len && clean[i + 1] === '"') {
          currentField += '"';
          i += 2;
        } else {
          inQuotes = false;
          i++;
        }
      } else {
        currentField += char;
        i++;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
        i++;
      } else if (char === ',') {
        currentRow.push(currentField.trim());
        currentField = '';
        i++;
      } else if (char === '\r') {
        if (i + 1 < len && clean[i + 1] === '\n') {
          i++;
        }
        currentRow.push(currentField.trim());
        currentField = '';
        rows.push(currentRow);
        currentRow = [];
        i++;
      } else if (char === '\n') {
        currentRow.push(currentField.trim());
        currentField = '';
        rows.push(currentRow);
        currentRow = [];
        i++;
      } else {
        currentField += char;
        i++;
      }
    }
  }

  if (currentField.length > 0 || currentRow.length > 0) {
    currentRow.push(currentField.trim());
    rows.push(currentRow);
  }

  return rows.filter(row => row.length > 0 && !(row.length === 1 && row[0] === ''));
}

export function parseCsvLine(line: string): string[] {
  const parsed = parseCsv(line);
  return parsed[0] || [];
}

export function escapeCsvCell(val: string | number | null | undefined): string {
  if (val === null || val === undefined) return '""';
  if (typeof val === 'number') return String(val);
  let str = String(val);
  if (/^[=+\-@\t\r]/.test(str)) {
    str = `'${str}`;
  }
  return `"${str.replace(/"/g, '""')}"`;
}

export function getLocalTodayDate(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function standardizeDate(raw: string): string {
  if (!raw || !raw.trim()) return getLocalTodayDate();
  const trimmed = raw.trim();

  // YYYY-MM-DD, YYYY.MM.DD, YYYY/MM/DD
  const isoOrDotMatch = trimmed.match(/^(\d{4})[-./](\d{1,2})[-./](\d{1,2})$/);
  if (isoOrDotMatch) {
    const year = Number(isoOrDotMatch[1]);
    const month = Number(isoOrDotMatch[2]);
    const day = Number(isoOrDotMatch[3]);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  }

  // MM/DD/YYYY or DD/MM/YYYY (also supports - and 2-digit years)
  const slashMatch = trimmed.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (slashMatch) {
    const first = Number(slashMatch[1]);
    const second = Number(slashMatch[2]);
    const yearStr = slashMatch[3].length === 2 ? `20${slashMatch[3]}` : slashMatch[3];
    let month = first;
    let day = second;
    if (first > 12 && first <= 31 && second >= 1 && second <= 12) {
      day = first;
      month = second;
    }
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${yearStr}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  }

  // Fallback for named months e.g. "12-Jul-2026" or "Jul 15, 2026" using local date components
  const d = new Date(trimmed);
  if (!isNaN(d.getTime())) {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  return trimmed;
}
