'use client';

import { useEffect, useMemo, useState } from 'react';
import JSZip from 'jszip';
import DashboardOperationsWorkspace from './DashboardOperationsWorkspace';
import FilingTrackerWorkspace from './FilingTrackerWorkspace';
import GuidedSourceDataFlow from './GuidedSourceDataFlow';
import OutputReviewWorkspace, { type ReviewOutput } from './OutputReviewWorkspace';
import TemplateProgressiveWorkspace from './TemplateProgressiveWorkspace';
import WorkspaceSettingsPanel from './WorkspaceSettingsPanel';
import { clearOperationsRecords, exportOperationsRecords, loadClientCases, loadFilings, markFilingSent, upsertClientCase, type ClientCaseRecord, type ClientCaseStatus, type FilingRecord } from '../lib/client-operations-store';
import { addOrderedPacketFolders } from '../lib/ordered-packet-archive';
import { isDocx, renderReferenceDisputeDocx } from '../lib/docx-renderer';
import { highlightTextInDocx } from '../lib/docx-review-marker';
import { renderLatePaymentReference } from '../lib/late-reference-renderer';
import { buildFtcAffectedAccounts } from '../lib/ftc-report-renderer';
import { resolveAffidavitJurisdiction } from '../lib/affidavit-jurisdiction';
import { bureauInfo, bureaus, createNormalizedSourceCopy, detectRoutes, parseSource, type Bureau, type LetterRoute, type LetterType } from '../lib/letter-engine';
import { loadPacketAssets, type PacketAssets } from '../lib/packet-assets';
import { defaultReferences, loadReferenceMeta, readReferenceFile, removeReferenceFile, saveReferenceFile, saveReferenceMeta, type LetterReference, type Round } from '../lib/reference-store';
import { renderMappedAppendix } from '../lib/supplemental-template-renderer';
import { unresolvedCustomTemplateFields } from '../lib/template-contracts';
import { exhibitTitles, loadTemplateExhibits, readTemplateExhibit, type ExhibitKind, type TemplateExhibits } from '../lib/template-exhibits';
import { defaultWorkspacePreferences, loadWorkspacePreferences, saveWorkspacePreferences, type WorkspacePreferences } from '../lib/workspace-preferences';
import { packetOrderLabels, isFtcEnabled } from '../lib/workflow-framework';
import { activeWorkflowDiagnostics, assessRouteCoverage, requiredGenerationFailureMessage } from '../lib/workflow-execution';

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
const order = (type: LetterType) => packetOrderLabels(type);
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
async function withTimeout<T>(phase: string, operation: () => Promise<T>, timeoutMs = GENERATION_TIMEOUT_MS): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation(),
      new Promise<T>((_, reject) => { timer = setTimeout(() => reject(new Error(`${phase} timed out after ${Math.round(timeoutMs / 1000)} seconds.`)), timeoutMs); })
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
  const [orderedZip, setOrderedZip] = useState<{ name: string; blob: Blob } | null>(null);
  const [docDate, setDocDate] = useState('');
  const [busy, setBusy] = useState(false);
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
  const affidavitRequired = dispute && disputed;
  const affidavitJurisdiction = useMemo(() => resolveAffidavitJurisdiction(parsed), [parsed]);
  const affidavitSource = useMemo(() => ({ ...parsed, address: parsed.address.length ? parsed.address : ['N/A'], affidavitState: affidavitJurisdiction.state, affidavitCounty: affidavitJurisdiction.county }), [parsed, affidavitJurisdiction]);
  const sourceWarnings = [...activeWorkflowDiagnostics(parsed.diagnostics.filter((item) => item.level === 'warning')), ...(affidavitRequired && affidavitJurisdiction.reviewRequired ? [{ message: affidavitJurisdiction.explanation }] : [])];
  const affidavitReady = !affidavitRequired || Boolean(affidavitSource.affidavitState.trim() && affidavitSource.affidavitCounty.trim());
  const activeTemplateContracts = [templates.FCRA, templates.AFFIDAVIT, templates.ATTACHMENT, templates.FTC].map((item) => item?.contract);
  const customFields = unresolvedCustomTemplateFields([...refs.map((item) => item.contract), ...activeTemplateContracts]);
  const customReady = customFields.every((item) => !item.required || Boolean(parsed.templateFields[item.key]?.trim()));
  const missingNodes = dispute ? requirements.filter((kind) => !templates[kind]) : [];
  const canGenerate = verified && routes.length > 0;

  useEffect(() => setEvidence(evidenceKey ? loadPacketAssets(evidenceKey) : emptyEvidence()), [evidenceKey]);

  function report(message: string, tone: StatusTone = 'info') { setStatus(message); setStatusTone(tone); }
  function clearOutputs() { setDocs([]); setWarnings([]); setOrderedZip(null); setDocDate(''); }
  function captureDraft(label: string) { if (source.trim()) setRecoveryDraft({ text: source, normalized, label, capturedAt: new Date().toISOString() }); }
  function saveCase(statusValue: ClientCaseStatus, data: Partial<ClientCaseRecord> = {}) {
    const id = data.id || caseId;
    const name = data.clientName || parsed.name;
    if (!id || !name) return null;
    const previous = cases.find((item) => item.id === id);
    const record: ClientCaseRecord = { id, clientName: name, round, routeCount: routes.length, bureaus: Array.from(new Set(routes.map((route) => route.bureau))), evidenceCount: data.evidenceCount ?? previous?.evidenceCount ?? evidence.supporting.length, editableCount: data.editableCount ?? previous?.editableCount ?? docs.length, pdfCount: data.pdfCount ?? previous?.pdfCount ?? 0, status: statusValue, updatedAt: new Date().toISOString() };
    setCases(upsertClientCase(record));
    return record;
  }
  function begin() {
    setRound(preferences.defaultRound); setSource(''); setOriginalSource(''); setRecoveryDraft(null); setNormalized(false); setCaseId(''); setEvidence(emptyEvidence()); clearOutputs(); report('Load a client source TXT to begin a new package.'); setPanel('Source Data');
  }
  function importSource(value: string, action: string) {
    if (!value.trim()) return;
    if (source.trim()) captureDraft(`Working draft preserved before ${action.toLowerCase()} replacement`);
    const text = createNormalizedSourceCopy(value).text;
    const imported = parseSource(text);
    const id = crypto.randomUUID();
    setOriginalSource(value); setSource(text); setNormalized(true); setCaseId(id); setEvidence(emptyEvidence()); clearOutputs();
    if (imported.name) {
      const detected = detectRoutes(imported);
      setCases(upsertClientCase({ id, clientName: imported.name, round, routeCount: detected.length, bureaus: Array.from(new Set(detected.map((route) => route.bureau))), evidenceCount: 0, editableCount: 0, pdfCount: 0, status: 'SOURCE_LOCKED', updatedAt: new Date().toISOString() }));
    }
    report(`${action} source imported and protected as the original baseline.`, 'success');
  }
  function standardizeDraft(value: string) {
    if (!value.trim()) return;
    const text = createNormalizedSourceCopy(value).text;
    const standardized = parseSource(text);
    const id = caseId || crypto.randomUUID();
    setSource(text); setNormalized(true); if (!caseId) setCaseId(id); clearOutputs();
    if (standardized.name) {
      const detected = detectRoutes(standardized);
      setCases(upsertClientCase({ id, clientName: standardized.name, round, routeCount: detected.length, bureaus: Array.from(new Set(detected.map((route) => route.bureau))), evidenceCount: evidence.supporting.length, editableCount: 0, pdfCount: 0, status: evidence.supporting.length ? 'EVIDENCE_READY' : 'SOURCE_LOCKED', updatedAt: new Date().toISOString() }));
    }
    report('Working draft standardized. The imported original remains protected and evidence has been retained.', 'success');
  }
  function startManualDraft(value: string) { if (source.trim()) captureDraft('Working draft preserved before blank manual format'); setOriginalSource(''); setSource(value); setNormalized(false); setCaseId(crypto.randomUUID()); setEvidence(emptyEvidence()); clearOutputs(); report('Manual draft opened. Importing a TXT later will require confirmation before replacement.'); }
  function restoreOriginal() { if (!originalSource.trim()) return; if (source.trim() && source !== originalSource) captureDraft('Working draft saved before restoring imported original'); setSource(originalSource); setNormalized(false); clearOutputs(); report('Imported original restored. Your previous working draft is available through Recover saved draft. Supporting evidence was retained.', 'success'); }
  function recoverDraft() { if (!recoveryDraft) return; const active: SourceDraftSnapshot = { text: source, normalized, label: 'Version saved before draft recovery', capturedAt: new Date().toISOString() }; const restored = recoveryDraft; setSource(restored.text); setNormalized(restored.normalized); setRecoveryDraft(active); clearOutputs(); report(`${restored.label} recovered. Supporting evidence was retained.`, 'success'); }
  function setLine(key: string, value: string) {
    const pattern = new RegExp(`^${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:.*$`, 'im');
    const line = `${key}: ${value}`;
    const anchor = /\n\s*\n(?=(DISPUTE ACCOUNTS|HARD INQUIRIES|LATE PAYMENTS)\b)/i;
    setSource(pattern.test(source) ? source.replace(pattern, line) : anchor.test(source) ? source.replace(anchor, `\n${line}\n\n`) : `${source.trim()}\n${line}`);
    setNormalized(true); clearOutputs();
  }
  async function uploadRef(slot: LetterReference, file: File) { if (!isDocx(file.name)) { report('Letter references accept DOCX files only.', 'error'); return; } const contract = await saveReferenceFile(slot, file); setReferences((items) => items.map((item) => item.id === slot.id ? { ...item, file: file.name, size: file.size, contract } : item)); clearOutputs(); }
  async function removeRef(slot: LetterReference) { await removeReferenceFile(slot.id); setReferences((items) => items.map((item) => item.id === slot.id ? { ...item, file: '', size: undefined, contract: undefined } : item)); clearOutputs(); }
  async function letter(route: LetterRoute, file: File, date: string) {
    const recipient = bureauInfo[route.bureau];
    const identity = { consumerName: parsed.name, addressLines: parsed.address, dob: parsed.dob, ssn: parsed.ssn, letterDate: date, bureauName: recipient.name, bureauAddressLines: recipient.address.split('\n') };
    return route.type === 'DISPUTE' ? renderReferenceDisputeDocx(file, { ...identity, disputeItems: route.items.filter((item) => item.type === 'DISPUTE_ACCOUNT').map((item) => item.displayText), hardInquiryItems: route.items.filter((item) => item.type === 'HARD_INQUIRY').map((item) => item.displayText) }) : renderLatePaymentReference(file, { ...identity, latePaymentItems: route.items.map((item) => item.displayText) });
  }
  async function affidavit(bureau: Bureau, date: string) {
    const file = await readTemplateExhibit(round, 'AFFIDAVIT');
    if (!file) return null;
    const recipient = bureauInfo[bureau];
    const output = await renderMappedAppendix(file, { kind: 'AFFIDAVIT', bureau, documentDate: date, recipientName: recipient.name, recipientAddressLines: recipient.address.split('\n'), source: affidavitSource });
    return affidavitJurisdiction.reviewRequired ? highlightTextInDocx(output, 'N/A') : output;
  }
  async function ftcReport(bureau: Bureau, date: string) {
    const file = await readTemplateExhibit(round, 'FTC');
    if (!file) return null;
    const recipient = bureauInfo[bureau];
    const ftcAccounts = buildFtcAffectedAccounts(parsed);
    const ftcSource = {
      ...parsed,
      address: parsed.address.length ? parsed.address : ['N/A'],
      country: parsed.country || 'USA',
      phone: parsed.phone || 'N/A',
      ftcReportNumber: parsed.ftcReportNumber || '202084447',
      ftcReportDate: parsed.ftcReportDate || date,
      ftcAccounts
    };
    const blob = await renderMappedAppendix(file, { kind: 'FTC', bureau, documentDate: date, recipientName: recipient.name, recipientAddressLines: recipient.address.split('\n'), source: ftcSource });
    return { blob, count: ftcAccounts.length };
  }
  async function makeZip(items: ReviewOutput[], notes: string[], date: string) {
    const zip = new JSZip();
    await addOrderedPacketFolders(zip, items, round, evidenceKey, parsed.name, routes.map((route) => ({ type: route.type, bureau: route.bureau })));
    zip.file('Package Manifest.txt', ['COMPLETE ORDERED COMPONENT PACKAGE', `Client: ${parsed.name}`, `Round: ${round}`, `Date: ${date}`, 'Delivery format: ordered bureau folders only.', 'Dispute order: 01 Dispute Letter.docx; 02 Supporting Documents.pdf; 03 FCRA Legal Exhibit.pdf; 04 Affidavit.docx; 05 Attachment.pdf; 06 FTC Identity Theft Report.docx.', ...notes.map((item) => `- ${item}`)].join('\n'));
    return zip.generateAsync({ type: 'blob' });
  }
  async function generate() {
    if (!canGenerate || !evidence.supporting.length || !affidavitReady || !customReady || missingNodes.length || (preferences.strictValidation && missingLetters.length)) {
      const detail = missingNodes.length ? ` Required Templates items: ${missingNodes.map((kind) => exhibitTitles[kind]).join(', ')}.` : '';
      report(`Complete the required ordered-package contract before generation.${detail}`, 'error'); return;
    }
    setBusy(true); clearOutputs();
    const date = dateNow();
    const output: ReviewOutput[] = [];
    const notes: string[] = [];
    try {
      for (const route of routes) {
        const reference = refs.find((item) => item.type === route.type);
        report(`Generating ${route.bureau} ${labels[route.type]}…`);
        try {
          const file = reference?.file ? await withTimeout(`Reading ${route.bureau} ${labels[route.type]} template`, () => readReferenceFile(reference.id), 30_000) : null;
          if (!file) { notes.push(`${labels[route.type]} / ${route.bureau}: DOCX reference is missing.`); continue; }
          const blob = await withTimeout(`Generating ${route.bureau} ${labels[route.type]}`, () => letter(route, file, date));
          output.push({ id: `${route.type}-${route.bureau}-LETTER`, path: `Editable Documents/${clean(parsed.name)} ${route.bureau} ${labels[route.type]}.docx`, type: route.type, role: 'LETTER', sequence: 1, bureau: route.bureau, count: route.items.length, detail: route.reason, blob, packetSteps: order(route.type) });
        } catch (error) { notes.push(`${labels[route.type]} / ${route.bureau}: ${errorMessage(error)}`); }
      }
      const letterCoverage = assessRouteCoverage(routes, output);
      if (!letterCoverage.complete) {
        const technicalReason = notes.find((note) => /(?:Dispute|Late Payment) Letter\s*\//i.test(note));
        setWarnings(notes);
        report(requiredGenerationFailureMessage(letterCoverage, technicalReason ? `Resolve this template issue and retry: ${technicalReason}` : 'Resolve required templates and retry.'), 'error');
        return;
      }
      const context = routes.find((route) => route.type === 'DISPUTE');
      if (context) {
        if (isFtcEnabled()) {
          report('Generating FTC Identity Theft Report…');
          const ftc = await withTimeout('Generating FTC Identity Theft Report', () => ftcReport(context.bureau, date));
          if (!ftc) throw new Error('Required component missing: 06 FTC Identity Theft Report.docx template is not configured.');
          if (!ftc.count) notes.push('FTC Identity Theft Report: no affected accounts were detected; review the generated FTC document before filing.');
          output.push({ id: 'CLIENT-FTC-IDENTITY-THEFT-REPORT', path: `Editable Documents/${clean(parsed.name)} 06 FTC Identity Theft Report.docx`, type: 'DISPUTE', role: 'FTC', sequence: 6, bureau: 'CLIENT', count: ftc.count, detail: `${ftc.count} affected FTC item(s)`, blob: ftc.blob, packetSteps: order('DISPUTE') });
        }
        report('Generating client Affidavit…');
        const file = await withTimeout('Generating Affidavit', () => affidavit(context.bureau, date));
        if (!file) throw new Error('Required component missing: 04 Affidavit.docx could not be generated.');
        output.push({ id: 'CLIENT-AFFIDAVIT', path: `Editable Documents/${clean(parsed.name)} 04 ${exhibitTitles.AFFIDAVIT}.docx`, type: 'DISPUTE', role: 'AFFIDAVIT', sequence: 5, bureau: 'CLIENT', count: 1, detail: 'Shared client affidavit', blob: file, packetSteps: order('DISPUTE') });
      }
      report('Preparing complete ordered component package…');
      const zip = await withTimeout('Preparing ordered package ZIP', () => makeZip(output, notes, date), ARCHIVE_TIMEOUT_MS);
      const zipName = `${base(parsed.name)}_${base(round)}_ORDERED_PACKET_PACKAGE.zip`;
      setDocs(output); setWarnings(notes); setOrderedZip({ name: zipName, blob: zip }); setDocDate(date);
      saveCase('REVIEW_READY', { editableCount: output.length, evidenceCount: evidence.supporting.length, pdfCount: 0 });
      report('Complete ordered packet package is ready for review and download.', 'success');
      setPanel('Outputs');
    } catch (error) { const message = `Ordered package generation failed: ${errorMessage(error)}`; setWarnings([...notes, message]); setOrderedZip(null); report(message, 'error'); }
    finally { setBusy(false); }
  }
  async function saveEdited(output: ReviewOutput, file: File) {
    const next = docs.map((item) => item.path === output.path ? { ...item, blob: file } : item);
    try {
      const zip = await withTimeout('Rebuilding ordered component package', () => makeZip(next, warnings, docDate || dateNow()), ARCHIVE_TIMEOUT_MS);
      setDocs(next); setOrderedZip({ name: orderedZip?.name || 'ORDERED_PACKET_PACKAGE.zip', blob: zip }); report('Document edit saved and ordered package rebuilt.', 'success');
    } catch (error) { report(`Package rebuild failed: ${errorMessage(error)}`, 'error'); }
  }
  async function updateOutputEvidence(value: PacketAssets) {
    setEvidence(value);
    if (!docs.length) return;
    try {
      const zip = await withTimeout('Rebuilding package with updated supporting documents', () => makeZip(docs, warnings, docDate || dateNow()), ARCHIVE_TIMEOUT_MS);
      setOrderedZip({ name: orderedZip?.name || 'ORDERED_PACKET_PACKAGE.zip', blob: zip }); report('Supporting Documents updated and ordered package rebuilt.', 'success');
    } catch (error) { setOrderedZip(null); report(`Package rebuild failed: ${errorMessage(error)}`, 'error'); }
  }
  function dashboard() { return <DashboardOperationsWorkspace cases={cases} filings={filings} activeCaseId={caseId} onNewCase={begin} onOpenTemplates={() => setPanel('Templates')} onOpenOutputs={() => setPanel(orderedZip ? 'Outputs' : 'Dashboard')} onOpenTracker={() => setPanel('Filing Tracker')} onContinueCase={(item) => setPanel(item.id === caseId && item.status !== 'PDF_READY' ? (item.status === 'REVIEW_READY' ? 'Outputs' : 'Source Data') : 'Filing Tracker')} />; }
  function sourceView() { return <GuidedSourceDataFlow source={source} originalSource={originalSource} recoveryDraft={recoveryDraft} normalized={normalized} verified={verified} parsed={affidavitRequired ? affidavitSource : parsed} routes={routes} sourceWarnings={sourceWarnings} evidenceKey={evidenceKey} evidence={evidence} canGenerate={canGenerate} missingLetters={missingLetters.map((item) => labels[item])} missingInsertCount={missingNodes.length} affidavitRequired={affidavitRequired} ftcRequired={Boolean(parsed.ftcAccounts.length)} customFields={customFields} strict={preferences.strictValidation} busy={busy} onImportSource={importSource} onStandardizeDraft={standardizeDraft} onStartManualDraft={startManualDraft} onEditSource={(value) => { setSource(value); setNormalized(false); clearOutputs(); }} onSourceFieldChange={setLine} onFtcAccountChange={() => {}} onFtcAccountAdd={() => {}} onFtcAccountRemove={() => {}} onFtcAccountSeed={() => {}} onRestoreOriginal={restoreOriginal} onRecoverDraft={recoverDraft} onEvidenceChanged={(value) => { setEvidence(value); clearOutputs(); saveCase(value.supporting.length ? 'EVIDENCE_READY' : 'SOURCE_LOCKED', { evidenceCount: value.supporting.length, editableCount: 0, pdfCount: 0 }); }} onMessage={(message) => report(message)} onGenerate={generate} />; }
  return <main className="app-shell"><aside className="sidebar"><div className="brand"><span /><div><strong>LetterGenerator</strong><small>Packet workflow</small></div></div><nav>{panels.map((item) => <button key={item} className={panel === item ? 'active' : ''} disabled={item === 'Outputs' && !orderedZip} onClick={() => setPanel(item)}><strong>{item}</strong></button>)}</nav></aside><section className="main-area"><header className="header"><div><p className="eyebrow">{panel === 'Dashboard' ? 'Client operations' : `${round} workflow`}</p><h1>{panel}</h1></div></header><p className={`workspace-operation-status ${statusTone}`} role={statusTone === 'error' ? 'alert' : 'status'} aria-live="polite">{status}</p>{panel === 'Dashboard' && dashboard()}{panel === 'Templates' && <TemplateProgressiveWorkspace round={round} slots={refs} supportingReady={evidence.supporting.length > 0} onSelectRound={(value) => { setRound(value); clearOutputs(); }} onUploadLetter={uploadRef} onRemoveLetter={removeRef} onExhibitsChange={(value) => { setTemplates(value); clearOutputs(); }} onMessage={(message) => report(message)} />}{panel === 'Source Data' && sourceView()}{panel === 'Outputs' && <OutputReviewWorkspace round={round} outputs={docs} expectedRoutes={routes} zipName={orderedZip?.name} warnings={warnings} evidenceKey={evidenceKey} evidence={evidence} onEvidenceChanged={(value) => void updateOutputEvidence(value)} onMessage={(message) => report(message)} onZip={() => orderedZip && download(orderedZip.name, orderedZip.blob)} onReplace={saveEdited} />}{panel === 'Filing Tracker' && <FilingTrackerWorkspace records={filings} outputsAvailable={Boolean(orderedZip)} onReturnToOutputs={() => setPanel('Outputs')} onStartCase={begin} onMarkSent={(id) => setFilings(markFilingSent(id))} />}{panel === 'Settings' && <WorkspaceSettingsPanel preferences={preferences} caseCount={cases.length} filingCount={filings.length} onChange={(value) => setPreferences(saveWorkspacePreferences(value))} onExportRecords={() => download('LETTERGENERATOR_OPERATIONAL_RECORDS.json', new Blob([JSON.stringify(exportOperationsRecords(), null, 2)], { type: 'application/json' }))} onClearRecords={() => { const value = clearOperationsRecords(); setCases(value.cases); setFilings(value.filings); }} />}</section></main>;
}
