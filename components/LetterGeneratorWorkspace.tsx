'use client';

import { useEffect, useMemo, useState, type ClipboardEvent, type ReactNode } from 'react';
import JSZip from 'jszip';
import OutputReviewWorkspace, { type ReviewOutput } from './OutputReviewWorkspace';
import type { FinalPdfPacket } from './PdfPacketPreview';
import SupportingDocumentsSetup from './SupportingDocumentsSetup';
import TemplatePacketConfigurator from './TemplatePacketConfigurator';
import { assembleFinalPdf, type PdfPacketPart } from '../lib/final-pdf-packet';
import { isDocx, renderReferenceDisputeDocx } from '../lib/docx-renderer';
import { renderLatePaymentReference } from '../lib/late-reference-renderer';
import { bureauInfo, bureaus, createNormalizedSourceCopy, detectRoutes, parseSource, recommendedSourceFormat, type Bureau, type LetterRoute, type LetterType } from '../lib/letter-engine';
import { loadPacketAssets, type PacketAssets } from '../lib/packet-assets';
import { createSupportingDocumentsPdf } from '../lib/packet-renderer';
import { defaultReferences, loadReferenceMeta, readReferenceFile, removeReferenceFile, rounds, saveReferenceFile, saveReferenceMeta, type LetterReference, type Round } from '../lib/reference-store';
import { renderMappedAppendix } from '../lib/supplemental-template-renderer';
import { configuredExhibits, exhibitTitles, loadTemplateExhibits, readTemplateExhibit, type ExhibitKind, type TemplateExhibits } from '../lib/template-exhibits';
import { validateGenerationInputs, validateFinalPdfInputs, validationSummary } from '../lib/workflow-validation';

