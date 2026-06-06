import JSZip from 'jszip';
import type { ParsedSource } from './letter-engine';

export type FtcAffectedAccount = {
  accountName: string;
  accountNumber: string;
  fraudBegan: string;
  dateDiscovered: string;
  fraudulentAmount: string;
};

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const ORANGE = 'F8CBAD';
const GRAY = 'D9D9D9';
const BORDER = '<w:top w:val="single" w:sz="6"/><w:left w:val="single" w:sz="6"/><w:bottom w:val="single" w:sz="6"/><w:right w:val="single" w:sz="6"/>';
const STATEMENT = 'I am reporting unauthorized accounts, inquiries, or information resulting from identity theft. I request that the fraudulent information be blocked and removed from my credit file under FCRA Section 605B (15 U.S.C. 1681c-2).';

type AnySource = ParsedSource & Record<string, any>;

function escapeXml(value: unknown) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function normalizeLines(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((item) => String(item || '').trim()).filter(Boolean);
  return String(value || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);