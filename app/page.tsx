'use client';

import { useEffect, useMemo, useState, type ClipboardEvent, type ReactNode } from 'react';
import JSZip from 'jszip';
import OutputReviewWorkspace, { type ReviewOutput } from '../components/OutputReviewWorkspace';
import SupportingDocumentsSetup from '../components/SupportingDocumentsSetup';
import TemplatePacketConfigurator from '../components/TemplatePacketConfigurator';
import { isDocx, renderReferenceDisputeDocx } from '../lib/docx-renderer';
import { renderLatePaymentReference } from '../lib/late-reference-renderer';
import { bureauInfo, bureaus, createNormalizedSourceCopy, detectRoutes, parseSource, recommendedSourceFormat, type LetterRoute, type LetterType } from '../lib/letter-engine';
import { loadPacketAssets, type PacketAssets } from '../lib/packet-assets';
import { appendSupportingPages, getSupportingPages, type PacketPage } from '../lib/packet-renderer';
import { configuredExhibits, loadTemplateExhibits, readTemplateExhibit, type ExhibitKind, type TemplateExhibits } from '../lib/template-exhibits';

type Round = '1st Round' | '2nd Round' | '3rd Round' | 'Final';
type Panel = 'Dashboard' | 'Templates' | 'Source Data' | 'Generate' | 'Outputs' | 'Settings';
type Tone = 'neutral' | 'success' | 'warning' | 'accent';
type ReferenceSlot = { id: string; round: Round; type: LetterType; name: string; file: string; size?: number };
type Output = ReviewOutput;

const rounds: Round[] = ['1st Round', '2nd Round', '3rd Round', 'Final'];
const panels: Panel[] = ['Dashboard', 'Templates', 'Source Data', 'Generate', 'Outputs', 'Settings'];
const workflow: Panel[] = ['Templates', 'Source Data', 'Generate', 'Outputs'];
const slotsKey = 'lettergenerator.visual-reference-output.v13';
const priorKeys = ['lettergenerator.visual-reference-output.v12', 'lettergenerator.visual-reference-output.v11'];
const dbName = 'lettergenerator-private-templates';
const storeName = 'files';
const label: Record<LetterType, string> = { DISPUTE: 'Dispute Letter', LATE_PAYMENT: 'Late Payment Letter' };
const folder: Record<LetterType, string> = { DISPUTE: 'Dispute Letters', LATE_PAYMENT: 'Late Payment Letters' };
const exhibitLabel: Record<ExhibitKind, string> = { FCRA: 'FCRA', AFFIDAVIT: 'Affidavit', ATTACHMENT: 'Attachment', FTC: 'FTC' };
const US_TIME_ZONE = 'America/New_York';
const noPacket = (): PacketAssets => ({ supporting: [], legalPdf: null });
const noExhibits = (): TemplateExhibits => ({ FCRA: null, AFFIDAVIT: null, ATTACHMENT: null, FTC: null });

function dateEastern() {
  return new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: US_TIME_ZONE }).format(new Date());
}
function seedSlots(): ReferenceSlot[] {
  return rounds.flatMap((round, index) => {
    const prefix = index ? `r${index + 1}-` : '';
    return [
      { id: `${prefix}dispute-letter`, round, type: 'DISPUTE', name: `${round} Dispute Letter`, file: '' },
      { id: `${prefix}late-letter`, round, type: 'LATE_PAYMENT', name: `${round} Late Payment Letter`, file: '' }
    ];
  });
}
function mergeSlots(raw: unknown) {
  const initial = seedSlots();
  if (!Array.isArray(raw)) return initial;
  return initial.map((slot) => {
    const found = raw.find((item: ReferenceSlot) => item.id === slot.id && typeof item.file === 'string') as ReferenceSlot | undefined;
    return found ? { ...slot, file: found.file, size: found.size } : slot;
  });
}
function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(dbName, 1);
    request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains(storeName)) request.result.createObjectStore(storeName); };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
