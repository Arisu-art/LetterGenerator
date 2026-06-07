import JSZip from 'jszip';
import type { ParsedSource } from './letter-engine';

export type FtcAffectedAccount = {
  accountName: string;
  accountNumber: string;
  fraudBegan: string;
  dateDiscovered: string;
  fraudulentAmount: string;
};

const FTC_TEMPLATE_URL = '/templates/ftc-standard.docx';
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const DEFAULT_REPORT_NUMBER = '202084447';
const DEFAULT_SIGNATURE