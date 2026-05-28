# Locked Extraction Rules

This document contains the website implementation rules for the credit report extractor.

## Section order

1. Client information
2. OPEN ACCOUNTS
3. LATE PAYMENTS
4. FOR DISPUTE

Hard inquiries are placed under each bureau inside FOR DISPUTE.

## Source isolation

Every extraction must use only the currently uploaded PDF. Never reuse previous output, account data, inquiries, collections, public records, names, addresses, DOB, SSN, balances, or account numbers.

## Open accounts

Open plus balance greater than zero is included in OPEN ACCOUNTS unless it is collection-only.
Open with zero balance and no confirmed late or severe derogatory status is skipped.

## Late payments

Late payment must be confirmed by payment history, payment summary, current payment status, or qualifying amount past due. Comment-only delinquency does not create a LATE PAYMENT entry.

## Dispute

Closed, transferred, or sold accounts with confirmed late payments go to FOR DISPUTE. Collections, charge-offs, unpaid loss, profit and loss, bankruptcy, and severe derogatory accounts go to FOR DISPUTE.