async function putReference(id: string, file: File) {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => { const tx = db.transaction(storeName, 'readwrite'); tx.objectStore(storeName).put(file, id); tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); });
  db.close();
}
async function getReference(id: string): Promise<File | null> {
  const db = await openDb();
  const file = await new Promise<File | null>((resolve, reject) => { const request = db.transaction(storeName, 'readonly').objectStore(storeName).get(id); request.onsuccess = () => resolve((request.result as File) || null); request.onerror = () => reject(request.error); });
  db.close();
  return file;
}
async function deleteReference(id: string) {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => { const tx = db.transaction(storeName, 'readwrite'); tx.objectStore(storeName).delete(id); tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); });
  db.close();
}
function cleanName(value: string) { return (value || 'CLIENT').replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, ' ').trim().toUpperCase(); }
function packageName(value: string) { return cleanName(value).replace(/[^A-Z0-9]+/g, '_'); }
function fileExtension(name: string) { const match = name.match(/(\.[a-z0-9]+)$/i); return match?.[1] || ''; }
function saveDownload(name: string, blob: Blob) { const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = name; link.click(); URL.revokeObjectURL(url); }
function Pill({ children, tone = 'neutral' }: { children: ReactNode; tone?: Tone }) { return <span className={`pill ${tone}`}>{children}</span>; }
function Empty({ title, text }: { title: string; text: string }) { return <div className="empty-state"><div className="empty-icon">+</div><strong>{title}</strong><p>{text}</p></div>; }

