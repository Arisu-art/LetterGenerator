import JSZip from 'jszip';
import type { ParsedSource } from './letter-engine';

export type FtcAffectedAccount = {
  accountName: string;
  accountNumber: string;
  fraudBegan: string;
  dateDiscovered: string;
  fraudulentAmount: string;
};

type XmlRunOptions = {
  bold?: boolean;
  size?: number;
  color?: string;
  font?: string;
};

type ParagraphOptions = XmlRunOptions & {
  align?: