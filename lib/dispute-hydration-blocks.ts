export type DisputeHydrationCategory = 'FRAUDULENT_ACCOUNTS' | 'HARD_INQUIRIES';

export type DisputeHydrationBlock = {
  id: string;
  bureau: string;
  category: DisputeHydrationCategory;
  creditorName: string;
  accountNumber: string;
  statement: string;
  lines: string[];
  allowDedupe: false;
};

function accountParts(text: string) {
  const lines = text.split('\n').map((line) => line.trim()).filter(Boolean);
  const creditorName = (lines.find((line) => /^(?:Account|Creditor)\s+Name\s*:/i.test(line)) || '').replace(/^(?:Account|Creditor)\s+Name\s*:\s*/i, '').trim();
  const accountNumber = (lines.find((line) => /^Account\s+Number\s*:/i.test(line)) || '').replace(/^Account\s+Number\s*:\s*/i, '').trim();
  return { creditorName, accountNumber, lines };
}

export function buildAccountHydrationBlocks(input: { bureau: string; accounts: string[]; statement: string }) {
  return input.accounts.map((account, index): DisputeHydrationBlock => {
    const parts = accountParts(account);
    return {
      id: `${input.bureau}::FRAUDULENT_ACCOUNTS::${index}::${parts.creditorName}::${parts.accountNumber}`,
      bureau: input.bureau,
      category: 'FRAUDULENT_ACCOUNTS',
      creditorName: parts.creditorName,
      accountNumber: parts.accountNumber,
      statement: input.statement,
      lines: parts.lines,
      allowDedupe: false
    };
  });
}

export function buildInquiryHydrationBlocks(input: { bureau: string; inquiries: string[]; statement: string }) {
  return input.inquiries.map((inquiry, index): DisputeHydrationBlock => ({
    id: `${input.bureau}::HARD_INQUIRIES::${index}::${inquiry}`,
    bureau: input.bureau,
    category: 'HARD_INQUIRIES',
    creditorName: inquiry,
    accountNumber: '',
    statement: input.statement,
    lines: [inquiry],
    allowDedupe: false
  }));
}
