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
import { renderLatePaymentReference } from '../lib/late-reference-renderer';
import { bureauInfo, createNormalizedSourceCopy, detectRoutes, parseSource, type Bureau, type LetterRoute, type LetterType } from '../lib/letter-engine';
import { loadPacketAssets, type PacketAssets } from '../lib/packet-assets';
import { createSupportingDocumentsPdf } from '../lib/packet-renderer';
import { defaultReferences, loadReferenceMeta, readReferenceFile, removeReferenceFile, saveReferenceFile, saveReferenceMeta, type LetterReference, type Round } from '../lib/reference-store';
import { renderMappedAppendix } from '../lib/supplemental-template-renderer';
import { exhibitTitles, loadTemplateExhibits, readTemplateExhibit, type ExhibitKind, type TemplateExhibits } from '../lib/template-exhibits';
import { defaultWorkspacePreferences, loadWorkspacePreferences, saveWorkspacePreferences, type WorkspacePreferences } from '../lib/workspace-preferences';

type Panel = 'Dashboard' | 'Templates' | 'Source Data' | 'Outputs' | 'Filing Tracker' | 'Settings';
const panels: Panel[] = ['Dashboard', 'Templates', 'Source Data', 'Outputs', 'Filing Tracker', 'Settings'];
const typeLabel: Record<LetterType, string> = { DISPUTE: 'Dispute Letter', LATE_PAYMENT: 'Late Payment Letter' };
const disputeRequirements: ExhibitKind[] = ['FCRA', 'AFFIDAVIT', 'ATTACHMENT', 'FTC'];
const emptyEvidence = (): PacketAssets => ({ supporting: [], legalPdf: null });
const emptyTemplates = (): TemplateExhibits => ({ FCRA: null, AFFIDAVIT: null, ATTACHMENT: null, FTC: null });
function dateInEasternTime() { return new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'America/New_York' }).format(new Date()); }
function clean(value: string) { return (value || 'CLIENT').replace(/[\/:*?"<>|]+/g, '').replace(/\s+/g, ' ').trim().toUpperCase(); }
function fileBase(value: string) { return clean(value).replace(/[^A-Z0-9]+/g, '_'); }
function deliver(name: string, blob: Blob) { const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = name; link.click(); URL.revokeObjectURL(url); }
function sequence(type: LetterType) { return type === 'LATE_PAYMENT' ? ['01 Late Payment Letter', '02 Supporting Documents'] : ['01 Dispute Letter', '02 Supporting Documents', '03 FCRA', '04 Affidavit', '05 Attachment', '06 FTC']; }

export default function LetterGeneratorWorkspaceV2() {
  const [panel, setPanel] = useState<Panel>('Dashboard');
  const [round, setRound] = useState<Round>('1st Round');
  const [preferences, setPreferences] = useState<WorkspacePreferences>(defaultWorkspacePreferences);
  const [references, setReferences] = useState<LetterReference[]>(defaultReferences);
  const [source, setSource] = useState('');
  const [originalSource, setOriginalSource] = useState('');
  const [normalized, setNormalized] = useState(false);
  const [caseId, setCaseId] = useState('');
  const [caseRecords, setCaseRecords] = useState<ClientCaseRecord[]>([]);
  const [filings, setFilings] = useState<FilingRecord[]>([]);
  const [evidence, setEvidence] = useState<PacketAssets>(emptyEvidence);
  const [templates, setTemplates] = useState<TemplateExhibits>(emptyTemplates);
  const [reviewDocs, setReviewDocs] = useState<ReviewOutput[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [workingZip, setWorkingZip] = useState<{ name: string; blob: Blob } | null>(null);
  const [finalPackets, setFinalPackets] = useState<FinalPdfPacket[]>([]);
  const [finalZip, setFinalZip] = useState<{ name: string; blob: Blob } | null>(null);
  const [documentDate, setDocumentDate] = useState('');
  const [busy, setBusy] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [status, setStatus] = useState('Configure packet templates, then load a client source file.');

  useEffect(() => {
    const savedPreferences = loadWorkspacePreferences();
    setPreferences(savedPreferences);
    setRound(savedPreferences.defaultRound);
    setReferences(loadReferenceMeta());
    setCaseRecords(loadClientCases());
    setFilings(loadFilings());
  }, []);
  useEffect(() => saveReferenceMeta(references), [references]);
  useEffect(() => setTemplates(loadTemplateExhibits(round)), [round]);

  const currentReferences = references.filter((item) => item.round === round);
  const parsed = useMemo(() => parseSource(source), [source]);
  const routes = useMemo(() => detectRoutes(parsed), [parsed]);
  const verified = normalized && Boolean(parsed.name);
  const evidenceKey = caseId ? `${round}::${caseId}` : '';
  const sourceWarnings = parsed.diagnostics?.filter((item) => item.level === 'warning') || [];
  const missingLetters = Array.from(new Set(routes.map((route) => route.type))).filter((type) => !currentReferences.find((item) => item.type === type)?.file);
  const hasDispute = routes.some((route) => route.type === 'DISPUTE');
  const missingDisputeNodes = hasDispute ? disputeRequirements.filter((kind) => !templates[kind]) : [];
  const canGenerate = verified && routes.length > 0;
  useEffect(() => setEvidence(verified && evidenceKey ? loadPacketAssets(evidenceKey) : emptyEvidence()), [verified, evidenceKey]);

  function clearOutputs() { setReviewDocs([]); setWarnings([]); setWorkingZip(null); setFinalPackets([]); setFinalZip(null); setDocumentDate(''); }
  function caseRecord(statusValue: ClientCaseStatus, values?: { id?: string; name?: string; caseRoutes?: LetterRoute[]; evidenceCount?: number; editableCount?: number; pdfCount?: number }) {
    const id = values?.id || caseId;
    const name = values?.name || parsed.name;
    const trackedRoutes = values?.caseRoutes || routes;
    if (!id || !name) return null;
    const previous = caseRecords.find((record) => record.id === id);
    const record: ClientCaseRecord = {
      id, clientName: name, round, routeCount: trackedRoutes.length,
      bureaus: Array.from(new Set(trackedRoutes.map((route) => route.bureau))),
      evidenceCount: values?.evidenceCount ?? previous?.evidenceCount ?? evidence.supporting.length,
      editableCount: values?.editableCount ?? previous?.editableCount ?? reviewDocs.length,
      pdfCount: values?.pdfCount ?? previous?.pdfCount ?? finalPackets.length,
      status: statusValue, updatedAt: new Date().toISOString()
    };
    setCaseRecords(upsertClientCase(record));
    return record;
  }
  function updatePreferences(next: WorkspacePreferences) {
    setPreferences(saveWorkspacePreferences(next));
    if (!caseId) setRound(next.defaultRound);
    setStatus('Workspace settings saved.');
  }
  function beginNewCase() {
    setRound(preferences.defaultRound); setSource(''); setOriginalSource(''); setNormalized(false); setCaseId(''); setEvidence(emptyEvidence()); clearOutputs(); setPanel('Source Data'); setStatus('Add client source data to begin a new case.');
  }
  function normalizeInput(value: string, action: string) {
    if (!value.trim()) return;
    const normalizedText = createNormalizedSourceCopy(value).text;
    const nextParsed = parseSource(normalizedText);
    const nextRoutes = detectRoutes(nextParsed);
    const nextId = crypto.randomUUID();
    setOriginalSource(value); setSource(normalizedText); setNormalized(true); setCaseId(nextId); setEvidence(emptyEvidence()); clearOutputs();
    if (nextParsed.name) caseRecord('SOURCE_LOCKED', { id: nextId, name: nextParsed.name, caseRoutes: nextRoutes, evidenceCount: 0, editableCount: 0, pdfCount: 0 });
    setStatus(`${action} source standardized. Lock the source data to continue.`);
  }
  async function uploadReference(slot: LetterReference, file: File) { if (!isDocx(file.name)) { setStatus('Letter references accept DOCX files only.'); return; } await saveReferenceFile(slot, file); setReferences((items) => items.map((item) => item.id === slot.id ? { ...item, file: file.name, size: file.size } : item)); clearOutputs(); setStatus(`${slot.name} saved.`); }
  async function removeReference(slot: LetterReference) { await removeReferenceFile(slot.id); setReferences((items) => items.map((item) => item.id === slot.id ? { ...item, file: '', size: undefined } : item)); clearOutputs(); }
  async function createLetter(route: LetterRoute, template: File, date: string) { const recipient = bureauInfo[route.bureau]; const identity = { consumerName: parsed.name, addressLines: parsed.address, dob: parsed.dob, ssn: parsed.ssn, letterDate: date, bureauName: recipient.name, bureauAddressLines: recipient.address.split('\n') }; return route.type === 'DISPUTE' ? renderReferenceDisputeDocx(template, { ...identity, disputeItems: route.items.filter((item) => item.type === 'DISPUTE_ACCOUNT').map((item) => item.displayText), hardInquiryItems: route.items.filter((item) => item.type === 'HARD_INQUIRY').map((item) => item.displayText) }) : renderLatePaymentReference(template, { ...identity, latePaymentItems: route.items.map((item) => item.displayText) }); }
  async function createMappedDoc(kind: 'AFFIDAVIT' | 'FTC', bureau: Bureau, date: string) { const template = await readTemplateExhibit(round, kind); if (!template) return null; const recipient = bureauInfo[bureau]; return renderMappedAppendix(template, { kind, bureau, documentDate: date, recipientName: recipient.name, recipientAddressLines: recipient.address.split('\n'), source: parsed }); }
  async function createWorkingZip(docs: ReviewOutput[], notices: string[], date: string) {
    const zip = new JSZip(); docs.forEach((doc) => zip.file(doc.path, doc.blob)); await addOrderedPacketFolders(zip, docs, round, evidenceKey, parsed.name);
    zip.file('Generation Manifest.txt', ['WORKING DOCUMENTS - REVIEW BEFORE FINALIZATION', `Client: ${parsed.name}`, `Round: ${round}`, `Date: ${date}`, '', 'Ordered packet folders:', 'DISPUTE PACKETS/ contains each dispute letter, required supporting documents and positions 03 through 06 in filing order.', 'LATE PAYMENT PACKETS/ is created only when late-payment data exists and remains separate from dispute packets.', 'Required supporting evidence is retained at packet position 02.', '', 'Dispute packet order:', ...sequence('DISPUTE'), '', 'Late Payment packet order:', ...sequence('LATE_PAYMENT'), '', 'Editable documents:', ...docs.map((doc) => `- ${doc.path}`), ...(notices.length ? ['', 'Needs attention:', ...notices.map((notice) => `- ${notice}`)] : [])].join('\n'));
    return zip.generateAsync({ type: 'blob' });
  }
  async function generateReviewDocuments() {
    if (!canGenerate || !evidence.supporting.length || (preferences.strictValidation && missingLetters.length)) { setStatus(!evidence.supporting.length ? 'Supporting Documents are required. Upload and arrange at least one evidence image before continuing.' : 'Complete required generation checks first.'); return; }
    setBusy(true); const date = dateInEasternTime(); const docs: ReviewOutput[] = []; const notices: string[] = [];
    missingDisputeNodes.forEach((kind) => notices.push(`${exhibitTitles[kind]} is not configured; its packet position will be retained as a blank page.`));
    for (const route of routes) {
      const slot = currentReferences.find((item) => item.type === route.type); const template = slot?.file ? await readReferenceFile(slot.id) : null;
      if (!template) { notices.push(`${typeLabel[route.type]} / ${route.bureau}: DOCX reference is missing.`); continue; }
      try {
        const letter = await createLetter(route, template, date); const prefix = `${clean(parsed.name)} ${route.bureau}`;
        docs.push({ id: `${route.type}-${route.bureau}-LETTER`, path: `Editable Documents/${prefix} ${typeLabel[route.type]}.docx`, type: route.type, role: 'LETTER', sequence: 1, bureau: route.bureau, count: route.items.length, detail: `${route.reason} · Ordered packet folder and final PDF preserve filing sequence`, blob: letter, packetSteps: sequence(route.type) });
        if (route.type === 'DISPUTE') for (const item of [{ kind: 'AFFIDAVIT' as const, role: 'AFFIDAVIT' as const, number: 4 }, { kind: 'FTC' as const, role: 'FTC' as const, number: 6 }]) { if (!templates[item.kind]) continue; const mapped = await createMappedDoc(item.kind, route.bureau, date); if (mapped) docs.push({ id: `${route.bureau}-${item.kind}`, path: `Editable Documents/${prefix} ${String(item.number).padStart(2, '0')} ${exhibitTitles[item.kind]}.docx`, type: 'DISPUTE', role: item.role, sequence: item.number, bureau: route.bureau, count: parsed.dispute[route.bureau].length, detail: 'Source-populated DOCX · edit in final filing order', blob: mapped, packetSteps: sequence('DISPUTE') }); }
      } catch (error) { notices.push(`${typeLabel[route.type]} / ${route.bureau}: ${error instanceof Error ? error.message : 'Generation failed.'}`); }
    }
    const zip = await createWorkingZip(docs, notices, date);
    setReviewDocs(docs); setWarnings(notices); setWorkingZip({ name: `${fileBase(parsed.name)}_${fileBase(round)}_WORKING_DOCUMENTS.zip`, blob: zip }); setDocumentDate(date); setFinalPackets([]); setFinalZip(null); setBusy(false); caseRecord('REVIEW_READY', { evidenceCount: evidence.supporting.length, editableCount: docs.length, pdfCount: 0 }); setPanel('Outputs'); setStatus(`${docs.length} editable document(s) prepared.`);
  }
  async function saveEdited(output: ReviewOutput, file: File) { const docs = reviewDocs.map((item) => item.path === output.path ? { ...item, blob: file, detail: 'Edited and saved for finalization' } : item); const zip = await createWorkingZip(docs, warnings, documentDate || dateInEasternTime()); setReviewDocs(docs); setWorkingZip({ name: workingZip?.name || 'WORKING_DOCUMENTS.zip', blob: zip }); setFinalPackets([]); setFinalZip(null); caseRecord('REVIEW_READY', { editableCount: docs.length, pdfCount: 0 }); setStatus('Edit saved.'); }
  async function updateEvidenceDuringReview(next: PacketAssets) { setEvidence(next); setFinalPackets([]); setFinalZip(null); if (reviewDocs.length) { const zip = await createWorkingZip(reviewDocs, warnings, documentDate || dateInEasternTime()); setWorkingZip({ name: workingZip?.name || `${fileBase(parsed.name)}_${fileBase(round)}_WORKING_DOCUMENTS.zip`, blob: zip }); } caseRecord(reviewDocs.length ? 'REVIEW_READY' : next.supporting.length ? 'EVIDENCE_READY' : 'SOURCE_LOCKED', { evidenceCount: next.supporting.length, pdfCount: 0 }); setStatus(next.supporting.length ? 'Supporting Documents layout saved. Recreate final PDFs after review.' : 'Supporting Documents are required. Add evidence again before final PDF creation.'); }
  async function assemblePacketForRoute(type: LetterType, bureau: string, docs: ReviewOutput[]) {
    const supportingPdf = evidenceKey ? await createSupportingDocumentsPdf(evidenceKey).catch(() => null) : null; const letter = docs.find((doc) => doc.type === type && doc.bureau === bureau && doc.role === 'LETTER');
    if (!supportingPdf) throw new Error('Required Supporting Documents page could not be prepared.');
    const parts: PdfPacketPart[] = [letter ? { label: typeLabel[type], kind: 'DOCX', blob: letter.blob } : { label: typeLabel[type], kind: 'BLANK' }, { label: 'Supporting Documents', kind: 'PDF', blob: supportingPdf }];
    if (type === 'DISPUTE') { const fcra = await readTemplateExhibit(round, 'FCRA'); const attachment = await readTemplateExhibit(round, 'ATTACHMENT'); const affidavit = docs.find((doc) => doc.bureau === bureau && doc.role === 'AFFIDAVIT'); const ftc = docs.find((doc) => doc.bureau === bureau && doc.role === 'FTC'); parts.push(fcra ? { label: 'FCRA', kind: 'PDF', blob: fcra } : { label: 'FCRA', kind: 'BLANK' }, affidavit ? { label: 'Affidavit', kind: 'DOCX', blob: affidavit.blob } : { label: 'Affidavit', kind: 'BLANK' }, attachment ? { label: 'Attachment', kind: 'PDF', blob: attachment } : { label: 'Attachment', kind: 'BLANK' }, ftc ? { label: 'FTC', kind: 'DOCX', blob: ftc.blob } : { label: 'FTC', kind: 'BLANK' }); }
    return assembleFinalPdf(parts);
  }
  async function previewPacket(output: ReviewOutput, pendingBlob: Blob): Promise<FinalPdfPacket> { const docs = reviewDocs.map((doc) => doc.path === output.path ? { ...doc, blob: pendingBlob } : doc); return { path: `Preview/${clean(parsed.name)} ${output.bureau} ${output.type === 'DISPUTE' ? 'DISPUTE' : 'LATE PAYMENT'} PACKET.pdf`, type: output.type, bureau: output.bureau, sequence: sequence(output.type), blob: await assemblePacketForRoute(output.type, output.bureau, docs) }; }
  async function finalizePdfPackets() {
    if (!evidence.supporting.length) { setStatus('Supporting Documents evidence is required before final PDF creation.'); return; }
    setFinalizing(true); const packets: FinalPdfPacket[] = [];
    try {
      for (const route of routes) { const folder = route.type === 'DISPUTE' ? 'DISPUTE PACKETS' : 'LATE PAYMENT PACKETS'; packets.push({ path: `Final PDF Packets/${folder}/${clean(parsed.name)} ${route.bureau} ${route.type === 'DISPUTE' ? 'DISPUTE' : 'LATE PAYMENT'} PACKET.pdf`, type: route.type, bureau: route.bureau, sequence: sequence(route.type), blob: await assemblePacketForRoute(route.type, route.bureau, reviewDocs) }); }
      const zip = new JSZip(); packets.forEach((packet) => zip.file(packet.path, packet.blob)); zip.file('Final Packet Manifest.txt', packets.flatMap((packet) => [packet.path, ...packet.sequence.map((entry) => `  ${entry}`), '']).join('\n'));
      setFinalPackets(packets); setFinalZip(packets.length ? { name: `${fileBase(parsed.name)}_${fileBase(round)}_FINAL_PDF_PACKETS.zip`, blob: await zip.generateAsync({ type: 'blob' }) } : null);
      const record = caseRecord('PDF_READY', { pdfCount: packets.length, editableCount: reviewDocs.length, evidenceCount: evidence.supporting.length });
      if (record && packets.length) setFilings(addFinalFilings(record, packets.map((packet) => ({ bureau: packet.bureau, type: packet.type, path: packet.path }))));
      if (preferences.openTrackerAfterFinalization && packets.length) setPanel('Filing Tracker');
      setStatus(packets.length ? `${packets.length} ordered final PDF packet(s) ready.` : 'No final packets are available.');
    } catch (error) { setStatus(error instanceof Error ? error.message : 'Final PDF creation failed.'); }
    finally { setFinalizing(false); }
  }
  function exportRecords() { const payload = JSON.stringify(exportOperationsRecords(), null, 2); deliver(`LETTERGENERATOR_OPERATIONAL_RECORDS_${new Date().toISOString().slice(0, 10)}.json`, new Blob([payload], { type: 'application/json' })); setStatus('Operational records exported.'); }
  function clearRecords() { const cleared = clearOperationsRecords(); setCaseRecords(cleared.cases); setFilings(cleared.filings); setStatus('Local case and filing history cleared. Active document work remains available in this session.'); }
  function allowed(item: Panel) { return item === 'Outputs' ? Boolean(workingZip) : true; }
  function continueCase(record: ClientCaseRecord) { if (record.id === caseId) { setPanel(record.status === 'SOURCE_LOCKED' || record.status === 'EVIDENCE_READY' ? 'Source Data' : 'Outputs'); return; } if (record.status === 'PDF_READY') { setPanel('Filing Tracker'); return; } setStatus('Only the active browser case can resume document edits. Start from Source Data to reopen a working case.'); }
  function dashboard() { return <DashboardOperationsWorkspace cases={caseRecords} filings={filings} activeCaseId={caseId} onNewCase={beginNewCase} onOpenTemplates={() => setPanel('Templates')} onOpenSource={() => setPanel('Source Data')} onOpenOutputs={() => setPanel(workingZip ? 'Outputs' : 'Dashboard')} onOpenTracker={() => setPanel('Filing Tracker')} onContinueCase={continueCase} />; }
  function templatesView() { return <TemplateProgressiveWorkspace round={round} slots={currentReferences} supportingReady={evidence.supporting.length > 0} onSelectRound={(next) => { setRound(next); clearOutputs(); }} onUploadLetter={uploadReference} onRemoveLetter={removeReference} onExhibitsChange={(next) => { setTemplates(next); clearOutputs(); }} onMessage={setStatus} />; }
  function sourceView() { return <GuidedSourceDataFlow source={source} originalSource={originalSource} normalized={normalized} verified={verified} parsed={parsed} routes={routes} sourceWarnings={sourceWarnings} evidenceKey={evidenceKey} evidence={evidence} canGenerate={canGenerate} missingLetters={missingLetters.map((type) => typeLabel[type])} missingInsertCount={missingDisputeNodes.length} strict={preferences.strictValidation} busy={busy} onNormalize={normalizeInput} onEditSource={(value) => { setSource(value); setNormalized(false); clearOutputs(); }} onRestore={() => { setSource(originalSource); setNormalized(false); setCaseId(''); setEvidence(emptyEvidence()); clearOutputs(); }} onEvidenceChanged={(next) => { setEvidence(next); clearOutputs(); caseRecord(next.supporting.length ? 'EVIDENCE_READY' : 'SOURCE_LOCKED', { evidenceCount: next.supporting.length, editableCount: 0, pdfCount: 0 }); }} onMessage={setStatus} onGenerate={generateReviewDocuments} />; }
  function outputsView() { return <OutputReviewWorkspace round={round} outputs={reviewDocs} zipName={workingZip?.name} warnings={warnings} finalPackets={finalPackets} finalizing={finalizing} finalZipName={finalZip?.name} evidenceKey={evidenceKey} evidence={evidence} onEvidenceChanged={(next) => { void updateEvidenceDuringReview(next); }} onMessage={setStatus} onZip={() => workingZip && deliver(workingZip.name, workingZip.blob)} onFinalZip={() => finalZip && deliver(finalZip.name, finalZip.blob)} onFinalize={finalizePdfPackets} onPreviewPacket={previewPacket} onPdfDownload={(packet) => deliver(packet.path.split('/').pop() || 'packet.pdf', packet.blob)} onReplace={saveEdited} />; }
  return <main className="app-shell"><aside className="sidebar"><div className="brand"><span /><div><strong>LetterGenerator</strong><small>Packet workflow</small></div></div><nav aria-label="Primary navigation">{panels.map((item) => <button key={item} className={panel === item ? 'active' : ''} disabled={!allowed(item)} onClick={() => setPanel(item)}><strong>{item}</strong></button>)}</nav></aside><section className="main-area"><header className="header"><div><p className="eyebrow">{panel === 'Dashboard' ? 'Client operations' : panel === 'Filing Tracker' ? 'Delivery operations' : panel === 'Settings' ? 'Workspace control' : `${round} workflow`}</p><h1>{panel}</h1></div></header>{panel === 'Dashboard' && dashboard()}{panel === 'Templates' && templatesView()}{panel === 'Source Data' && sourceView()}{panel === 'Outputs' && outputsView()}{panel === 'Filing Tracker' && <FilingTrackerWorkspace records={filings} outputsAvailable={Boolean(workingZip)} onReturnToOutputs={() => setPanel('Outputs')} onStartCase={beginNewCase} onMarkSent={(id) => { setFilings(markFilingSent(id)); setStatus('Packet marked as sent.'); }} />}{panel === 'Settings' && <WorkspaceSettingsPanel preferences={preferences} caseCount={caseRecords.length} filingCount={filings.length} onChange={updatePreferences} onExportRecords={exportRecords} onClearRecords={clearRecords} />}</section></main>;
}
