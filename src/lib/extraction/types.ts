export type BureauName = 'TRANSUNION' | 'EQUIFAX' | 'EXPERIAN';

export type BureauAccountData = {
  bureau: BureauName;
  reported: boolean;
  accountNumber?: string;
  accountStatus?: string;
  activityDesignator?: string;
  balance?: number;
  amountPastDue?: number;
  dateOpened?: string;
  dateClosed?: string;
  dateReported?: string;
  lastActivity?: string;
  currentPaymentStatus?: string;
  late30?: number;
  late60?: number;
  late90?: number;
  late120?: number;
  late150?: number;
  paymentHistoryCells?: string[];
  comments?: string[];
};

export type ExtractedAccount = {
  rawName: string;
  normalizedName: string;
  sectionType: 'revolving' | 'mortgage' | 'installment' | 'other' | 'collection' | 'public_record';
  bureauData: Partial<Record<BureauName, BureauAccountData>>;
  sourcePages: number[];
  visualBlockId?: string;
};

export type ExtractedInquiry = {
  bureau: BureauName;
  creditorName: string;
  normalizedName: string;
  date: string;
  sourcePage: number;
};

export type ClientInfo = {
  firstName: string;
  lastName: string;
  address?: string;
  cityStateZip?: string;
  dob?: string;
  ssn?: string;
  reportDate?: string;
};

export type Classification = {
  openAccounts: string[];
  latePayments: Record<BureauName, ExtractedAccount[]>;
  forDispute: Record<BureauName, ExtractedAccount[]>;
  inquiriesByBureau: Record<BureauName, ExtractedInquiry[]>;
  skipped: Array<{ item: string; reason: string }>;
  auditFlags: string[];
};

export type ExtractionResult = {
  client: ClientInfo;
  bureauOrder: BureauName[];
  accounts: ExtractedAccount[];
  inquiries: ExtractedInquiry[];
  classification: Classification;
  outputText: string;
};
