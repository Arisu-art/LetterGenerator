import type { LetterType } from './letter-engine';
import type { Round } from './reference-store';

export type ClientCaseStatus = 'SOURCE_LOCKED' | 'EVIDENCE_READY' | 'REVIEW_READY' | 'PDF_READY';
export type FilingStatus = 'PDF_READY' | 'SENT';
export type ClientCaseRecord = {
  id: string;
  clientName: string;
  round: Round;
  routeCount: number;
  bureaus: string[];
  evidenceCount: number;
  editableCount: number;
  pdfCount: number;
  status: ClientCaseStatus;
  updatedAt: string;
};
export type FilingRecord = {
  id: string;
  caseId: string;
  clientName: string;
  round: Round;
  bureau: string;
  packetType: LetterType;
  path: string;
  status: FilingStatus;
  generatedAt: string;
  sentAt?: string;
};
const CASES_KEY = 'lettergenerator-client-cases-v1';
const FILINGS_KEY = 'lettergenerator-filing-tracker-v1';
function read<T>(key: string): T[] {
  if (typeof window === 'undefined') return [];
  try { return JSON.parse(localStorage.getItem(key) || '[]') as T[]; } catch { return []; }
}
function write<T>(key: string, value: T[]) {
  if (typeof window !== 'undefined') localStorage.setItem(key, JSON.stringify(value));
}
export function loadClientCases() { return read<ClientCaseRecord>(CASES_KEY); }
export function loadFilings() { return read<FilingRecord>(FILINGS_KEY); }
export function upsertClientCase(record: ClientCaseRecord) {
  const next = [record, ...loadClientCases().filter((item) => item.id !== record.id)].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  write(CASES_KEY, next);
  return next;
}
export function addFinalFilings(caseRecord: ClientCaseRecord, packets: Array<{ bureau: string; type: LetterType; path: string }>) {
  const previous = loadFilings();
  const now = new Date().toISOString();
  const created = packets.map((packet) => {
    const id = `${caseRecord.id}:${packet.bureau}:${packet.type}`;
    const existing = previous.find((item) => item.id === id);
    return { id, caseId: caseRecord.id, clientName: caseRecord.clientName, round: caseRecord.round, bureau: packet.bureau, packetType: packet.type, path: packet.path, status: existing?.status || 'PDF_READY', generatedAt: existing?.generatedAt || now, sentAt: existing?.sentAt } as FilingRecord;
  });
  const ids = new Set(created.map((item) => item.id));
  const next = [...created, ...previous.filter((item) => !ids.has(item.id))].sort((a, b) => b.generatedAt.localeCompare(a.generatedAt));
  write(FILINGS_KEY, next);
  return next;
}
export function markFilingSent(id: string) {
  const now = new Date().toISOString();
  const next = loadFilings().map((item) => item.id === id ? { ...item, status: 'SENT' as const, sentAt: now } : item);
  write(FILINGS_KEY, next);
  return next;
}
export function clearOperationsRecords() {
  if (typeof window !== 'undefined') {
    localStorage.removeItem(CASES_KEY);
    localStorage.removeItem(FILINGS_KEY);
  }
  return { cases: [] as ClientCaseRecord[], filings: [] as FilingRecord[] };
}
export function exportOperationsRecords() {
  return {
    exportedAt: new Date().toISOString(),
    records: { cases: loadClientCases(), filings: loadFilings() },
    notice: 'Operational metadata only. Raw source input and document file contents are not included.'
  };
}
