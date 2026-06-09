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
import { defaultReferences, loadReferenceMeta, readReferenceFile, removeReferenceFile, rounds, saveReferenceFile, saveReferenceMeta, recoverReferenceMetaFromFiles, type LetterReference, type Round } from '../lib/reference-store';
import { renderMappedAppendix } from '../lib/supplemental-template-renderer';
import { configuredExhibits, exhibitTitles, loadTemplateExhibits, readTemplateExhibit, type ExhibitKind, type TemplateExhibits } from '../lib/template-exhibits';
import { isFtcEnabled } from '../lib/workflow-framework';

type Panel = 'Dashboard' | 'Templates' | 'Source Data' | 'Generate' | 'Outputs' | 'Settings';
type Tone = 'neutral' | 'success' | 'warning' | 'accent';
const panels: Panel[] = ['Dashboard', 'Templates', 'Source Data', 'Generate', 'Outputs', 'Settings'];
const steps: Panel[] = ['Templates', 'Source Data', 'Generate', 'Outputs'];
const typeLabel: Record<LetterType, string> = { DISPUTE: 'Dispute Letter', LATE_PAYMENT: 'Late Payment Letter' };

// Dynamically build dispute requirements based on FTC feature flag
function getDisputeRequirements(): ExhibitKind[] {
  const requirements: ExhibitKind[] = ['FCRA', 'AFFIDAVIT', 'ATTACHMENT'];
  if (isFtcEnabled()) {
    requirements.push('FTC');
  }
  return requirements;
}

const emptyEvidence = (): PacketAssets => ({ supporting: [], legalPdf: null });
const emptyTemplates = (): TemplateExhibits => ({ FCRA: null, AFFIDAVIT: null, ATTACHMENT: null, FTC: null });
function dateInEasternTime() { return new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'America/New_York' }).format(new Date()); }
function clean(value: string) { return (value || 'CLIENT').replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, ' ').trim().toUpperCase(); }
function fileBase(value: string) { return clean(value).replace(/[^A-Z0-9]+/g, '_'); }
function deliver(name: string, blob: Blob) { const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = name; link.click(); URL.revokeObjectURL(url); }

// Dynamically build sequence based on FTC feature flag
function sequence(type: LetterType) {
  if (type === 'LATE_PAYMENT') {
    return ['01 Late Payment Letter', '02 Supporting Documents'];
  }
  const seq = ['01 Dispute Letter', '02 Supporting Documents', '03 FCRA', '04 Affidavit', '05 Attachment'];
  if (isFtcEnabled()) {
    seq.push('06 FTC');
  }
  return seq;
}

function uniqueNotices(current: string[], additions: string[]) { return Array.from(new Set([...current, ...additions])); }
function Pill({ children, tone = 'neutral' }: { children: ReactNode; tone?: Tone }) { return <span className={`pill ${tone}`}>{children}</span>; }
function Empty({ title, text }: { title: string; text: string }) { return <div className="empty-state"><div className="empty-icon">+</div><strong>{title}</strong><p>{text}</p></div>; }