type Panel = 'Dashboard' | 'Templates' | 'Source Data' | 'Generate' | 'Outputs' | 'Settings';
type Tone = 'neutral' | 'success' | 'warning' | 'accent';
const panels: Panel[] = ['Dashboard', 'Templates', 'Source Data', 'Generate', 'Outputs', 'Settings'];
const steps: Panel[] = ['Templates', 'Source Data', 'Generate', 'Outputs'];
const typeLabel: Record<LetterType, string> = { DISPUTE: 'Dispute Letter', LATE_PAYMENT: 'Late Payment Letter' };
const disputeRequirements: ExhibitKind[] = ['FCRA', 'AFFIDAVIT', 'ATTACHMENT'];
const emptyEvidence = (): PacketAssets => ({ supporting: [], legalPdf: null });
const emptyTemplates = (): TemplateExhibits => ({ FCRA: null, AFFIDAVIT: null, ATTACHMENT: null, FTC: null });
function dateInEasternTime() { return new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'America/New_York' }).format(new Date()); }
function clean(value: string) { return (value || 'CLIENT').replace(/[\/:*?"<>|]+/g, '').replace(/\s+/g, ' ').trim().toUpperCase(); }
function fileBase(value: string) { return clean(value).replace(/[^A-Z0-9]+/g, '_'); }
function deliver(name: string, blob: Blob) { const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = name; link.click(); URL.revokeObjectURL(url); }
function sequence(type: LetterType) { return type === 'LATE_PAYMENT' ? ['01 Late Payment Letter', '02 Supporting Documents'] : ['01 Dispute Letter', '02 Supporting Documents', '03 FCRA', '04 Affidavit', '05 Attachment']; }
function uniqueNotices(current: string[], additions: string[]) { return Array.from(new Set([...current, ...additions])); }
function Pill({ children, tone = 'neutral' }: { children: ReactNode; tone?: Tone }) { return <span className={`pill ${tone}`}>{children}</span>; }
function Empty({ title, text }: { title: string; text: string }) { return <div className="empty-state"><div className="empty-icon">+</div><strong>{title}</strong><p>{text}</p></div>; }
function failMessage(lines: string[]) { return lines.length ? `Validation failed. ${lines.join(' ')}` : 'Validation failed.'; }

export default function LetterGeneratorWorkspace() {
  const [panel, setPanel] = useState<Panel>('Dashboard');
  const [round, setRound] = useState<Round>('1st Round');
  const [references, setReferences] = useState<LetterReference[]>(defaultReferences);
  const [source, setSource] = useState('');
  const [originalSource, setOriginalSource] = useState('');
  const [normalized, setNormalized] = useState(false);
  const [caseId, setCaseId] = useState('');
  const [evidence, setEvidence] = useState<PacketAssets>(emptyEvidence);
  const [templates, setTemplates] = useState<TemplateExhibits>(emptyTemplates);
  const [strict, setStrict] = useState(false);
  const [reviewDocs, setReviewDocs] = useState<ReviewOutput[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [workingZip, setWorkingZip] = useState<{ name: string; blob: Blob } | null>(null);
  const [finalPackets, setFinalPackets] = useState<FinalPdfPacket[]>([]);
  const [finalZip, setFinalZip] = useState<{ name: string; blob: Blob } | null>(null);
  const [documentDate, setDocumentDate] = useState('');
  const [busy, setBusy] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [status, setStatus] = useState('Configure packet templates, then load a client source file.');

  useEffect(() => setReferences(loadReferenceMeta()), []);
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
  const generationValidation = useMemo(() => validateGenerationInputs({ parsed, routes, round, references, templates }), [parsed, routes, round, references, templates]);
  const canGenerate = verified && generationValidation.ok;
  useEffect(() => setEvidence(verified && evidenceKey ? loadPacketAssets(evidenceKey) : emptyEvidence()), [verified, evidenceKey]);

  function clearOutputs() { setReviewDocs([]); setWarnings([]); setWorkingZip(null); setFinalPackets([]); setFinalZip(null); setDocumentDate(''); }
  function startCase() { setCaseId(crypto.randomUUID()); setEvidence(emptyEvidence()); clearOutputs(); }
  function normalizeInput(value: string, action: string) { if (!value.trim()) return; setOriginalSource(value); setSource(createNormalizedSourceCopy(value).text); setNormalized(true); startCase(); setStatus(`${action} source standardized. Upload Supporting Documents for this client, then continue.`); }
  function onPaste(event: ClipboardEvent<HTMLTextAreaElement>) { const value = event.clipboardData.getData('text'); if (!value.trim()) return; event.preventDefault(); normalizeInput(value, 'Pasted'); }
  async function uploadReference(slot: LetterReference, file: File) { if (!isDocx(file.name)) { setStatus('Letter references accept DOCX files only.'); return; } await saveReferenceFile(slot, file); setReferences((items) => items.map((item) => item.id === slot.id ? { ...item, file: file.name, size: file.size } : item)); clearOutputs(); setStatus(`${slot.name} saved.`); }
  async function removeReference(slot: LetterReference) { await removeReferenceFile(slot.id); setReferences((items) => items.map((item) => item.id === slot.id ? { ...item, file: '', size: undefined } : item)); clearOutputs(); }
  async function createLetter(route: LetterRoute, template: File, date: string) { const recipient = bureauInfo[route.bureau]; const identity = { consumerName: parsed.name, addressLines: parsed.address, dob: parsed.dob, ssn: parsed.ssn, letterDate: date, bureauName: recipient.name, bureauAddressLines: recipient.address.split('\n') }; return route.type === 'DISPUTE' ? renderReferenceDisputeDocx(template, { ...identity, disputeItems: route.items.filter((item) => item.type === 'DISPUTE_ACCOUNT').map((item) => item.displayText), hardInquiryItems: route.items.filter((item) => item.type === 'HARD_INQUIRY').map((item) => item.displayText) }) : renderLatePaymentReference(template, { ...identity, latePaymentItems: route.items.map((item) => item.displayText) }); }
  async function createMappedDoc(kind: 'AFFIDAVIT', bureau: Bureau, date: string) { const template = await readTemplateExhibit(round, kind); if (!template) return null; const recipient = bureauInfo[bureau]; return renderMappedAppendix(template, { kind, bureau, documentDate: date, recipientName: recipient.name, recipientAddressLines: recipient.address.split('\n'), source: parsed }); }
  async function createWorkingZip(docs: ReviewOutput[], notices: string[], date: string) { const zip = new JSZip(); docs.forEach((doc) => zip.file(doc.path, doc.blob)); zip.file('Generation Manifest.txt', ['WORKING DOCUMENTS - REVIEW BEFORE FINALIZATION', `Client: ${parsed.name}`, `Round: ${round}`, `Date: ${date}`, '', 'Review stage:', 'Edit generated DOCX files only: letters and Affidavit.', 'Supporting Documents and static PDFs are merged into final PDF packets.', '', 'Dispute final PDF order:', ...sequence('DISPUTE'), '', 'Late Payment final PDF order:', ...sequence('LATE_PAYMENT'), '', 'Editable documents:', ...docs.map((doc) => `- ${doc.path}`), ...(notices.length ? ['', 'Needs attention:', ...notices.map((notice) => `- ${notice}`)] : [])].join('\n')); return zip.generateAsync({ type: 'blob' }); }

  async function generateReviewDocuments() {
    const validationLines = validationSummary(generationValidation);
    if (!verified || !generationValidation.ok || (strict && missingLetters.length)) { setWarnings(validationLines); setStatus(failMessage(validationLines)); return; }
    setBusy(true);
    const date = dateInEasternTime();
    const docs: ReviewOutput[] = [];
    const notices: string[] = [];
    if (!evidence.supporting.length) notices.push('Supporting Documents are required before complete packet preview and final PDF assembly. Upload them in Source Data.');
    missingDisputeNodes.forEach((kind) => notices.push(`${exhibitTitles[kind]} is missing for complete Dispute packet preview and final PDF assembly.`));
    for (const route of routes) {
      const slot = currentReferences.find((item) => item.type === route.type);
      const template = slot?.file ? await readReferenceFile(slot.id) : null;
      if (!template) { notices.push(`${typeLabel[route.type]} / ${route.bureau}: DOCX reference is missing.`); continue; }
      try {
        const letter = await createLetter(route, template, date);
        const prefix = `${clean(parsed.name)} ${route.bureau}`;
        docs.push({ id: `${route.type}-${route.bureau}-LETTER`, path: `Editable Documents/${prefix} ${typeLabel[route.type]}.docx`, type: route.type, role: 'LETTER', sequence: 1, bureau: route.bureau, count: route.items.length, detail: `${route.reason} · Preview the completed ordered packet from this editor`, blob: letter, packetSteps: sequence(route.type) });
        if (route.type === 'DISPUTE' && templates.AFFIDAVIT) {
          const mapped = await createMappedDoc('AFFIDAVIT', route.bureau, date);
          if (mapped) docs.push({ id: `${route.bureau}-AFFIDAVIT`, path: `Editable Documents/${prefix} 04 ${exhibitTitles.AFFIDAVIT}.docx`, type: 'DISPUTE', role: 'AFFIDAVIT', sequence: 4, bureau: route.bureau, count: parsed.dispute[route.bureau].length, detail: 'Source-populated DOCX · edit, inspect page lines and preview full packet', blob: mapped, packetSteps: sequence('DISPUTE') });
        }
      } catch (error) { notices.push(`${typeLabel[route.type]} / ${route.bureau}: ${error instanceof Error ? error.message : 'Generation failed.'}`); }
    }
    const zip = await createWorkingZip(docs, notices, date);
    setReviewDocs(docs); setWarnings(notices); setWorkingZip({ name: `${fileBase(parsed.name)}_${fileBase(round)}_WORKING_DOCUMENTS.zip`, blob: zip }); setDocumentDate(date); setFinalPackets([]); setFinalZip(null); setBusy(false); setPanel('Outputs'); setStatus(`${docs.length} editable document(s) prepared. Open a document and use Complete Packet Preview to inspect all pages together.`);
  }
  async function saveEdited(output: ReviewOutput, file: File) { const docs = reviewDocs.map((item) => item.path === output.path ? { ...item, blob: file, detail: 'Edited and saved for finalization' } : item); const zip = await createWorkingZip(docs, warnings, documentDate || dateInEasternTime()); setReviewDocs(docs); setWorkingZip({ name: workingZip?.name || 'WORKING_DOCUMENTS.zip', blob: zip }); setFinalPackets([]); setFinalZip(null); setStatus('Edit saved. Use Complete Packet Preview to inspect the merged page order before finalizing.'); }
  async function assemblePacketForRoute(type: LetterType, bureau: string, docs: ReviewOutput[]) {
    const route = routes.find((item) => item.type === type && item.bureau === bureau);
    const validation = validateFinalPdfInputs({ parsed, routes: route ? [route] : [], docs, evidence, templates });
    if (!validation.ok) throw new Error(failMessage(validationSummary(validation)));
    const supportingPdf = evidenceKey ? await createSupportingDocumentsPdf(evidenceKey).catch(() => null) : null;
    if (!supportingPdf) throw new Error('Final PDF packets require Supporting Documents. Upload the client supporting images in Source Data first.');
    const letter = docs.find((doc) => doc.type === type && doc.bureau === bureau && doc.role === 'LETTER');
    if (!letter) throw new Error(`${bureau}: the generated ${typeLabel[type]} is unavailable.`);
    const parts: PdfPacketPart[] = [{ label: typeLabel[type], kind: 'DOCX', blob: letter.blob }, { label: 'Supporting Documents', kind: 'PDF', blob: supportingPdf }];
    if (type === 'DISPUTE') {
      const fcra = await readTemplateExhibit(round, 'FCRA');
      const attachment = await readTemplateExhibit(round, 'ATTACHMENT');
      const affidavit = docs.find((doc) => doc.bureau === bureau && doc.role === 'AFFIDAVIT');
      const missing = [!fcra ? 'FCRA PDF' : '', !affidavit ? 'Affidavit DOCX' : '', !attachment ? 'Attachment PDF' : ''].filter(Boolean);
      if (missing.length) throw new Error(`Complete Dispute Packet PDF is unavailable. Configure or generate: ${missing.join(', ')}.`);
      parts.push({ label: 'FCRA', kind: 'PDF', blob: fcra! }, { label: 'Affidavit', kind: 'DOCX', blob: affidavit!.blob }, { label: 'Attachment', kind: 'PDF', blob: attachment! });
    }
    return assembleFinalPdf(parts);
  }
  function packetPdfName(type: LetterType, bureau: string) { return `${fileBase(parsed.name)}_${fileBase(bureau)}_${type === 'DISPUTE' ? 'DISPUTE_PACKET' : 'LATE_PAYMENT_PACKET'}.pdf`; }
  async function buildFinalPdfPackets() {
    const validation = validateFinalPdfInputs({ parsed, routes, docs: reviewDocs, evidence, templates });
    if (!validation.ok) return { packets: [], notices: validationSummary(validation) };
    const packets: FinalPdfPacket[] = [];
    const notices: string[] = [];
    for (const route of routes) {
      try { packets.push({ path: `Final PDF Packets/${packetPdfName(route.type, route.bureau)}`, type: route.type, bureau: route.bureau, sequence: sequence(route.type), blob: await assemblePacketForRoute(route.type, route.bureau, reviewDocs) }); }
      catch (error) { notices.push(error instanceof Error ? error.message : `${route.bureau}: PDF assembly failed.`); }
    }
    return { packets, notices };
  }
  async function previewPacket(output: ReviewOutput, pendingBlob: Blob): Promise<FinalPdfPacket> { const docs = reviewDocs.map((doc) => doc.path === output.path ? { ...doc, blob: pendingBlob } : doc); return { path: `Preview/${packetPdfName(output.type, output.bureau)}`, type: output.type, bureau: output.bureau, sequence: sequence(output.type), blob: await assemblePacketForRoute(output.type, output.bureau, docs) }; }
  async function downloadSinglePacketPdf(packet: ReviewOutput) { const blob = await assemblePacketForRoute(packet.type, packet.bureau, reviewDocs); deliver(packetPdfName(packet.type, packet.bureau), blob); setStatus(`${packet.bureau} merged PDF packet downloaded.`); }
  async function downloadAllPacketPdfs() {
    setFinalizing(true);
    const { packets, notices } = await buildFinalPdfPackets();
    if (!packets.length) { setWarnings((previous) => uniqueNotices(previous, notices)); setFinalizing(false); setStatus(failMessage(notices)); return; }
    const zip = new JSZip();
    packets.forEach((packet) => zip.file(packet.path.split('/').pop() || 'PACKET.pdf', packet.blob));
    zip.file('Final Packet Manifest.txt', packets.flatMap((packet) => [packet.path.split('/').pop() || packet.path, ...packet.sequence.map((entry) => `  ${entry}`), '']).join('\n'));
    const blob = await zip.generateAsync({ type: 'blob' });
    const name = `${fileBase(parsed.name)}_${fileBase(round)}_ALL_BUREAU_PDF_PACKETS.zip`;
    setFinalPackets(packets); setFinalZip({ name, blob }); setWarnings((previous) => uniqueNotices(previous, notices)); setFinalizing(false); deliver(name, blob); setStatus(`${packets.length} bureau merged PDF packet(s) downloaded in one ZIP.`);
  }
  async function finalizePdfPackets() { setFinalizing(true); const { packets, notices } = await buildFinalPdfPackets(); let finalOutput: { name: string; blob: Blob } | null = null; if (packets.length) { const zip = new JSZip(); packets.forEach((packet) => zip.file(packet.path, packet.blob)); zip.file('Final Packet Manifest.txt', packets.flatMap((packet) => [packet.path, ...packet.sequence.map((entry) => `  ${entry}`), '']).join('\n')); finalOutput = { name: `${fileBase(parsed.name)}_${fileBase(round)}_FINAL_PDF_PACKETS.zip`, blob: await zip.generateAsync({ type: 'blob' }) }; } setFinalPackets(packets); setFinalZip(finalOutput); setWarnings((previous) => uniqueNotices(previous, notices)); setFinalizing(false); setStatus(packets.length ? `${packets.length} final PDF packet(s) ready for page-order review.` : failMessage(notices)); }

  function allowed(item: Panel) { return item === 'Generate' ? canGenerate : item === 'Outputs' ? Boolean(workingZip) : true; }
  function stepNav() { return <nav className="workflow-rail">{steps.map((item, index) => <button key={item} disabled={!allowed(item)} className={panel === item ? 'current' : ''} onClick={() => setPanel(item)}><i>{index + 1}</i><span>{item}</span></button>)}</nav>; }
  function dashboard() { return <div className="dashboard-grid"><section className="panel dashboard-hero"><p className="eyebrow">Document operations</p><h2>Build ordered bureau PDF packets.</h2><p>Configure templates, normalize source data, review editable documents and preview the complete packet before download.</p><div className="dashboard-actions"><button className="action-button" onClick={() => setPanel('Templates')}>Configure Templates</button><button className="secondary-button" onClick={() => setPanel('Source Data')}>Load Source Data</button></div></section><article className="metric-tile"><small>Routes</small><strong>{routes.length}</strong><span>Detected letters</span></article><article className="metric-tile"><small>Editable docs</small><strong>{reviewDocs.length}</strong><span>Letters, Affidavit</span></article><article className="metric-tile"><small>PDF packets</small><strong>{finalPackets.length}</strong><span>Final output</span></article></div>; }
  function templatesView() { return <div className="templates-packet-workspace"><section className="panel template-round-control"><div className="panel-heading"><div><h2>Reusable packet references</h2><p>DOCX templates are editable; PDF inserts are merged unchanged. Supporting Documents remain in Source Data.</p></div><Pill tone="accent">{round}</Pill></div><nav className="round-selector">{rounds.map((item, index) => <button key={item} className={round === item ? 'selected' : ''} onClick={() => { setRound(item); clearOutputs(); }}><span className="round-index">0{index + 1}</span><span className="round-copy"><strong>{item}</strong><small>{round === item ? 'Active packet' : 'Select round'}</small></span></button>)}</nav></section><TemplatePacketConfigurator round={round} slots={currentReferences} supportingReady={evidence.supporting.length > 0} onUploadLetter={uploadReference} onRemoveLetter={removeReference} onExhibitsChange={(next) => { setTemplates(next); clearOutputs(); }} onMessage={setStatus} /></div>; }
  function sourceView() { return <div className="source-case-workspace"><div className="source-workspace"><section className="panel source-input-panel"><div className="panel-heading"><div><h2>Source TXT</h2><p>Only the TXT source and client Supporting Documents are uploaded here.</p></div>{source && <Pill tone={verified ? 'success' : 'neutral'}>{verified ? 'Normalized' : 'Editing'}</Pill>}</div><div className="source-actions"><label className="field-label">Upload TXT source<input className="file-input" type="file" accept=".txt" onChange={async (event) => { const file = event.target.files?.[0]; if (file) normalizeInput(await file.text(), 'Uploaded'); event.target.value = ''; }} /></label>{!source && <button className="secondary-button" onClick={() => setSource(recommendedSourceFormat)}>Use standard format</button>}</div>{source && <div className="normalization-actions">{!normalized && <button className="normalize-source" onClick={() => normalizeInput(source, 'Edited')}>Standardize current edits</button>}{originalSource && <button onClick={() => { setSource(originalSource); setNormalized(false); setCaseId(''); setEvidence(emptyEvidence()); clearOutputs(); }}>Restore original data</button>}</div>}<textarea className="source-area" value={source} onPaste={onPaste} onChange={(event) => { setSource(event.target.value); setNormalized(false); clearOutputs(); }} placeholder="Paste TXT source here..." /></section>{parsed.name ? <section className="panel source-results-panel"><div className="panel-heading"><div><h2>Detected routes</h2><p>Confirm bureau outputs before document generation.</p></div><Pill tone="accent">{routes.length} output{routes.length === 1 ? '' : 's'}</Pill></div><div className="detection-table">{bureaus.map((bureau) => <div className="detection-row" key={bureau}><strong>{bureau}</strong><span>{parsed.dispute[bureau].length} dispute - {parsed.inquiry[bureau].length} inquiry</span><span>{parsed.late[bureau].length} late payment</span></div>)}</div>{sourceWarnings.length > 0 && <div className="source-review"><strong>Review before generating</strong>{sourceWarnings.slice(0, 4).map((warning, index) => <p key={index}>{warning.message}</p>)}</div>}<button className="action-button" disabled={!verified} onClick={() => setPanel('Generate')}>Continue to Packet Plan</button></section> : <section className="panel source-guide"><Empty title="Load client source" text="Normalize TXT data to unlock Supporting Documents." /></section>}</div>{verified && evidenceKey && <SupportingDocumentsSetup storageKey={evidenceKey} clientName={parsed.name} onChanged={(next) => { setEvidence(next); clearOutputs(); }} onMessage={setStatus} />}</div>; }
  function generateView() { const validationLines = validationSummary(generationValidation); return <div className="generation-workspace"><section className="panel generation-overview"><div><p className="eyebrow">Packet plan</p><h2>Prepare editable review documents</h2><p>Letters and Affidavit remain editable. Final delivery converts DOCX files to PDF and merges every bureau packet in order.</p></div><div className="generation-summary"><div><strong>{routes.length}</strong><span>Letters</span></div><div><strong>{evidence.supporting.length ? 'Yes' : 'No'}</strong><span>Support</span></div><div><strong>{configuredExhibits(templates).filter((kind) => kind !== 'FTC').length}/3</strong><span>Dispute nodes</span></div></div></section><section className="panel route-production"><div className="production-rows">{routes.map((route) => <div className="production-row" key={`${route.bureau}-${route.type}`}><div><strong>{route.bureau} - {typeLabel[route.type]}</strong><small>{route.reason}</small><div className="assembly-chips">{sequence(route.type).map((entry) => <span className="assembly-chip" key={entry}>{entry}</span>)}</div></div><Pill tone={generationValidation.ok ? 'success' : 'warning'}>{generationValidation.ok ? 'Validated' : 'Blocked'}</Pill></div>)}</div>{validationLines.length > 0 && <div className="alert error">{validationLines.map((line) => <p key={line}>{line}</p>)}</div>}{missingLetters.length > 0 && <div className="alert error">Missing letter DOCX: {missingLetters.map((type) => typeLabel[type]).join(', ')}.</div>}{!evidence.supporting.length && <div className="alert error">Supporting Documents are required for complete packet preview and final PDF packets. Upload them in Source Data.</div>}<button className="action-button generate-primary" disabled={busy || !canGenerate} onClick={() => void generateReviewDocuments()}>{busy ? 'Preparing documents...' : 'Generate Editable Review Documents'}</button></section></div>; }
  function outputsView() { return <OutputReviewWorkspace round={round} outputs={reviewDocs} zipName={workingZip?.name} warnings={warnings} finalPackets={finalPackets} finalizing={finalizing} finalZipName={finalZip?.name} onZip={() => workingZip && deliver(workingZip.name, workingZip.blob)} onFinalZip={() => finalZip && deliver(finalZip.name, finalZip.blob)} onFinalize={finalizePdfPackets} onPreviewPacket={previewPacket} onPdfDownload={(packet) => deliver(packet.path.split('/').pop() || 'packet.pdf', packet.blob)} onDownloadPacketPdf={downloadSinglePacketPdf} onDownloadAllPacketPdfs={downloadAllPacketPdfs} onReplace={saveEdited} />; }
  return <main className="app-shell"><aside className="sidebar"><div className="brand"><span /><div><strong>LetterGenerator</strong><small>Packet workflow</small></div></div><nav aria-label="Primary navigation">{panels.map((item) => <button key={item} className={panel === item ? 'active' : ''} disabled={!allowed(item)} onClick={() => setPanel(item)}><strong>{item}</strong></button>)}</nav></aside><section className="main-area"><header className="header"><div><p className="eyebrow">{panel === 'Dashboard' ? 'Document operations' : `${round} workflow`}</p><h1>{panel}</h1></div></header>{steps.includes(panel) && stepNav()}{panel === 'Dashboard' && dashboard()}{panel === 'Templates' && templatesView()}{panel === 'Source Data' && sourceView()}{panel === 'Generate' && generateView()}{panel === 'Outputs' && outputsView()}{panel === 'Settings' && <section className="panel settings"><label className="setting"><input type="checkbox" checked={strict} onChange={(event) => setStrict(event.target.checked)} /><span><strong>Strict template validation</strong><small>Block generation when required letter DOCX references are missing.</small></span></label></section>}<div className="toast activity-status" role="status" aria-live="polite"><strong>Activity</strong><span>{status}</span></div></section></main>;
}
