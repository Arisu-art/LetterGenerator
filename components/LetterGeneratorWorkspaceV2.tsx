'use client';

import { useEffect, useMemo, useState } from 'react';
import JSZip from 'jszip';
import DashboardOperationsWorkspace from './DashboardOperationsWorkspace';
import FilingTrackerWorkspace from './FilingTrackerWorkspace';
import GuidedSourceDataFlow from './GuidedSourceDataFlow';
import OutputReviewWorkspace, { type ReviewOutput } from './OutputReviewWorkspace';
import type { FinalPdfPacket } from './PdfPacketPreview';
import TemplateProgressiveWorkspace from './TemplateProgressiveWorkspace';
import WorkspaceSettingsPanel from './WorkspaceSettingsPanel';
import { addFinalFilings, clearOperationsRecords, exportOperationsRecords, loadClientCases, loadFilings, markFilingSent, upsertClientCase, type ClientCaseRecord, type ClientCaseStatus, type FilingRecord } from '../lib/client-operations-store';
import { assembleFinalPdf, type PdfPacketPart } from '../lib/final-pdf-packet';
import { addOrderedPacketFolders } from '../lib/ordered-packet-archive';
import { isDocx, renderReferenceDisputeDocx } from '../lib/docx-renderer';
import { highlightTextInDocx } from '../lib/docx-review-marker';
import { renderLatePaymentReference } from '../lib/late-reference-renderer';
import { resolveAffidavitJurisdiction } from '../lib/affidavit-jurisdiction';
import { bureauInfo, bureaus, createNormalizedSourceCopy, detectRoutes, ftcFraudMonthYearFromReportDate, MAX_FTC_ACCOUNTS, parseSource, validFtcAccounts, type Bureau, type FtcAffectedAccount, type LetterRoute, type LetterType } from '../lib/letter-engine';
import { loadPacketAssets, type PacketAssets } from '../lib/packet-assets';
import { createSupportingDocumentsPdf } from '../lib/packet-renderer';
import { defaultReferences, loadReferenceMeta, readReferenceFile, removeReferenceFile, saveReferenceFile, saveReferenceMeta, type LetterReference, type Round } from '../lib/reference-store';
import { renderMappedAppendix } from '../lib/supplemental-template-renderer';
import { unresolvedCustomTemplateFields } from '../lib/template-contracts';
import { exhibitTitles, loadTemplateExhibits, readTemplateExhibit, type ExhibitKind, type TemplateExhibits } from '../lib/template-exhibits';
import { defaultWorkspacePreferences, loadWorkspacePreferences, saveWorkspacePreferences, type WorkspacePreferences } from '../lib/workspace-preferences';

type Panel = 'Dashboard' | 'Templates' | 'Source Data' | 'Outputs' | 'Filing Tracker' | 'Settings';
type SourceDraftSnapshot = { text: string; normalized: boolean; label: string; capturedAt: string };
type StatusTone = 'info' | 'success' | 'error';