export default function Page() {
  const [panel, setPanel] = useState<Panel>('Dashboard');
  const [round, setRound] = useState<Round>('1st Round');
  const [slots, setSlots] = useState<ReferenceSlot[]>(seedSlots);
  const [source, setSource] = useState('');
  const [originalSource, setOriginalSource] = useState('');
  const [normalized, setNormalized] = useState(false);
  const [caseId, setCaseId] = useState('');
  const [support, setSupport] = useState<PacketAssets>(noPacket);
  const [exhibits, setExhibits] = useState<TemplateExhibits>(noExhibits);
  const [strict, setStrict] = useState(false);
  const [outputs, setOutputs] = useState<Output[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [zipOutput, setZipOutput] = useState<{ name: string; blob: Blob } | null>(null);
  const [outputDate, setOutputDate] = useState('');
  const [notes, setNotes] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('Configure reusable document packets, then load a client source.');

  useEffect(() => { for (const key of [slotsKey, ...priorKeys]) { const saved = localStorage.getItem(key); if (saved) { setSlots(mergeSlots(JSON.parse(saved))); break; } } }, []);
  useEffect(() => { localStorage.setItem(slotsKey, JSON.stringify(slots)); }, [slots]);
  useEffect(() => { setExhibits(loadTemplateExhibits(round)); }, [round]);

  const currentSlots = slots.filter((slot) => slot.round === round);
  const parsed = useMemo(() => parseSource(source), [source]);
  const routes = useMemo(() => detectRoutes(parsed), [parsed]);
  const sourceValid = Boolean(source.trim() && parsed.name);
  const sourceVerified = normalized && sourceValid;
  const supportKey = caseId ? `${round}::${caseId}` : '';
  const hasDispute = routes.some((route) => route.type === 'DISPUTE');
  const neededReferences = Array.from(new Set(routes.map((route) => route.type)));
  const missingReferences = neededReferences.filter((type) => !currentSlots.find((slot) => slot.type === type)?.file);
  const generatedReady = sourceVerified && routes.length > 0;
  const diagnostics = parsed.diagnostics?.filter((item) => item.level === 'warning') || [];
  const activeBureaus = bureaus.filter((bureau) => routes.some((route) => route.bureau === bureau));

  useEffect(() => { setSupport(sourceVerified && supportKey ? loadPacketAssets(supportKey) : noPacket()); }, [sourceVerified, supportKey]);

  function clearGeneration() { setOutputs([]); setWarnings([]); setNotes([]); setOutputDate(''); setZipOutput(null); }
  function newSourceSession() { setCaseId(crypto.randomUUID()); setSupport(noPacket()); clearGeneration(); }
  function normalizeIncoming(text: string, action: 'uploaded' | 'pasted') {
    if (!text.trim()) return;
    const copy = createNormalizedSourceCopy(text);
    setOriginalSource(text); setSource(copy.text); setNormalized(true); newSourceSession();
    setStatus(`${action === 'uploaded' ? 'Uploaded' : 'Pasted'} TXT standardized. Supporting Documents upload is now available.`);
  }
  function standardizeEdits() {
    if (!source.trim()) return;
    if (!originalSource) setOriginalSource(source);
    setSource(createNormalizedSourceCopy(source).text); setNormalized(true);
    if (!caseId) newSourceSession(); else clearGeneration();
    setStatus('Source standardized. Add Supporting Documents for this client only.');
  }
  function restoreOriginal() {
    if (!originalSource) return;
    setSource(originalSource); setOriginalSource(''); setNormalized(false); setCaseId(''); setSupport(noPacket()); clearGeneration();
    setStatus('Original source restored. Supporting uploads are hidden until source normalization.');
  }
  function pasteSource(event: ClipboardEvent<HTMLTextAreaElement>) {
    const pasted = event.clipboardData.getData('text'); if (!pasted.trim()) return; event.preventDefault();
    const field = event.currentTarget; normalizeIncoming(`${source.slice(0, field.selectionStart)}${pasted}${source.slice(field.selectionEnd)}`, 'pasted');
  }
  async function uploadLetter(slot: ReferenceSlot, file: File) {
    if (!isDocx(file.name)) { setStatus('Letter reference must be DOCX.'); return; }
    await putReference(slot.id, file); setSlots((all) => all.map((item) => item.id === slot.id ? { ...item, file: file.name, size: file.size } : item)); clearGeneration(); setStatus(`${slot.name} reference saved.`);
  }
  async function removeLetter(slot: ReferenceSlot) {
    if (!window.confirm(`Remove ${slot.name} reference?`)) return;
    await deleteReference(slot.id); setSlots((all) => all.map((item) => item.id === slot.id ? { ...item, file: '', size: undefined } : item)); clearGeneration();
  }
  async function renderRoute(route: LetterRoute, input: File, letterDate: string) {
    const identity = { consumerName: parsed.name, addressLines: parsed.address, dob: parsed.dob, ssn: parsed.ssn, letterDate, bureauName: bureauInfo[route.bureau].name, bureauAddressLines: bureauInfo[route.bureau].address.split('\n') };
    if (route.type === 'DISPUTE') return renderReferenceDisputeDocx(input, { ...identity, disputeItems: route.items.filter((item) => item.type === 'DISPUTE_ACCOUNT').map((item) => item.displayText), hardInquiryItems: route.items.filter((item) => item.type === 'HARD_INQUIRY').map((item) => item.displayText) });
    return renderLatePaymentReference(input, { ...identity, latePaymentItems: route.items.map((item) => item.displayText) });
  }
  async function makeZip(files: Output[], generatedWarnings: string[], date: string, reviewNotes: string[]) {
    const zip = new JSZip(); files.forEach((file) => zip.file(file.path, file.blob)); const includedExhibits: string[] = [];
    for (const output of files.filter((file) => file.type === 'DISPUTE')) {
      for (const kind of configuredExhibits(exhibits)) {
        const exhibit = exhibits[kind]; const uploaded = await readTemplateExhibit(round, kind);
        if (exhibit && uploaded) { const name = `${output.path.replace(/\.docx$/i, '')} ${String(['FCRA', 'AFFIDAVIT', 'ATTACHMENT', 'FTC'].indexOf(kind) + 3).padStart(2, '0')} ${exhibitLabel[kind]}${fileExtension(exhibit.name)}`; zip.file(name, uploaded); includedExhibits.push(name); }
      }
    }
    zip.file('Generation Manifest.txt', ['LetterGenerator Packet Manifest', `Client: ${parsed.name}`, `Round: ${round}`, `Letter date (US Eastern): ${date}`, '', 'Supporting Documents:', support.supporting.length ? 'Inserted inside every created DOCX letter.' : 'Not included.', '', 'Static Dispute Exhibits:', ...configuredExhibits(exhibits).map((kind) => `${kind}: configured in Templates`), '', 'Created Files:', ...files.map((file) => `- ${file.path}`), ...includedExhibits.map((path) => `- ${path}`), ...(reviewNotes.length ? ['', 'Review Changes:', ...reviewNotes.map((note) => `- ${note}`)] : []), ...(generatedWarnings.length ? ['', 'Warnings:', ...generatedWarnings.map((warning) => `- ${warning}`)] : [])].join('\n'));
    return zip.generateAsync({ type: 'blob' });
  }
  async function generate() {
    if (!generatedReady || (strict && missingReferences.length)) { setStatus('Complete required generation checks.'); return; }
    setBusy(true); const made: Output[] = []; const generatedWarnings: string[] = []; const date = dateEastern(); let supportingPages: PacketPage[] = [];
    try { supportingPages = supportKey ? await getSupportingPages(supportKey) : []; } catch (error) { generatedWarnings.push(error instanceof Error ? error.message : 'Supporting document could not be appended.'); }
    if (hasDispute && !exhibits.FCRA) generatedWarnings.push('Dispute output has no FCRA exhibit configured in Templates.');
    for (const route of routes) {
      const slot = currentSlots.find((item) => item.type === route.type); if (!slot?.file) { generatedWarnings.push(`${label[route.type]} / ${route.bureau}: DOCX reference missing.`); continue; }
      const reference = await getReference(slot.id); if (!reference) { generatedWarnings.push(`${label[route.type]} / ${route.bureau}: saved reference unavailable.`); continue; }
      try { let blob = await renderRoute(route, reference, date); if (supportingPages.length) blob = await appendSupportingPages(blob, supportingPages); const path = `${folder[route.type]}/${cleanName(parsed.name)} ${route.bureau}.docx`; const detail = [supportingPages.length ? 'Supporting Document inside letter' : '', route.type === 'DISPUTE' && configuredExhibits(exhibits).length ? `${configuredExhibits(exhibits).length} dispute exhibit(s)` : ''].filter(Boolean).join(' · ') || 'Generated letter'; made.push({ path, type: route.type, bureau: route.bureau, count: route.items.length, detail, blob }); } catch (error) { generatedWarnings.push(`${label[route.type]} / ${route.bureau}: ${error instanceof Error ? error.message : 'Generation failed.'}`); }
    }
    const packageBlob = await makeZip(made, generatedWarnings, date, []); setOutputs(made); setWarnings(generatedWarnings); setNotes([]); setOutputDate(date); setZipOutput({ name: `${packageName(parsed.name)}_${packageName(round)}_LETTERS.zip`, blob: packageBlob }); setPanel('Outputs'); setBusy(false); setStatus(`${made.length} DOCX created. ${generatedWarnings.length} packet item(s) require attention.`);
  }
  async function saveEdited(output: Output, file: File) { const updated = outputs.map((item) => item.path === output.path ? { ...item, blob: file, detail: 'Edited DOCX saved' } : item); const nextNotes = [...notes, `EDITED | ${output.path}`]; const blob = await makeZip(updated, warnings, outputDate || dateEastern(), nextNotes); setOutputs(updated); setNotes(nextNotes); if (zipOutput) setZipOutput({ name: zipOutput.name, blob }); }
  async function removeEdited(output: Output) { const updated = outputs.filter((item) => item.path !== output.path); const nextNotes = [...notes, `REMOVED | ${output.path}`]; const blob = await makeZip(updated, warnings, outputDate || dateEastern(), nextNotes); setOutputs(updated); setNotes(nextNotes); if (zipOutput) setZipOutput({ name: zipOutput.name, blob }); }
  function unlocked(name: Panel) { return name === 'Generate' ? generatedReady : name === 'Outputs' ? Boolean(zipOutput) : true; }
  function roundsBar() { return <nav className="round-selector">{rounds.map((item, index) => <button key={item} className={round === item ? 'selected' : ''} onClick={() => { setRound(item); clearGeneration(); }}><span className="round-index">0{index + 1}</span><span className="round-copy"><strong>{item}</strong><small>{round === item ? 'Active packet order' : 'Select round'}</small></span></button>)}</nav>; }
  function stepsBar() { return <nav className="workflow-rail">{workflow.map((item, index) => <button key={item} disabled={!unlocked(item)} className={panel === item ? 'current' : ''} onClick={() => setPanel(item)}><i>{index + 1}</i><span>{item}</span></button>)}</nav>; }
  function dashboardView() { return <div className="dashboard-grid"><section className="panel dashboard-hero"><p className="eyebrow">Document operations</p><h2>Build bureau-specific document packets.</h2><p>Templates define packet order. Source Data contains the TXT facts and the client Supporting Documents.</p><div className="dashboard-actions"><button className="action-button" onClick={() => setPanel('Templates')}>Configure Templates</button><button className="secondary-button" onClick={() => setPanel('Source Data')}>Load Source Data</button></div></section><article className="metric-tile"><small>Round</small><strong>{round}</strong><span>Active packet sequence</span></article><article className="metric-tile"><small>Detected letters</small><strong>{routes.length}</strong><span>{sourceVerified ? 'Source normalized' : 'Awaiting source'}</span></article><article className="metric-tile"><small>Supporting documents</small><strong>{support.supporting.length}</strong><span>Client-specific files</span></article><article className="metric-tile"><small>Dispute exhibits</small><strong>{configuredExhibits(exhibits).length}</strong><span>Reusable template files</span></article></div>; }
  function templatesView() { return <div className="templates-packet-workspace"><section className="panel template-round-control"><div className="panel-heading"><div><h2>Reusable letter references</h2><p>Configure fixed packet order here. Supporting Documents stay with the client TXT in Source Data.</p></div><Pill tone="accent">{round}</Pill></div>{roundsBar()}</section><TemplatePacketConfigurator round={round} slots={currentSlots} supportingReady={support.supporting.length > 0} onUploadLetter={uploadLetter} onRemoveLetter={removeLetter} onExhibitsChange={(next) => { setExhibits(next); clearGeneration(); }} onMessage={setStatus} /></div>; }
  function sourceView() { return <div className="source-case-workspace"><div className="source-workspace"><section className="panel source-input-panel"><div className="panel-heading"><div><h2>Source TXT</h2><p>Only client data and Supporting Documents are uploaded in this step.</p></div>{source && <Pill tone={sourceVerified ? 'success' : 'neutral'}>{sourceVerified ? 'Normalized' : 'Editing'}</Pill>}</div><div className="source-actions"><label className="field-label">Upload TXT file<input className="file-input" type="file" accept=".txt" onChange={async (event) => { const file = event.target.files?.[0]; if (file) normalizeIncoming(await file.text(), 'uploaded'); event.target.value = ''; }} /></label>{!source && <button className="secondary-button" onClick={() => setSource(recommendedSourceFormat)}>Use standard format</button>}</div>{source && <div className="normalization-actions">{!normalized && <button className="normalize-source" onClick={standardizeEdits}>Standardize current edits</button>}{originalSource && <button onClick={restoreOriginal}>Restore original data</button>}</div>}{sourceVerified && <div className="normalized-source-banner"><strong>Normalized source verified · Supporting Documents unlocked</strong><p>FCRA, Affidavit, Attachment and FTC are managed in Templates, not here.</p></div>}<textarea className="source-area" value={source} onPaste={pasteSource} onChange={(event) => { setSource(event.target.value); setNormalized(false); clearGeneration(); }} placeholder="Paste TXT source here..." /></section>{sourceValid ? <section className="panel source-results-panel"><div className="panel-heading"><div><h2>Detected letters</h2><p>Review created routes before generation.</p></div><Pill tone="accent">{routes.length} output{routes.length === 1 ? '' : 's'}</Pill></div><div className="detection-table">{bureaus.map((bureau) => <div className="detection-row" key={bureau}><strong>{bureau}</strong><span>{parsed.dispute[bureau].length || parsed.inquiry[bureau].length ? `${parsed.dispute[bureau].length} dispute · ${parsed.inquiry[bureau].length} inquiry` : 'No dispute data'}</span><span>{parsed.late[bureau].length ? `${parsed.late[bureau].length} late payment` : 'No late payment'}</span></div>)}</div>{diagnostics.length > 0 && <div className="source-review"><strong>Review before generating</strong>{diagnostics.slice(0, 4).map((item, i) => <p key={i}>{item.message}</p>)}</div>}<button className="action-button" disabled={!generatedReady} onClick={() => setPanel('Generate')}>Continue to Generate</button></section> : <section className="panel source-guide"><Empty title="Load client source" text="Upload TXT data first. Supporting Documents appear after normalization." /></section>}</div>{sourceVerified && supportKey && <SupportingDocumentsSetup storageKey={supportKey} clientName={parsed.name} onChanged={(next) => { setSupport(next); clearGeneration(); }} onMessage={setStatus} />}</div>; }
  function generateView() { if (!generatedReady) return <section className="panel idle-panel"><Empty title="Generation unavailable" text="Normalize a valid source first." /></section>; return <div className="generation-workspace"><section className="panel generation-overview"><div><p className="eyebrow">Packet preparation</p><h2>Prepare {round} delivery</h2><p>Each valid bureau route receives its configured ordered packet.</p></div><div className="generation-summary"><div><strong>{routes.length}</strong><span>Letters</span></div><div><strong>{support.supporting.length ? 'Yes' : 'No'}</strong><span>Supporting</span></div><div><strong>{configuredExhibits(exhibits).length}</strong><span>Exhibits</span></div></div></section><section className="panel route-production"><div className="panel-heading"><div><h2>Output plan</h2><p>Dispute exhibits are configured in Templates; Supporting Documents are inserted from Source Data.</p></div></div><div className="production-rows">{activeBureaus.flatMap((bureau) => routes.filter((route) => route.bureau === bureau).map((route) => <div className="production-row" key={`${bureau}-${route.type}`}><div><strong>{bureau} · {label[route.type]}</strong><small>{route.reason}</small><div className="assembly-chips"><span className="assembly-chip">Letter</span>{support.supporting.length > 0 && <span className="assembly-chip shared">Supporting Document</span>}{route.type === 'DISPUTE' && configuredExhibits(exhibits).map((item) => <span className="assembly-chip legal" key={item}>{item}</span>)}</div></div><Pill tone="success">Create</Pill></div>))}</div>{missingReferences.length > 0 && <div className="alert error">Missing required letter template: {missingReferences.map((item) => label[item]).join(', ')}.</div>}<button className="action-button generate-primary" disabled={busy || (strict && missingReferences.length > 0)} onClick={() => void generate()}>{busy ? 'Assembling packets...' : 'Generate Document Packets ZIP'}</button></section></div>; }
  function outputsView() { return <OutputReviewWorkspace round={round} outputs={outputs} zipName={zipOutput?.name} warnings={warnings} onZip={() => zipOutput && saveDownload(zipOutput.name, zipOutput.blob)} onDownload={(output) => saveDownload(output.path.split('/').pop() || 'letter.docx', output.blob)} onReplace={saveEdited} onRemove={removeEdited} />; }
  function settingsView() { return <section className="panel settings"><div className="panel-heading"><div><h2>Generation rules</h2><p>Production safeguards for packet assembly.</p></div></div><label className="setting"><input type="checkbox" checked={strict} onChange={(event) => setStrict(event.target.checked)} /><span><strong>Block generation when a letter reference is missing</strong><small>Supporting Documents and optional exhibits do not block generation.</small></span></label></section>; }

  return <main className="app-shell"><aside className="sidebar"><div className="brand"><span /><div><strong>LetterGenerator</strong><small>Packet workflow</small></div></div><nav>{panels.map((item) => <button key={item} className={panel === item ? 'active' : ''} disabled={!unlocked(item)} onClick={() => setPanel(item)}><strong>{item}</strong></button>)}</nav></aside><section className="main-area"><header className="header"><div><p className="eyebrow">{panel === 'Dashboard' ? 'Document operations' : `${round} workflow`}</p><h1>{panel}</h1></div></header>{workflow.includes(panel) && stepsBar()}{panel === 'Dashboard' && dashboardView()}{panel === 'Templates' && templatesView()}{panel === 'Source Data' && sourceView()}{panel === 'Generate' && generateView()}{panel === 'Outputs' && outputsView()}{panel === 'Settings' && settingsView()}<div className="toast activity-status" role="status"><strong>Activity</strong><span>{status}</span></div></section></main>;
}
