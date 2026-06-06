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
const PAGE_W = 12240;
const PAGE_H = 15840;
const BODY_W = 10800;
const SHADE_ORANGE = 'F8CBAD';
const SHADE_GRAY = 'D9D9D9';
const BORDER = '<w:top w:val="single" w:sz="6"/><w:left w:val="single" w:sz="6"/><w:bottom w:val="single" w:sz="6"/><w:right w:val="single" w:sz="6"/>';

const FTC_STATEMENT =
  'I AM A VICTIM OF IDENTITY THEFT AND REQUEST THE IMMEDIATE ENFORCEMENT OF MY RIGHTS UNDER