export default function LetterGeneratorWorkspace() {
  const [panel, setPanel] = useState<Panel>('Dashboard');
  const [round, setRound] = useState<Round>('1st Round');
  const [references, setReferences] = useState<LetterReference[]>(() => loadReferenceMeta());
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

  useEffect(() => saveReferenceMeta(references), [references]);
  useEffect(() => {
    let cancelled = false;

    void recoverReferenceMetaFromFiles()
      .then((next) => { if (!cancelled) setReferences(next); })
      .catch(() => { if (!cancelled) setReferences(loadReferenceMeta()); });

    return () => { cancelled = true; };
  }, []);
  useEffect(() => {
    let cancelled = false;

    async function recoverReferenceFiles() {
      const recovered = await Promise.all(defaultReferences().map(async (slot) => {
        const file = await readReferenceFile(slot.id).catch(() => null);
        return file ? { id: slot.id, file: file.name, size: file.size } : null;
      }));

      if (cancelled) return;

      const byId = new Map(recovered.filter(Boolean).map((item) => [item!.id, item!]));

      setReferences((items) => {
        let changed = false;

        const next = defaultReferences().map((slot) => {
          const current = items.find((item) => item.id === slot.id) || slot;
          const stored = byId.get(slot.id);

          if (!current.file && stored?.file) {
            changed = true;
            return { ...current, file: stored.file, size: stored.size };
          }

          return current;
        });

        if (changed) saveReferenceMeta(next);
        return changed ? next : items;
      });
    }

    void recoverReferenceFiles();

    return () => { cancelled = true; };
  }, []);
  useEffect(() => setTemplates(loadTemplateExhibits(round)), [round]);

  const currentReferences = references.filter((item) => item.round === round);
  const parsed = useMemo(() => parseSource(source), [source]);
  const routes = useMemo(() => detectRoutes(parsed), [parsed]);
  const verified = normalized && Boolean(parsed.name);
  const evidenceKey = caseId ? `${round}::${caseId}` : '';
  const sourceWarnings = parsed.diagnostics?.filter((item) => item.level === 'warning') || [];
  const missingLetters = Array.from(new Set(routes.map((route) => route.type))).filter((type) => !currentReferences.find((item) => item.type === type)?.file);
  const hasDispute = routes.some((route) => route.type === 'DISPUTE');
  const missingDisputeNodes = hasDispute ? getDisputeRequirements().filter((kind) => !templates[kind]) : [];
  const canGenerate = verified && routes.length > 0;
  useEffect(() => setEvidence(verified && evidenceKey ? loadPacketAssets(evidenceKey) : emptyEvidence()), [verified, evidenceKey]);

  function clearOutputs() { setReviewDocs([]); setWarnings([]); setWorkingZip(null); setFinalPackets([]); setFinalZip(null); setDocumentDate(''); }
  function startCase() { setCaseId(crypto.randomUUID()); setEvidence(emptyEvidence()); clearOutputs(); }
  function normalizeInput(value: string, action: string) { if (!value.trim()) return; setOriginalSource(value); setSource(createNormalizedSourceCopy(value).text); setNormalized(true); startCase(); setStatus(`${action} source standardized. Upload Supporting Documents for this client, then continue.`); }
  function onPaste(event: ClipboardEvent<HTMLTextAreaElement>) { const value = event.clipboardData.getData('text'); if (!value.trim()) return; event.preventDefault(); normalizeInput(value, 'Pasted'); }
  async function uploadReference(slot: LetterReference, file: File) { if (!isDocx(file.name)) { setStatus('Letter references accept DOCX files only.'); return; } await saveReferenceFile(slot, file); setReferences((items) => items.map((item) => item.id === slot.id ? { ...item, file: file.name, size: file.size } : item)); clearOutputs(); setStatus(`${slot.name} saved.`); }
  async function removeReference(slot: LetterReference) { await removeReferenceFile(slot.id); setReferences((items) => items.map((item) => item.id === slot.id ? { ...item, file: '', size: undefined } : item)); clearOutputs(); }
  async function createLetter(route: LetterRoute, template: File, date: string) { const recipient = bureauInfo[route.bureau]; const identity = { consumerName: parsed.name, addressLines: parsed.address, dob: parsed.dob, ssn: parsed.ssn, letterDate: date, bureauName: recipient.name, bureauAddressLines: recipient.address.split('\n') }; return route.type === 'DISPUTE' ? renderReferenceDisputeDocx(template, { ...identity, disputeItems: route.items.filter((item) => item.type === 'DISPUTE_ACCOUNT').map((item) => item.displayText), hardInquiryItems: route.items.filter((item) => item.type === 'HARD_INQUIRY').map((item) => item.displayText) }) : renderLatePaymentReference(template, { ...identity, latePaymentItems: route.items.map((item) => item.displayText) }); }
  async function createMappedDoc(kind: 'AFFIDAVIT' | 'FTC', bureau: Bureau, date: string) { const template = await readTemplateExhibit(round, kind); if (!template) return null; const recipient = bureauInfo[bureau]; return renderMappedAppendix(template, { kind, bureau, documentDate: date, recipientName: recipient.name, recipientAddressLines: recipient.address.split('\n'), source: parsed }); }
  async function createWorkingZip(docs: ReviewOutput[], notices: string[], date: string) { const zip = new JSZip(); docs.forEach((doc) => zip.file(doc.path, doc.blob)); zip.file('Generation Manifest.txt', ['WORKING DOCUMENTS - REVIEW BEFORE FINALIZATION', `Client: ${parsed.name}`, `Round: ${round}`, `Date: ${date}`, '', 'Review stage:', 'Edit generated DOCX files only: letters, Affidavit and FTC.', 'Supporting Documents and static PDFs are visible in Complete Packet Preview and final PDF assembly.', '', 'Dispute final PDF order:', ...sequence('DISPUTE'), '', 'Late Payment final PDF order:', ...sequence('LATE_PAYMENT'), '', 'Editable documents:', ...docs.map((doc) => `- ${doc.path}`), ...(notices.length ? ['', 'Needs attention:', ...notices.map((notice) => `- ${notice}`)] : [])].join('\n')); return zip.generateAsync({ type: 'blob' }); }

  async function generateReviewDocuments() {
    if (!canGenerate || (strict && missingLetters.length)) { setStatus('Complete required generation checks first.'); return; }
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
        if (route.type === 'DISPUTE') {
          const items: Array<{ kind: 'AFFIDAVIT' | 'FTC'; role: 'AFFIDAVIT' | 'FTC'; number: number }> = [{ kind: 'AFFIDAVIT', role: 'AFFIDAVIT', number: 4 }];
          if (isFtcEnabled()) {
            items.push({ kind: 'FTC' as const, role: 'FTC' as const, number: 6 });
          }
          for (const item of items) {
            if (!templates[item.kind]) continue;
            const mapped = await createMappedDoc(item.kind, route.bureau, date);
            if (mapped) docs.push({ id: `${route.bureau}-${item.kind}`, path: `Editable Documents/${prefix} ${String(item.number).padStart(2, '0')} ${exhibitTitles[item.kind]}.docx`, type: 'DISPUTE', role: item.role, sequence: item.number, bureau: route.bureau, count: parsed.dispute[route.bureau].length, detail: 'Source-populated DOCX · edit, inspect page lines and preview full packet', blob: mapped, packetSteps: sequence('DISPUTE') });
          }
        }
      } catch (error) { notices.push(`${typeLabel[route.type]} / ${route.bureau}: ${error instanceof Error ? error.message : 'Generation failed.'}`); }
    }
    const zip = await createWorkingZip(docs, notices, date);
    setReviewDocs(docs); setWarnings(notices); setWorkingZip({ name: `${fileBase(parsed.name)}_${fileBase(round)}_WORKING_DOCUMENTS.zip`, blob: zip }); setDocumentDate(date); setFinalPackets([]); setFinalZip(null); setBusy(false); setPanel('Outputs'); setStatus(`${docs.length} editable document(s) prepared. Open a document and use Complete Packet Preview to inspect all pages together.`);
  }
  async function saveEdited(output: ReviewOutput, file: File) { const docs = reviewDocs.map((item) => item.path === output.path ? { ...item, blob: file, detail: 'Edited and saved for finalization' } : item); const zip = await createWorkingZip(docs, warnings, documentDate || dateInEasternTime()); setReviewDocs(docs); setWorkingZip({ name: workingZip?.name || 'WORKING_DOCUMENTS.zip', blob: zip }); setFinalPackets([]); setFinalZip(null); setStatus('Edit saved. Use Complete Packet Preview to inspect the merged page order before finalizing.'); }
  async function assemblePacketForRoute(type: LetterType, bureau: string, docs: ReviewOutput[]) {
    const supportingPdf = evidenceKey ? await createSupportingDocumentsPdf(evidenceKey).catch(() => null) : null;
    if (!supportingPdf) throw new Error('Complete Packet Preview requires Supporting Documents. Upload the client supporting images in Source Data first.');
    const letter = docs.find((doc) => doc.type === type && doc.bureau === bureau && doc.role === 'LETTER');
    if (!letter) throw new Error(`${bureau}: the generated ${typeLabel[type]} is unavailable.`);
    const parts: PdfPacketPart[] = [{ label: typeLabel[type], kind: 'DOCX', blob: letter.blob }, { label: 'Supporting Documents', kind: 'PDF', blob: supportingPdf }];
    if (type === 'DISPUTE') {
      const fcra = await readTemplateExhibit(round, 'FCRA');
      const attachment = await readTemplateExhibit(round, 'ATTACHMENT');
      const affidavit = docs.find((doc) => doc.bureau === bureau && doc.role === 'AFFIDAVIT');
      
      // Build missing items list dynamically based on FTC feature flag
      const missingItems: string[] = [];
      if (!fcra) missingItems.push('FCRA PDF');
      if (!affidavit) missingItems.push('Affidavit DOCX');
      if (!attachment) missingItems.push('Attachment PDF');
      
      // Only require FTC if the feature is enabled
      if (isFtcEnabled()) {
        const ftc = docs.find((doc) => doc.bureau === bureau && doc.role === 'FTC');
        if (!ftc) missingItems.push('FTC DOCX');
        if (missingItems.length) throw new Error(`Complete Dispute Packet Preview is unavailable. Configure or generate: ${missingItems.join(', ')}.`);
        parts.push({ label: 'FCRA', kind: 'PDF', blob: fcra! }, { label: 'Affidavit', kind: 'DOCX', blob: affidavit!.blob }, { label: 'Attachment', kind: 'PDF', blob: attachment! }, { label: 'FTC', kind: 'DOCX', blob: ftc!.blob });
      } else {
        if (missingItems.length) throw new Error(`Complete Dispute Packet Preview is unavailable. Configure or generate: ${missingItems.join(', ')}.`);
        parts.push({ label: 'FCRA', kind: 'PDF', blob: fcra! }, { label: 'Affidavit', kind: 'DOCX', blob: affidavit!.blob }, { label: 'Attachment', kind: 'PDF', blob: attachment! });
      }
    }
    return assembleFinalPdf(parts);
  }
  async function previewPacket(output: ReviewOutput, pendingBlob: Blob): Promise<FinalPdfPacket> {
    const docs = reviewDocs.map((doc) => doc.path === output.path ? { ...doc, blob: pendingBlob } : doc);
    return { path: `Preview/${clean(parsed.name)} ${output.bureau} ${output.type === 'DISPUTE' ? 'DISPUTE' : 'LATE PAYMENT'} PACKET.pdf`, type: output.type, bureau: output.bureau, sequence: sequence(output.type), blob: await assemblePacketForRoute(output.type, output.bureau, docs) };
  }
  async function finalizePdfPackets() {
    setFinalizing(true);
    const packets: FinalPdfPacket[] = [];
    const notices: string[] = [];
    for (const route of routes) {
      try { packets.push({ path: `Final PDF Packets/${clean(parsed.name)} ${route.bureau} ${route.type === 'DISPUTE' ? 'DISPUTE' : 'LATE PAYMENT'} PACKET.pdf`, type: route.type, bureau: route.bureau, sequence: sequence(route.type), blob: await assemblePacketForRoute(route.type, route.bureau, reviewDocs) }); }
      catch (error) { notices.push(error instanceof Error ? error.message : `${route.bureau}: PDF assembly failed.`); }
    }
    let finalOutput: { name: string; blob: Blob } | null = null;
    if (packets.length) { const zip = new JSZip(); packets.forEach((packet) => zip.file(packet.path, packet.blob)); zip.file('Final Packet Manifest.txt', packets.flatMap((packet) => [packet.path, ...packet.sequence.map((entry) => `  ${entry}`), '']).join('\n')); finalOutput = { name: `${clean(parsed.name)}.zip`, blob: await zip.generateAsync({ type: 'blob' }) }; }
    setFinalPackets(packets); setFinalZip(finalOutput); setWarnings((previous) => uniqueNotices(previous, notices)); setFinalizing(false); setStatus(packets.length ? `${packets.length} final PDF packet(s) ready for page-order review.` : 'Final PDF assembly requires attention.');
  }

  function allowed(item: Panel) { return item === 'Generate' ? canGenerate : item === 'Outputs' ? Boolean(workingZip) : true; }
  function stepNav() { return <nav className="workflow-rail">{steps.map((item, index) => <button key={item} disabled={!allowed(item)} className={panel === item ? 'current' : ''} onClick={() => setPanel(item)}><i>{index + 1}</i><span>{item}</span></button>)}</nav>; }
  function dashboard() { return <div className="dashboard-grid"><section className="panel dashboard-hero"><p className="eyebrow">Document operations</p><h2>Build ordered bureau PDF packets.</h2><p>Configure templates, normalize source data, review editable documents and preview the complete packet before download.</p><div className="dashboard-actions"><button className="action-button" onClick={() => setPanel('Templates')}>Configure Templates</button><button className="secondary-button" onClick={() => setPanel('Source Data')}>Load Source Data</button></div></section><article className="metric-tile"><small>Routes</small><strong>{routes.length}</strong><span>Detected letters</span></article><article className="metric-tile"><small>Editable docs</small><strong>{reviewDocs.length}</strong><span>Letters, Affidavit, FTC</span></article><article className="metric-tile"><small>PDF packets</small><strong>{finalPackets.length}</strong><span>Final output</span></article></div>; }
  function templatesView() { return <div className="templates-packet-workspace"><section className="panel template-round-control"><div className="panel-heading"><div><h2>Reusable packet references</h2><p>DOCX templates are editable; PDF inserts are merged unchanged. Supporting Documents remain in Source Data.</p></div><Pill tone="accent">{round}</Pill></div><nav className="round-selector">{rounds.map((item, index) => <button key={item} className={round === item ? 'selected' : ''} onClick={() => { setRound(item); clearOutputs(); }}><span className="round-index">0{index + 1}</span><span className="round-copy"><strong>{item}</strong><small>{round === item ? 'Active packet' : 'Select round'}</small></span></button>)}</nav></section><TemplatePacketConfigurator round={round} slots={currentReferences} supportingReady={evidence.supporting.length > 0} onUploadLetter={uploadReference} onRemoveLetter={removeReference} onExhibitsChange={(next) => { setTemplates(next); clearOutputs(); }} onMessage={setStatus} /></div>; }
  function sourceView() { return <div className="source-case-workspace"><div className="source-workspace"><section className="panel source-input-panel"><div className="panel-heading"><div><h2>Source TXT</h2><p>Only the TXT source and client Supporting Documents are uploaded here.</p></div>{source && <Pill tone={verified ? 'success' : 'neutral'}>{verified ? 'Normalized' : 'Editing'}</Pill>}</div><div className="source-actions"><label className="field-label">Upload TXT source<input className="file-input" type="file" accept=".txt" onChange={async (event) => { const file = event.target.files?.[0]; if (file) normalizeInput(await file.text(), 'Uploaded'); event.target.value = ''; }} /></label>{!source && <button className="secondary-button" onClick={() => setSource(recommendedSourceFormat)}>Use standard format</button>}</div>{source && <div className="normalization-actions">{!normalized && <button className="normalize-source" onClick={() => normalizeInput(source, 'Edited')}>Standardize current edits</button>}{originalSource && <button onClick={() => { setSource(originalSource); setNormalized(false); setCaseId(''); setEvidence(emptyEvidence()); clearOutputs(); }}>Restore original data</button>}</div>}<textarea className="source-area" value={source} onPaste={onPaste} onChange={(event) => { setSource(event.target.value); setNormalized(false); clearOutputs(); }} placeholder="Paste TXT source here..." /></section>{parsed.name ? <section className="panel source-results-panel"><div className="panel-heading"><div><h2>Detected routes</h2><p>Confirm bureau outputs before document generation.</p></div><Pill tone="accent">{routes.length} output{routes.length === 1 ? '' : 's'}</Pill></div><div className="detection-table">{bureaus.map((bureau) => <div className="detection-row" key={bureau}><strong>{bureau}</strong><span>{parsed.dispute[bureau].length} dispute - {parsed.inquiry[bureau].length} inquiry</span><span>{parsed.late[bureau].length} late payment</span></div>)}</div>{sourceWarnings.length > 0 && <div className="source-review"><strong>Review before generating</strong>{sourceWarnings.slice(0, 4).map((warning, index) => <p key={index}>{warning.message}</p>)}</div>}<button className="action-button" disabled={!canGenerate} onClick={() => setPanel('Generate')}>Continue to Packet Plan</button></section> : <section className="panel source-guide"><Empty title="Load client source" text="Normalize TXT data to unlock Supporting Documents." /></section>}</div>{verified && evidenceKey && <SupportingDocumentsSetup storageKey={evidenceKey} clientName={parsed.name} onChanged={(next) => { setEvidence(next); clearOutputs(); }} onMessage={setStatus} />}</div>; }
  function generateView() { return <div className="generation-workspace"><section className="panel generation-overview"><div><p className="eyebrow">Packet plan</p><h2>Prepare editable review documents</h2><p>Letters, Affidavit and FTC remain editable. Open a generated DOCX to preview Supporting Documents and PDF inserts in the complete ordered packet.</p></div><div className="generation-summary"><div><strong>{routes.length}</strong><span>Letters</span></div><div><strong>{evidence.supporting.length ? 'Yes' : 'No'}</strong><span>Support</span></div><div><strong>{configuredExhibits(templates).length}/4</strong><span>Dispute nodes</span></div></div></section><section className="panel route-production"><div className="production-rows">{routes.map((route) => <div className="production-row" key={`${route.bureau}-${route.type}`}><div><strong>{route.bureau} - {typeLabel[route.type]}</strong><small>{route.reason}</small><div className="assembly-chips">{sequence(route.type).map((entry) => <span className="assembly-chip" key={entry}>{entry}</span>)}</div></div><Pill tone="success">Prepare</Pill></div>)}</div>{missingLetters.length > 0 && <div className="alert error">Missing letter DOCX: {missingLetters.map((type) => typeLabel[type]).join(', ')}.</div>}{!evidence.supporting.length && <div className="alert error">Supporting Documents are required for complete packet preview and final PDF packets. Upload them in Source Data.</div>}<button className="action-button generate-primary" disabled={busy || (strict && missingLetters.length > 0)} onClick={() => void generateReviewDocuments()}>{busy ? 'Preparing documents...' : 'Generate Editable Review Documents'}</button></section></div>; }
  function outputsView() { return <OutputReviewWorkspace round={round} outputs={reviewDocs} zipName={workingZip?.name} warnings={warnings} finalPackets={finalPackets} finalizing={finalizing} finalZipName={finalZip?.name} onZip={() => workingZip && deliver(workingZip.name, workingZip.blob)} onFinalZip={() => finalZip && deliver(finalZip.name, finalZip.blob)} onFinalize={finalizePdfPackets} onPreviewPacket={previewPacket} onPdfDownload={(packet: ReviewOutput) => deliver(packet.path.split('/').pop() || 'packet.pdf', packet.blob)} onReplace={saveEdited} />; }
  return <main className="app-shell"><aside className="sidebar"><div className="brand"><span /><div><strong>LetterGenerator</strong><small>Packet workflow</small></div></div><nav aria-label="Primary navigation">{panels.map((item) => <button key={item} className={panel === item ? 'active' : ''} disabled={!allowed(item)} onClick={() => setPanel(item)}><strong>{item}</strong></button>)}</nav></aside><section className="main-area"><header className="header"><div><p className="eyebrow">{panel === 'Dashboard' ? 'Document operations' : `${round} workflow`}</p><h1>{panel}</h1></div></header>{steps.includes(panel) && stepNav()}{panel === 'Dashboard' && dashboard()}{panel === 'Templates' && templatesView()}{panel === 'Source Data' && sourceView()}{panel === 'Generate' && generateView()}{panel === 'Outputs' && outputsView()}{panel === 'Settings' && <section className="panel settings"><label className="setting"><input type="checkbox" checked={strict} onChange={(event) => setStrict(event.target.checked)} /><span><strong>Strict template validation</strong><small>Block generation when required letter DOCX references are missing.</small></span></label></section>}<div className="toast activity-status" role="status" aria-live="polite"><strong>Activity</strong><span>{status}</span></div></section></main>;
}