const panels: Panel[] = ['Dashboard', 'Templates', 'Source Data', 'Outputs', 'Filing Tracker', 'Settings'];
const labels: Record<LetterType, string> = { DISPUTE: 'Dispute Letter', LATE_PAYMENT: 'Late Payment Letter' };
const requirements: ExhibitKind[] = ['FCRA', 'AFFIDAVIT', 'ATTACHMENT', 'FTC'];
const emptyEvidence = (): PacketAssets => ({ supporting: [], legalPdf: null });
const emptyTemplates = (): TemplateExhibits => ({ FCRA: null, AFFIDAVIT: null, ATTACHMENT: null, FTC: null });
const dateNow = () => new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'America/New_York' }).format(new Date());
const clean = (value: string) => (value || 'CLIENT').replace(/[\/:*?"<>|]+/g, '').replace(/\s+/g, ' ').trim().toUpperCase();
const base = (value: string) => clean(value).replace(/[^A-Z0-9]+/g, '_');
const order = (type: LetterType) => type === 'LATE_PAYMENT' ? ['01 Late Payment Letter', '02 Supporting Documents'] : ['01 Dispute Letter', '02 Supporting Documents', '03 FCRA', '04 Affidavit', '05 Attachment', '06 FTC'];
const GENERATION_TIMEOUT_MS = 90_000;
const ARCHIVE_TIMEOUT_MS = 120_000;

function download(name: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(url);
}
function normalizedFtcAccounts(items: FtcAffectedAccount[], reportDate: string) {
  const began = ftcFraudMonthYearFromReportDate(reportDate);
  return items.slice(0, MAX_FTC_ACCOUNTS).map((item) => ({ ...item, fraudBegan: began }));
}
function ftcSection(items: FtcAffectedAccount[], reportDate: string) {
  return ['FTC AFFECTED ACCOUNTS', ...normalizedFtcAccounts(items, reportDate).flatMap((item, index) => [index ? '' : '', `Account Name: ${item.accountName}`, `Account Number: ${item.accountNumber}`, `Fraud Began: ${item.fraudBegan}`, `Date Discovered: ${item.dateDiscovered}`, `Fraudulent Amount: ${item.fraudulentAmount}`])].join('\n');
}
async function withTimeout<T>(phase: string, operation: () => Promise<T>, timeoutMs = GENERATION_TIMEOUT_MS): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation(),
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${phase} timed out after ${Math.round(timeoutMs / 1000)} seconds.`)), timeoutMs);
      })
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
function errorMessage(error: unknown) {
  return error instanceof Error && error.message ? error.message : 'An unknown error occurred.';
}

export default function LetterGeneratorWorkspaceV2() {
  const [panel, setPanel] = useState<Panel>('Dashboard');
  const [round, setRound] = useState<Round>('1st Round');
  const [preferences, setPreferences] = useState<WorkspacePreferences>(defaultWorkspacePreferences);
  const [references, setReferences] = useState<LetterReference[]>(defaultReferences);
  const [source, setSource] = useState('');
  const [originalSource, setOriginalSource] = useState('');
  const [recoveryDraft, setRecoveryDraft] = useState<SourceDraftSnapshot | null>(null);
  const [normalized, setNormalized] = useState(false);
  const [caseId, setCaseId] = useState('');
  const [cases, setCases] = useState<ClientCaseRecord[]>([]);
  const [filings, setFilings] = useState<FilingRecord[]>([]);
  const [evidence, setEvidence] = useState<PacketAssets>(emptyEvidence);
  const [templates, setTemplates] = useState<TemplateExhibits>(emptyTemplates);
  const [docs, setDocs] = useState<ReviewOutput[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [workingZip, setWorkingZip] = useState<{ name: string; blob: Blob } | null>(null);
  const [packets, setPackets] = useState<FinalPdfPacket[]>([]);
  const [finalZip, setFinalZip] = useState<{ name: string; blob: Blob } | null>(null);
  const [docDate, setDocDate] = useState('');
  const [busy, setBusy] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [status, setStatus] = useState('Configure packet templates, then load a client source file.');
  const [statusTone, setStatusTone] = useState<StatusTone>('info');

  useEffect(() => {
    const storedPreferences = loadWorkspacePreferences();
    setPreferences(storedPreferences);
    setRound(storedPreferences.defaultRound);
    setReferences(loadReferenceMeta());
    setCases(loadClientCases());
    setFilings(loadFilings());
  }, []);
  useEffect(() => saveReferenceMeta(references), [references]);
  useEffect(() => setTemplates(loadTemplateExhibits(round)), [round]);

  const refs = references.filter((item) => item.round === round);
  const parsed = useMemo(() => parseSource(source), [source]);
  const routes = useMemo(() => detectRoutes(parsed), [parsed]);
  const verified = normalized && Boolean(parsed.name);
  const evidenceKey = caseId ? `${round}::${caseId}` : '';
  const missingLetters = Array.from(new Set(routes.map((route) => route.type))).filter((type) => !refs.find((item) => item.type === type)?.file);
  const dispute = routes.some((route) => route.type === 'DISPUTE');
  const disputed = bureaus.some((bureau) => parsed.dispute[bureau].length > 0);
  const affidavitRequired = Boolean(templates.AFFIDAVIT && disputed);
  const affidavitJurisdiction = useMemo(() => resolveAffidavitJurisdiction(parsed), [parsed]);
  const affidavitSource = useMemo(() => ({ ...parsed, address: parsed.address.length ? parsed.address : ['N/A'], affidavitState: affidavitJurisdiction.state, affidavitCounty: affidavitJurisdiction.county }), [parsed, affidavitJurisdiction]);
  const sourceWarnings = [...parsed.diagnostics.filter((item) => item.level === 'warning'), ...(affidavitRequired && affidavitJurisdiction.reviewRequired ? [{ message: affidavitJurisdiction.explanation }] : [])];
  const affidavitReady = !affidavitRequired || Boolean(affidavitSource.affidavitState.trim() && affidavitSource.affidavitCounty.trim());
  const ftcRequired = Boolean(templates.FTC && dispute);
  const ftcReady = !ftcRequired || Boolean(parsed.ftcReportNumber.trim() && parsed.ftcReportDate.trim() && parsed.firstName.trim() && parsed.lastName.trim() && validFtcAccounts(parsed.ftcAccounts));
  const customFields = unresolvedCustomTemplateFields([...refs.map((item) => item.contract), ...Object.values(templates).map((item) => item?.contract)]);
  const customReady = customFields.every((item) => !item.required || Boolean(parsed.templateFields[item.key]?.trim()));
  const missingNodes = dispute ? requirements.filter((kind) => !templates[kind]) : [];
  const canGenerate = verified && routes.length > 0;

  useEffect(() => setEvidence(evidenceKey ? loadPacketAssets(evidenceKey) : emptyEvidence()), [evidenceKey]);

  function report(message: string, tone: StatusTone = 'info') {
    setStatus(message);
    setStatusTone(tone);
  }
  function clearOutputs() {
    setDocs([]);
    setWarnings([]);
    setWorkingZip(null);
    setPackets([]);
    setFinalZip(null);
    setDocDate('');
  }
  function captureDraft(label: string) {
    if (source.trim()) setRecoveryDraft({ text: source, normalized, label, capturedAt: new Date().toISOString() });
  }
  function saveCase(statusValue: ClientCaseStatus, data: Partial<ClientCaseRecord> = {}) {
    const id = data.id || caseId;
    const name = data.clientName || parsed.name;
    if (!id || !name) return null;
    const previous = cases.find((item) => item.id === id);
    const record: ClientCaseRecord = {
      id,
      clientName: name,
      round,
      routeCount: routes.length,
      bureaus: Array.from(new Set(routes.map((route) => route.bureau))),
      evidenceCount: data.evidenceCount ?? previous?.evidenceCount ?? evidence.supporting.length,
      editableCount: data.editableCount ?? previous?.editableCount ?? docs.length,
      pdfCount: data.pdfCount ?? previous?.pdfCount ?? packets.length,
      status: statusValue,
      updatedAt: new Date().toISOString()
    };
    setCases(upsertClientCase(record));
    return record;
  }
  function begin() {
    setRound(preferences.defaultRound);
    setSource('');
    setOriginalSource('');
    setRecoveryDraft(null);
    setNormalized(false);
    setCaseId('');
    setEvidence(emptyEvidence());
    clearOutputs();
    report('Load a client source TXT to begin a new package.');
    setPanel('Source Data');
  }
  function importSource(value: string, action: string) {
    if (!value.trim()) return;
    if (source.trim()) captureDraft(`Working draft preserved before ${action.toLowerCase()} replacement`);
    const text = createNormalizedSourceCopy(value).text;
    const imported = parseSource(text);
    const id = crypto.randomUUID();
    setOriginalSource(value);
    setSource(text);
    setNormalized(true);
    setCaseId(id);
    setEvidence(emptyEvidence());
    clearOutputs();
    if (imported.name) {
      const detected = detectRoutes(imported);
      const record: ClientCaseRecord = { id, clientName: imported.name, round, routeCount: detected.length, bureaus: Array.from(new Set(detected.map((route) => route.bureau))), evidenceCount: 0, editableCount: 0, pdfCount: 0, status: 'SOURCE_LOCKED', updatedAt: new Date().toISOString() };
      setCases(upsertClientCase(record));
    }
    report(`${action} source imported and protected as the original baseline.`, 'success');
  }
  function standardizeDraft(value: string) {
    if (!value.trim()) return;
    const text = createNormalizedSourceCopy(value).text;
    const standardized = parseSource(text);
    const id = caseId || crypto.randomUUID();
    setSource(text);
    setNormalized(true);
    if (!caseId) setCaseId(id);
    clearOutputs();
    if (standardized.name) {
      const detected = detectRoutes(standardized);
      const record: ClientCaseRecord = { id, clientName: standardized.name, round, routeCount: detected.length, bureaus: Array.from(new Set(detected.map((route) => route.bureau))), evidenceCount: evidence.supporting.length, editableCount: 0, pdfCount: 0, status: evidence.supporting.length ? 'EVIDENCE_READY' : 'SOURCE_LOCKED', updatedAt: new Date().toISOString() };
      setCases(upsertClientCase(record));
    }
    report('Working draft standardized. The imported original remains protected and evidence has been retained.', 'success');
  }
  function startManualDraft(value: string) {
    if (source.trim()) captureDraft('Working draft preserved before blank manual format');
    setOriginalSource('');
    setSource(value);
    setNormalized(false);
    setCaseId(crypto.randomUUID());
    setEvidence(emptyEvidence());
    clearOutputs();
    report('Manual draft opened. Importing a TXT later will require confirmation before replacement.');
  }
  function restoreOriginal() {
    if (!originalSource.trim()) return;
    if (source.trim() && source !== originalSource) captureDraft('Working draft saved before restoring imported original');
    setSource(originalSource);
    setNormalized(false);
    clearOutputs();
    report('Imported original restored. Your previous working draft is available through Recover saved draft. Supporting evidence was retained.', 'success');
  }
  function recoverDraft() {
    if (!recoveryDraft) return;
    const active: SourceDraftSnapshot = { text: source, normalized, label: 'Version saved before draft recovery', capturedAt: new Date().toISOString() };
    const restored = recoveryDraft;
    setSource(restored.text);
    setNormalized(restored.normalized);
    setRecoveryDraft(active);
    clearOutputs();
    report(`${restored.label} recovered. Supporting evidence was retained.`, 'success');
  }
  function setLine(key: string, value: string) {
    const pattern = new RegExp(`^${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:.*$`, 'im');
    const line = `${key}: ${value}`;
    const anchor = /\n\s*\n(?=(FTC AFFECTED ACCOUNTS|DISPUTE ACCOUNTS|HARD INQUIRIES|LATE PAYMENTS)\b)/i;
    setSource(pattern.test(source) ? source.replace(pattern, line) : anchor.test(source) ? source.replace(anchor, `\n${line}\n\n`) : `${source.trim()}\n${line}`);
    setNormalized(true);
    clearOutputs();
  }
  function setAccounts(items: FtcAffectedAccount[]) {
    const match = /FTC AFFECTED ACCOUNTS[\s\S]*?(?=\n\s*\n(?:DISPUTE ACCOUNTS|HARD INQUIRIES|LATE PAYMENTS|PRESERVED SOURCE DATA)\b|$)/i;
    const block = ftcSection(items, parsed.ftcReportDate);
    setSource(match.test(source) ? source.replace(match, block) : `${source.trim()}\n\n${block}`);
    setNormalized(true);
    clearOutputs();
  }
  function seedAccounts() {
    const found: FtcAffectedAccount[] = [];
    const seen = new Set<string>();
    bureaus.flatMap((bureau) => parsed.dispute[bureau]).forEach((item) => {
      if (found.length >= MAX_FTC_ACCOUNTS || !item.ftcDerived?.dateDiscovered) return;
      const parts = item.displayText.split('\n');
      const accountName = (parts.find((part) => /^Account Name:/i.test(part)) || '').replace(/^Account Name:\s*/i, '');
      const accountNumber = (parts.find((part) => /^Account Number:/i.test(part)) || '').replace(/^Account Number:\s*/i, '');
      const key = `${accountName}|${accountNumber}|${item.ftcDerived.dateDiscovered}`.toUpperCase();
      if (!seen.has(key)) {
        seen.add(key);
        found.push({ accountName, accountNumber, fraudBegan: ftcFraudMonthYearFromReportDate(parsed.ftcReportDate), dateDiscovered: item.ftcDerived.dateDiscovered, fraudulentAmount: item.ftcDerived.fraudulentAmount });
      }
    });
    setAccounts(found.length ? found : [{ accountName: '', accountNumber: '', fraudBegan: ftcFraudMonthYearFromReportDate(parsed.ftcReportDate), dateDiscovered: '', fraudulentAmount: '' }]);
  }
  async function uploadRef(slot: LetterReference, file: File) {
    if (!isDocx(file.name)) { report('Letter references accept DOCX files only.', 'error'); return; }
    const contract = await saveReferenceFile(slot, file);
    setReferences((items) => items.map((item) => item.id === slot.id ? { ...item, file: file.name, size: file.size, contract } : item));
    clearOutputs();
  }
  async function removeRef(slot: LetterReference) {
    await removeReferenceFile(slot.id);
    setReferences((items) => items.map((item) => item.id === slot.id ? { ...item, file: '', size: undefined, contract: undefined } : item));
    clearOutputs();
  }
  async function letter(route: LetterRoute, file: File, date: string) {
    const recipient = bureauInfo[route.bureau];
    const identity = { consumerName: parsed.name, addressLines: parsed.address, dob: parsed.dob, ssn: parsed.ssn, letterDate: date, bureauName: recipient.name, bureauAddressLines: recipient.address.split('\n') };
    return route.type === 'DISPUTE'
      ? renderReferenceDisputeDocx(file, { ...identity, disputeItems: route.items.filter((item) => item.type === 'DISPUTE_ACCOUNT').map((item) => item.displayText), hardInquiryItems: route.items.filter((item) => item.type === 'HARD_INQUIRY').map((item) => item.displayText) })
      : renderLatePaymentReference(file, { ...identity, latePaymentItems: route.items.map((item) => item.displayText) });
  }
  async function supplement(kind: 'AFFIDAVIT' | 'FTC', bureau: Bureau, date: string) {
    const file = await readTemplateExhibit(round, kind);
    if (!file) return null;
    const recipient = bureauInfo[bureau];
    const appendixSource = kind === 'AFFIDAVIT' ? affidavitSource : { ...parsed, ftcAccounts: normalizedFtcAccounts(parsed.ftcAccounts, parsed.ftcReportDate) };
    const output = await renderMappedAppendix(file, { kind, bureau, documentDate: date, recipientName: recipient.name, recipientAddressLines: recipient.address.split('\n'), source: appendixSource });
    return kind === 'AFFIDAVIT' && affidavitJurisdiction.reviewRequired ? highlightTextInDocx(output, 'N/A') : output;
  }
  async function makeZip(items: ReviewOutput[], notes: string[], date: string) {
    const zip = new JSZip();
    items.forEach((item) => zip.file(item.path, item.blob));
    await addOrderedPacketFolders(zip, items, round, evidenceKey, parsed.name, routes.map((route) => ({ type: route.type, bureau: route.bureau })));
    zip.file('Generation Manifest.txt', ['WORKING DOCUMENTS', `Client: ${parsed.name}`, `Round: ${round}`, `Date: ${date}`, 'Affidavit and FTC are shared client documents reused inside applicable dispute packets.', ...items.map((item) => `- ${item.path}`), ...notes.map((item) => `- ${item}`)].join('\n'));
    return zip.generateAsync({ type: 'blob' });
  }
  async function generate() {
    if (!canGenerate || !evidence.supporting.length || !affidavitReady || !ftcReady || !customReady || (preferences.strictValidation && missingLetters.length)) {
      report(!ftcReady ? 'Complete FTC report-number and affected-item source data.' : 'Complete required generation checks first.', 'error');
      return;
    }
    setBusy(true);
    clearOutputs();
    const date = dateNow();
    const output: ReviewOutput[] = [];
    const notes = missingNodes.map((kind) => `${exhibitTitles[kind]} is not configured; its position remains blank.`);
    try {
      for (const route of routes) {
        const reference = refs.find((item) => item.type === route.type);
        report(`Generating ${route.bureau} ${labels[route.type]}…`);
        let file: File | null = null;
        try {
          file = reference?.file ? await withTimeout(`Reading ${route.bureau} ${labels[route.type]} template`, () => readReferenceFile(reference.id), 30_000) : null;
          if (!file) {
            notes.push(`${labels[route.type]} / ${route.bureau}: DOCX reference is missing.`);
            continue;
          }
          const blob = await withTimeout(`Generating ${route.bureau} ${labels[route.type]}`, () => letter(route, file!, date));
          output.push({ id: `${route.type}-${route.bureau}-LETTER`, path: `Editable Documents/${clean(parsed.name)} ${route.bureau} ${labels[route.type]}.docx`, type: route.type, role: 'LETTER', sequence: 1, bureau: route.bureau, count: route.items.length, detail: route.reason, blob, packetSteps: order(route.type) });
        } catch (error) {
          notes.push(`${labels[route.type]} / ${route.bureau}: ${errorMessage(error)}`);
        }
      }
      const context = routes.find((route) => route.type === 'DISPUTE');
      if (context && affidavitRequired) {
        report('Generating client Affidavit…');
        try {
          const file = await withTimeout('Generating Affidavit', () => supplement('AFFIDAVIT', context.bureau, date));
          if (file) output.push({ id: 'CLIENT-AFFIDAVIT', path: `Editable Documents/${clean(parsed.name)} 04 ${exhibitTitles.AFFIDAVIT}.docx`, type: 'DISPUTE', role: 'AFFIDAVIT', sequence: 4, bureau: 'CLIENT', count: 1, detail: 'Shared client affidavit', blob: file, packetSteps: order('DISPUTE') });
        } catch (error) {
          notes.push(`Affidavit: ${errorMessage(error)}`);
        }
      }
      if (context && ftcRequired) {
        report('Generating FTC Identity Theft Report…');
        try {
          const file = await withTimeout('Generating FTC Identity Theft Report', () => supplement('FTC', context.bureau, date));
          if (file) output.push({ id: 'CLIENT-FTC', path: `Editable Documents/${clean(parsed.name)} 06 ${exhibitTitles.FTC}.docx`, type: 'DISPUTE', role: 'FTC', sequence: 6, bureau: 'CLIENT', count: Math.min(parsed.ftcAccounts.length, MAX_FTC_ACCOUNTS), detail: 'Shared client FTC report', blob: file, packetSteps: order('DISPUTE') });
        } catch (error) {
          notes.push(`FTC Report: ${errorMessage(error)}`);
        }
      }
      report('Preparing supporting-document insert and ordered ZIP package…');
      const zip = await withTimeout('Preparing ordered package ZIP', () => makeZip(output, notes, date), ARCHIVE_TIMEOUT_MS);
      setDocs(output);
      setWarnings(notes);
      setWorkingZip({ name: `${base(parsed.name)}_${base(round)}_WORKING_DOCUMENTS.zip`, blob: zip });
      setDocDate(date);
      setPackets([]);
      setFinalZip(null);
      saveCase('REVIEW_READY', { editableCount: output.length, evidenceCount: evidence.supporting.length, pdfCount: 0 });
      report(notes.length ? 'Review package created with items requiring attention. Open Outputs to review the generation notices.' : 'Review package generated successfully.', notes.length ? 'info' : 'success');
      setPanel('Outputs');
    } catch (error) {
      const message = `Package generation failed: ${errorMessage(error)}`;
      setWarnings([...notes, message]);
      setWorkingZip(null);
      report(message, 'error');
    } finally {
      setBusy(false);
    }
  }
  async function saveEdited(output: ReviewOutput, file: File) {
    const next = docs.map((item) => item.path === output.path ? { ...item, blob: file } : item);
    try {
      const zip = await withTimeout('Saving edited document package', () => makeZip(next, warnings, docDate || dateNow()), ARCHIVE_TIMEOUT_MS);
      setDocs(next);
      setWorkingZip({ name: workingZip?.name || 'WORKING_DOCUMENTS.zip', blob: zip });
      setPackets([]);
      setFinalZip(null);
      report('Document edit saved to the working package.', 'success');
    } catch (error) {
      report(`Document save failed: ${errorMessage(error)}`, 'error');
    }
  }
  async function assemble(type: LetterType, bureau: string, items: ReviewOutput[], finalDelivery = false) {
    const supporting = evidenceKey ? await createSupportingDocumentsPdf(evidenceKey).catch(() => null) : null;
    const letterDoc = items.find((item) => item.type === type && item.bureau === bureau && item.role === 'LETTER');
    if (!supporting) throw new Error('Required Supporting Documents page could not be prepared.');
    const parts: PdfPacketPart[] = [letterDoc ? { label: labels[type], kind: 'DOCX', blob: letterDoc.blob } : { label: labels[type], kind: 'BLANK' }, { label: 'Supporting Documents', kind: 'PDF', blob: supporting }];
    if (type === 'DISPUTE') {
      const fcra = await readTemplateExhibit(round, 'FCRA');
      const attachment = await readTemplateExhibit(round, 'ATTACHMENT');
      const affidavit = items.find((item) => item.role === 'AFFIDAVIT' && (item.bureau === bureau || item.bureau === 'CLIENT'));
      const ftc = items.find((item) => item.role === 'FTC' && (item.bureau === bureau || item.bureau === 'CLIENT'));
      parts.push(fcra ? { label: 'FCRA', kind: 'PDF', blob: fcra } : { label: 'FCRA', kind: 'BLANK' }, affidavit ? { label: 'Affidavit', kind: 'DOCX', blob: affidavit.blob } : { label: 'Affidavit', kind: 'BLANK' }, attachment ? { label: 'Attachment', kind: 'PDF', blob: attachment } : { label: 'Attachment', kind: 'BLANK' }, ftc ? { label: 'FTC', kind: 'DOCX', blob: ftc.blob } : { label: 'FTC', kind: 'BLANK' });
    }
    return assembleFinalPdf(parts, { requireAllParts: finalDelivery });
  }
  async function preview(output: ReviewOutput, pending: Blob): Promise<FinalPdfPacket> {
    const items = docs.map((item) => item.path === output.path ? { ...item, blob: pending } : item);
    return { path: `Preview/${clean(parsed.name)} ${output.bureau} PACKET.pdf`, type: output.type, bureau: output.bureau, sequence: order(output.type), blob: await withTimeout(`Preparing ${output.bureau} packet preview`, () => assemble(output.type, output.bureau, items)) };
  }
  async function finalize() {
    if (!evidence.supporting.length || !affidavitReady || !ftcReady || !customReady) {
      report('Complete required evidence and document information before final PDF creation.', 'error');
      return;
    }
    setFinalizing(true);
    try {
      const final: FinalPdfPacket[] = [];
      for (const route of routes) {
        report(`Creating final PDF packet for ${route.bureau}…`);
        final.push({ path: `Final PDF Packets/${route.type === 'DISPUTE' ? 'DISPUTE PACKETS' : 'LATE PAYMENT PACKETS'}/${clean(parsed.name)} ${route.bureau} PACKET.pdf`, type: route.type, bureau: route.bureau, sequence: order(route.type), blob: await withTimeout(`Creating final PDF packet for ${route.bureau}`, () => assemble(route.type, route.bureau, docs, true), ARCHIVE_TIMEOUT_MS) });
      }
      const zip = new JSZip();
      final.forEach((item) => zip.file(item.path, item.blob));
      setPackets(final);
      setFinalZip({ name: `${base(parsed.name)}_${base(round)}_FINAL_PDF_PACKETS.zip`, blob: await withTimeout('Compressing final PDF delivery ZIP', () => zip.generateAsync({ type: 'blob' }), ARCHIVE_TIMEOUT_MS) });
      const record = saveCase('PDF_READY', { pdfCount: final.length });
      if (record) setFilings(addFinalFilings(record, final.map((item) => ({ bureau: item.bureau, type: item.type, path: item.path }))));
      report('Final PDF packets are ready for download.', 'success');
      if (preferences.openTrackerAfterFinalization) setPanel('Filing Tracker');
    } catch (error) {
      report(`Final PDF creation failed: ${errorMessage(error)}`, 'error');
    } finally {
      setFinalizing(false);
    }
  }
  function dashboard() {
    return <DashboardOperationsWorkspace cases={cases} filings={filings} activeCaseId={caseId} onNewCase={begin} onOpenTemplates={() => setPanel('Templates')} onOpenOutputs={() => setPanel(workingZip ? 'Outputs' : 'Dashboard')} onOpenTracker={() => setPanel('Filing Tracker')} onContinueCase={(item) => setPanel(item.id === caseId && item.status !== 'PDF_READY' ? (item.status === 'REVIEW_READY' ? 'Outputs' : 'Source Data') : 'Filing Tracker')} />;
  }
  function sourceView() {
    return <GuidedSourceDataFlow source={source} originalSource={originalSource} recoveryDraft={recoveryDraft} normalized={normalized} verified={verified} parsed={affidavitRequired ? affidavitSource : parsed} routes={routes} sourceWarnings={sourceWarnings} evidenceKey={evidenceKey} evidence={evidence} canGenerate={canGenerate} missingLetters={missingLetters.map((item) => labels[item])} missingInsertCount={missingNodes.length} affidavitRequired={affidavitRequired} ftcRequired={ftcRequired} customFields={customFields} strict={preferences.strictValidation} busy={busy} onImportSource={importSource} onStandardizeDraft={standardizeDraft} onStartManualDraft={startManualDraft} onEditSource={(value) => { setSource(value); setNormalized(false); clearOutputs(); }} onSourceFieldChange={setLine} onFtcAccountChange={(index, key, value) => setAccounts(parsed.ftcAccounts.map((item, itemIndex) => itemIndex === index ? { ...item, [key]: value } : item))} onFtcAccountAdd={() => parsed.ftcAccounts.length < MAX_FTC_ACCOUNTS && setAccounts([...parsed.ftcAccounts, { accountName: '', accountNumber: '', fraudBegan: ftcFraudMonthYearFromReportDate(parsed.ftcReportDate), dateDiscovered: '', fraudulentAmount: '' }])} onFtcAccountRemove={(index) => setAccounts(parsed.ftcAccounts.filter((_, itemIndex) => itemIndex !== index))} onFtcAccountSeed={seedAccounts} onRestoreOriginal={restoreOriginal} onRecoverDraft={recoverDraft} onEvidenceChanged={(value) => { setEvidence(value); clearOutputs(); saveCase(value.supporting.length ? 'EVIDENCE_READY' : 'SOURCE_LOCKED', { evidenceCount: value.supporting.length, editableCount: 0, pdfCount: 0 }); }} onMessage={(message) => report(message)} onGenerate={generate} />;
  }
  return <main className="app-shell"><aside className="sidebar"><div className="brand"><span /><div><strong>LetterGenerator</strong><small>Packet workflow</small></div></div><nav>{panels.map((item) => <button key={item} className={panel === item ? 'active' : ''} disabled={item === 'Outputs' && !workingZip} onClick={() => setPanel(item)}><strong>{item}</strong></button>)}</nav></aside><section className="main-area"><header className="header"><div><p className="eyebrow">{panel === 'Dashboard' ? 'Client operations' : `${round} workflow`}</p><h1>{panel}</h1></div></header><p className={`workspace-operation-status ${statusTone}`} role={statusTone === 'error' ? 'alert' : 'status'} aria-live="polite">{status}</p>{panel === 'Dashboard' && dashboard()}{panel === 'Templates' && <TemplateProgressiveWorkspace round={round} slots={refs} supportingReady={evidence.supporting.length > 0} onSelectRound={(value) => { setRound(value); clearOutputs(); }} onUploadLetter={uploadRef} onRemoveLetter={removeRef} onExhibitsChange={(value) => { setTemplates(value); clearOutputs(); }} onMessage={(message) => report(message)} />}{panel === 'Source Data' && sourceView()}{panel === 'Outputs' && <OutputReviewWorkspace round={round} outputs={docs} zipName={workingZip?.name} warnings={warnings} finalPackets={packets} finalizing={finalizing} finalZipName={finalZip?.name} evidenceKey={evidenceKey} evidence={evidence} onEvidenceChanged={(value) => setEvidence(value)} onMessage={(message) => report(message)} onZip={() => workingZip && download(workingZip.name, workingZip.blob)} onFinalZip={() => finalZip && download(finalZip.name, finalZip.blob)} onFinalize={finalize} onPreviewPacket={preview} onPdfDownload={(item) => download(item.path.split('/').pop() || 'packet.pdf', item.blob)} onReplace={saveEdited} />}{panel === 'Filing Tracker' && <FilingTrackerWorkspace records={filings} outputsAvailable={Boolean(workingZip)} onReturnToOutputs={() => setPanel('Outputs')} onStartCase={begin} onMarkSent={(id) => setFilings(markFilingSent(id))} />}{panel === 'Settings' && <WorkspaceSettingsPanel preferences={preferences} caseCount={cases.length} filingCount={filings.length} onChange={(value) => setPreferences(saveWorkspacePreferences(value))} onExportRecords={() => download('LETTERGENERATOR_OPERATIONAL_RECORDS.json', new Blob([JSON.stringify(exportOperationsRecords(), null, 2)], { type: 'application/json' }))} onClearRecords={() => { const value = clearOperationsRecords(); setCases(value.cases); setFilings(value.filings); }} />}</section></main>;
}
