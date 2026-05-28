import type { ExtractedAccount } from './types';

export function hasPositiveBalance(account: ExtractedAccount): boolean {
  return Object.values(account.bureauData).some((item) => Number(item?.balance ?? 0) > 0);
}

export function hasOpenStatus(account: ExtractedAccount): boolean {
  return Object.values(account.bureauData).some((item) => {
    const status = `${item?.accountStatus ?? ''} ${item?.activityDesignator ?? ''}`.toUpperCase();
    return status.includes('OPEN') && !status.includes('CLOSED') && !status.includes('TRANSFERRED') && !status.includes('SOLD');
  });
}

export function hasConfirmedLate(account: ExtractedAccount): boolean {
  return Object.values(account.bureauData).some((item) => {
    const lateCounts = [item?.late30, item?.late60, item?.late90, item?.late120, item?.late150].some((value) => Number(value ?? 0) > 0);
    const status = String(item?.currentPaymentStatus ?? '').toUpperCase();
    return lateCounts || status.includes('LATE') || status.includes('PAST DUE') || status.includes('OVER 120');
  });
}

export function isClosedTransferredOrSold(account: ExtractedAccount): boolean {
  const values = Object.values(account.bureauData).filter(Boolean);
  return values.length > 0 && values.every((item) => {
    const status = `${item?.accountStatus ?? ''} ${item?.activityDesignator ?? ''}`.toUpperCase();
    return status.includes('CLOSED') || status.includes('TRANSFERRED') || status.includes('SOLD') || status.includes('PAID');
  });
}
