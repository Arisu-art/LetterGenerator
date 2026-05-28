import type { BureauName } from './types';

export function normalizeMask(value: string | undefined): string | undefined {
  if (!value) return undefined;
  return value.replace(/x/g, 'X').replace(/\s+/g, ' ').trim();
}

export function normalizeName(name: string): string {
  return name
    .toUpperCase()
    .replace(/[,\.]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function displayCreditorName(name: string): string {
  const n = normalizeName(name);
  if (n.includes('UNITED WHSLE') || n.includes('UNTD WHLSL') || n.includes('UNTD WHL')) return 'UNITED WHSLE MORT';
  if (n.includes('WESTLAKE')) return 'WESTLAKE FIN';
  if (n.includes('JEFFCAP') || n.includes('JEFFERSON') || n.includes('JEFFERSNCP')) return 'JEFFERSON CAPITAL SYST';
  if (n.includes('LVNV')) return 'LVNV FUNDING LLC';
  if (n.includes('CAPITAL ONE') || n.includes('CAP ONE')) return 'CAPITAL ONE';
  if (n.includes('KIKOFF')) return 'KIKOFF LENDING, LLC';
  return n;
}

export function stripMiddleName(fullName: string): { firstName: string; lastName: string } {
  const cleaned = fullName.replace(/\s+/g, ' ').trim();
  const parts = cleaned.split(' ');
  if (parts.length === 1) return { firstName: parts[0].toUpperCase(), lastName: '' };
  return { firstName: parts[0].toUpperCase(), lastName: parts[parts.length - 1].toUpperCase() };
}

export function formatMonthYear(date: string | undefined): string {
  if (!date) return 'Not Found';
  const trimmed = date.trim();
  const numeric = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (numeric) return `${Number(numeric[1])}/${numeric[3].length === 2 ? `20${numeric[3]}` : numeric[3]}`;

  const monthMap: Record<string, number> = {
    JAN: 1, JANUARY: 1, FEB: 2, FEBRUARY: 2, MAR: 3, MARCH: 3, APR: 4, APRIL: 4,
    MAY: 5, JUN: 6, JUNE: 6, JUL: 7, JULY: 7, AUG: 8, AUGUST: 8, SEP: 9,
    SEPT: 9, SEPTEMBER: 9, OCT: 10, OCTOBER: 10, NOV: 11, NOVEMBER: 11, DEC: 12, DECEMBER: 12,
  };
  const match = trimmed.toUpperCase().match(/([A-Z]+)\s+(\d{1,2}),?\s+(\d{4})|([A-Z]+)\s+(\d{1,2})\s+(\d{4})|([A-Z]+)\s+(\d{4})/);
  if (!match) return trimmed;
  const monthToken = match[1] || match[4] || match[7];
  const year = match[3] || match[6] || match[8];
  const month = monthMap[monthToken];
  return month && year ? `${month}/${year}` : trimmed;
}

export function formatInquiryDate(date: string): string {
  const monthMap: Record<string, number> = {
    JAN: 1, JANUARY: 1, FEB: 2, FEBRUARY: 2, MAR: 3, MARCH: 3, APR: 4, APRIL: 4,
    MAY: 5, JUN: 6, JUNE: 6, JUL: 7, JULY: 7, AUG: 8, AUGUST: 8, SEP: 9,
    SEPT: 9, SEPTEMBER: 9, OCT: 10, OCTOBER: 10, NOV: 11, NOVEMBER: 11, DEC: 12, DECEMBER: 12,
  };
  const match = date.toUpperCase().match(/([A-Z]+)\s+(\d{1,2}),?\s+(\d{4})/);
  if (!match) return date;
  return `${monthMap[match[1]]}/${Number(match[2])}/${match[3]}`;
}

export function emptyBureauRecord<T>(): Record<BureauName, T[]> {
  return { TRANSUNION: [], EQUIFAX: [], EXPERIAN: [] };
}
