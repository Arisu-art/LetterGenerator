export type Bureau = "TRANSUNION" | "EQUIFAX" | "EXPERIAN";
export type LetterKind = "dispute" | "late_payment";

export interface Consumer {
  name: string;
  address: string[];
  dob: string;
  ssn: string;
}

export interface Account {
  accountName: string;
  accountNumber: string;
  details: string[];
}

export interface ParsedSource {
  consumer: Consumer;
  disputes: Record<Bureau, Account[]>;
  latePayments: Record<Bureau, Account[]>;
  inquiries: string[];
  openAccounts: string[];
}

export interface OutputPlan {
  bureau: Bureau;
  kind: LetterKind;
  accounts: Account[];
  filename: string;
}

export interface WorkflowStats {
  templateUploads: number;
  sourceLoads: number;
  validations: number;
  generations: number;
  frictionSignals: number;
  lastStep: string;
}
