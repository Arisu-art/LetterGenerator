'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import JSZip from 'jszip';
import OutputReviewWorkspace, { type ReviewOutput } from '../components/OutputReviewWorkspace';
import { isDocx, renderReferenceDisputeDocx } from '../lib/docx-renderer';
import { renderLatePaymentReference } from '../lib/late-reference-renderer';
import { bureauInfo, bureaus, detectRoutes, parseSource, recommendedSourceFormat, type LetterRoute, type LetterType } from '../lib/letter-engine';

type Round = '1st Round' | '2nd Round' | '3rd Round' | 'Final';
type Panel = 'Dashboard' | 'Templates' | 'Source Data' | 'Generate' | 'Outputs' | 'Settings';
type Tone = 'neutral' | 'success' | 'warning' | 'accent';
type ReferenceSlot = { id: string; round: Round; type: LetterType; name: string; file: string; size?: number };
type Output = ReviewOutput;

const rounds: Round[] = ['1st Round', '2nd Round', '3rd Round', 'Final'];
const panels: Panel[] = ['Dashboard', 'Source Data', 'Templates', 'Generate', 'Outputs', 'Settings'];
const workflow: Panel[] = ['Templates', 'Source Data', 'Generate', 'Outputs'];
const storageKey = 'lettergenerator.visual-reference-output.v12';
const legacyKeys = ['lettergenerator.visual-reference-output.v11', 'lettergenerator.visual-reference-output.v10', 'lettergenerator.reference-accurate-letters.v9', 'lettergenerator.category-letters.v8', 'lettergenerator.reference-canvas.v6', 'lettergenerator.round.library.v5'];
const dbName = 'lettergenerator-private-templates';
const storeName = 'files';
const label: Record<LetterType, string> = { DISPUTE: 'Dispute Letter', LATE_PAYMENT: 'Late Payment Letter' };
const folder: Record<LetterType, string> = { DISPUTE: 'Dispute Letters', LATE_PAYMENT: 'Late Payment Letters' };
const US_TIME_ZONE = 'America/New_York';

function currentUsLetterDate() { return new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: US_TIME_ZONE }).format(new Date()); }
function seedSlots(): ReferenceSlot[] {
  return rounds.flatMap((round, index) => {
    const prefix = index ? `r${index + 1}-` : '';
    return [
      { id: `${prefix}dispute-letter`, round, type: 'DISPUTE', name: `${round} Dispute Output Reference`, file: '' },
      { id: `${prefix}late-letter`, round, type: 'LATE_PAYMENT', name: `${round} Late Payment Output Reference`, file: '' }
    ];
  });
}
function mergeSaved(raw: unknown): ReferenceSlot[] {
  const slots = seedSlots();
  if (!Array.isArray(raw)) return slots;
  const previousDocuments = raw.flatMap((item: { docs?: Array<{ id: string; file?: string; size?: number }> }) => item.docs || []);
  return slots.map((slot) => {
    const direct = raw.find((item: ReferenceSlot) => item.id === slot.id && typeof item.file === 'string') as ReferenceSlot | undefined;
    const old = previousDocuments.find((item) => item.id === slot.id);
    return direct ? { ...slot, file: direct.file, size: direct.size } : old ? { ...slot, file: old.file || '', size: old.size } : slot;
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
async function putFile(id: string, file: File) { const db = await openDb(); await new Promise<void>((resolve, reject) => { const tx = db.transaction(storeName, 'readwrite'); tx.objectStore(storeName).put(file, id); tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); }); db.close(); }
async function getFile(id: string): Promise<File | null> { const db = await openDb(); const file = await new Promise<File | null>((resolve, reject) => { const request = db.transaction(storeName, 'readonly').objectStore(storeName).get(id); request.onsuccess = () => resolve((request.result as File) || null); request.onerror = () => reject(request.error); }); db.close(); return file; }
async function removeFile(id: string) { const db = await openDb(); await new Promise<void>((resolve, reject) => { const tx = db.transaction(storeName, 'readwrite'); tx.objectStore(storeName).delete(id); tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); }); db.close(); }
function safePackageName(value: string) { return (value || 'CLIENT').replace(/[^a-z0-9]+/gi, '_').replace(/^_|_$/g, '').toUpperCase(); }
function documentClientName(value: string) { return (value || 'CLIENT').replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, ' ').trim().toUpperCase(); }
function bytes(value?: number) { if (!value) return ''; return value > 1048576 ? `${(value / 1048576).toFixed(1)} MB` : `${(value / 1024).toFixed(1)} KB`; }
function download(name: string, blob: Blob) { const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = name; link.click(); URL.revokeObjectURL(url); }
function Pill({ children, tone = 'neutral' }: { children: ReactNode; tone?: Tone }) { return <span className={`pill ${tone}`}>{children}</span>; }
function Empty({ title, text }: { title: string; text: string }) { return <div className="empty-state"><div className="empty-icon">+</div><strong>{title}</strong><p>{text}</p></div>; }

export default function Page() {
  const [panel, setPanel] = useState<Panel>('Dashboard');
  const [slots, setSlots] = useState<ReferenceSlot[]>(seedSlots);
  const [round, setRound] = useState<Round>('1st Round');
  const [selectedId, setSelectedId] = useState('dispute-letter');
  const [source, setSource] = useState('');
  const [strict, setStrict] = useState(false);
  const [loading, setLoading] = useState(false);
  const [outputs, setOutputs] = useState<Output[]>([]);
  const [generationWarnings, setGenerationWarnings] = useState<string[]>([]);
  const [reviewNotes, setReviewNotes] = useState<string[]>([]);
  const [generatedDate, setGeneratedDate] = useState('');
  const [zipOutput, setZipOutput] = useState<{ name: string; blob: Blob } | null>(null);
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState('Upload completed DOCX output references, then upload the TXT source.');

  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) setSlots(mergeSaved(JSON.parse(saved)));
      else for (const key of legacyKeys) {
        const previous = localStorage.getItem(key);
        if (previous) { setSlots(mergeSaved(JSON.parse(previous))); setStatus('Earlier uploaded document restored. Replace each slot with its finished DOCX output reference.'); break; }
      }
    } catch { setStatus('Reference library is ready.'); }
    setReady(true);
  }, []);
  useEffect(() => { if (ready) localStorage.setItem(storageKey, JSON.stringify(slots)); }, [ready, slots]);

  const roundSlots = slots.filter((slot) => slot.round === round);
  const selected = roundSlots.find((slot) => slot.id === selectedId) || roundSlots[0];
  const parsed = useMemo(() => parseSource(source), [source]);
  const routes = useMemo(() => detectRoutes(parsed), [parsed]);
  const missing = routes.filter((route) => !roundSlots.find((slot) => slot.type === route.type)?.file);
  const missingTypes = Array.from(new Set(missing.map((route) => route.type)));
  const uploadedReferences = roundSlots.filter((slot) => slot.file).length;
  const sourceReady = Boolean(source.trim() && parsed.name);
  const generationReady = sourceReady && routes.length > 0;
  const parseWarnings = parsed.diagnostics?.filter((item) => item.level === 'warning') || [];
  const activeBureaus = bureaus.filter((bureau) => routes.some((route) => route.bureau === bureau));
  const requiredTypes = Array.from(new Set(routes.map((route) => route.type)));
  const blockers = [
    !source.trim() ? 'Upload or paste TXT source data.' : '',
    source.trim() && !parsed.name ? 'Client information could not be read from the TXT file.' : '',
    source.trim() && !routes.length ? 'No valid dispute, hard-inquiry, or late-payment items were detected.' : ''
  ].filter(Boolean);

  function panelEnabled(item: Panel) { if (item === 'Generate') return generationReady; if (item === 'Outputs') return Boolean(zipOutput); return true; }
  function resetPackage() { setOutputs([]); setGenerationWarnings([]); setReviewNotes([]); setGeneratedDate(''); setZipOutput(null); }
  function chooseRound(next: Round) { setRound(next); setSelectedId(slots.find((slot) => slot.round === next)!.id); resetPackage(); }
  async function uploadSlot(file: File) {
    if (!isDocx(file.name)) { setStatus('Only DOCX documents are accepted.'); return; }
    await putFile(selected.id, file);
    setSlots((items) => items.map((slot) => slot.id === selected.id ? { ...slot, file: file.name, size: file.size } : slot));
    setStatus(`${selected.name} saved. It will control that document type's generated appearance.`);
  }
  async function deleteSlot() {
    if (!window.confirm(`Delete ${selected.name}?`)) return;
    await removeFile(selected.id);
    setSlots((items) => items.map((slot) => slot.id === selected.id ? { ...slot, file: '', size: undefined } : slot));
    setStatus(`${selected.name} removed.`);
  }
  async function renderRoute(route: LetterRoute, input: File, letterDate: string) {
    const identity = { consumerName: parsed.name, addressLines: parsed.address, dob: parsed.dob, ssn: parsed.ssn, letterDate, bureauName: bureauInfo[route.bureau].name, bureauAddressLines: bureauInfo[route.bureau].address.split('\n') };
    if (route.type === 'DISPUTE') return renderReferenceDisputeDocx(input, {
      ...identity,
      disputeItems: route.items.filter((item) => item.type === 'DISPUTE_ACCOUNT').map((item) => item.displayText),
      hardInquiryItems: route.items.filter((item) => item.type === 'HARD_INQUIRY').map((item) => item.displayText)
    });
    return renderLatePaymentReference(input, { ...identity, latePaymentItems: route.items.map((item) => item.displayText) });
  }
  function manifest(files: Output[], warnings: string[], date: string, notes: string[]) {
    return ['LetterGenerator Visual Reference Manifest', `Client: ${parsed.name}`, `Round: ${round}`, `Letter date (US Eastern): ${date}`, '', 'Output Decisions:', ...bureaus.flatMap((bureau) => {
      const dispute = parsed.dispute[bureau].length;
      const inquiry = parsed.inquiry[bureau].length;
      const late = parsed.late[bureau].length;
      return [`${dispute || inquiry ? 'CREATE' : 'SKIP'} | Dispute | ${bureau} | ${dispute} dispute account(s), ${inquiry} hard inquiry item(s)`, `${late ? 'CREATE' : 'SKIP'} | Late Payment | ${bureau} | ${late} item(s)`];
    }), '', 'Files Included in Current Package:', ...files.map((file) => `- ${file.path}`), ...(notes.length ? ['', 'Review Changes:', ...notes.map((note) => `- ${note}`)] : []), ...(warnings.length ? ['', 'Generation Warnings:', ...warnings.map((warning) => `- ${warning}`)] : [])].join('\n');
  }
  async function buildZip(files: Output[], warnings: string[], date: string, notes: string[]) {
    const zip = new JSZip();
    files.forEach((file) => zip.file(file.path, file.blob));
    zip.file('Generation Manifest.txt', manifest(files, warnings, date, notes));
    return zip.generateAsync({ type: 'blob' });
  }
  async function generate() {
    if (blockers.length || (strict && missing.length)) { setPanel('Generate'); setStatus('Resolve the generation checks shown on the screen.'); return; }
    setLoading(true);
    const made: Output[] = []; const warnings: string[] = []; const date = currentUsLetterDate();
    for (const route of routes) {
      const slot = roundSlots.find((entry) => entry.type === route.type);
      if (!slot?.file) { warnings.push(`${label[route.type]} / ${route.bureau}: completed DOCX reference not uploaded.`); continue; }
      const input = await getFile(slot.id);
      if (!input) { warnings.push(`${label[route.type]} / ${route.bureau}: saved DOCX not readable.`); continue; }
      try {
        const blob = await renderRoute(route, input, date);
        const filename = `${documentClientName(parsed.name)} ${route.bureau}.docx`;
        const path = `${folder[route.type]}/${filename}`;
        made.push({ path, type: route.type, bureau: route.bureau, count: route.items.length, detail: 'Generated reference format', blob });
      } catch (error) { warnings.push(`${label[route.type]} / ${route.bureau}: ${error instanceof Error ? error.message : 'rendering failed.'}`); }
    }
    const packed = await buildZip(made, warnings, date, []);
    setOutputs(made); setGenerationWarnings(warnings); setReviewNotes([]); setGeneratedDate(date); setZipOutput({ name: `${safePackageName(parsed.name)}_${safePackageName(round)}_LETTERS.zip`, blob: packed }); setPanel('Outputs'); setLoading(false); setStatus(warnings.length ? `${made.length} DOCX created. ${warnings.length} output(s) require attention.` : `${made.length} DOCX letter(s) created successfully.`);
  }
  async function replaceReviewedDocx(output: Output, file: File) {
    if (!isDocx(file.name)) { setStatus('Edited output must be a DOCX file.'); return; }
    const updated = outputs.map((item) => item.path === output.path ? { ...item, blob: file, detail: 'Edited DOCX saved' } : item);
    const notes = [...reviewNotes, `EDITED | ${output.path}`];
    const packed = await buildZip(updated, generationWarnings, generatedDate || currentUsLetterDate(), notes);
    setOutputs(updated); setReviewNotes(notes); setZipOutput({ name: zipOutput?.name || `${safePackageName(parsed.name)}_${safePackageName(round)}_LETTERS.zip`, blob: packed }); setStatus(`${output.path.split('/').pop()} saved in the ZIP package.`);
  }
  async function removeReviewedDocx(output: Output) {
    if (!window.confirm(`Remove ${output.path.split('/').pop()} from this output package?`)) return;
    const updated = outputs.filter((item) => item.path !== output.path);
    const notes = [...reviewNotes, `REMOVED | ${output.path}`];
    const packed = await buildZip(updated, generationWarnings, generatedDate || currentUsLetterDate(), notes);
    setOutputs(updated); setReviewNotes(notes); setZipOutput({ name: zipOutput?.name || `${safePackageName(parsed.name)}_${safePackageName(round)}_LETTERS.zip`, blob: packed }); setStatus(`${output.path.split('/').pop()} removed from the ZIP package.`);
  }

  function roundTabs() {
    return <nav className="round-selector" aria-label="Letter round">{rounds.map((item, index) => <button key={item} className={item === round ? 'selected' : ''} onClick={() => chooseRound(item)}><span className="round-index">0{index + 1}</span><span className="round-copy"><strong>{item}</strong><small>{item === round ? 'Active reference set' : 'Select round'}</small></span></button>)}</nav>;
  }
  function workflowNav() {
    const step = workflow.indexOf(panel);
    return <nav className="workflow-rail" aria-label="Workflow steps">{workflow.map((item, index) => {
      const disabled = !panelEnabled(item);
      return <button key={item} disabled={disabled} aria-disabled={disabled} className={item === panel ? 'current' : step >= 0 && index < step ? 'complete' : ''} onClick={() => setPanel(item)} title={disabled ? item === 'Generate' ? 'Load source data to unlock Generate.' : 'Generate a package to unlock Outputs.' : ''}><i>{index + 1}</i><span>{item}</span></button>;
    })}</nav>;
  }
  function dashboardView() {
    return <div className="dashboard-grid">
      <section className="panel dashboard-hero"><p className="eyebrow">Operations control center</p><h2>Generate precise bureau letters from verified references.</h2><p>Manage source data, reference documents, detected routes and reviewed output packages in one workspace.</p><div className="dashboard-actions"><button className="action-button" onClick={() => setPanel('Source Data')}>Import Source</button><button className="secondary-button" onClick={() => setPanel('Templates')}>Manage References</button></div></section>
      <section className="panel dashboard-readiness"><div className="panel-heading"><div><h2>Current readiness</h2><p>{round} production checks</p></div><Pill tone={generationReady ? 'success' : 'warning'}>{generationReady ? 'Ready' : 'Setup'}</Pill></div><div className="status-stack"><div><span>Source data</span><Pill tone={sourceReady ? 'success' : 'warning'}>{sourceReady ? 'Loaded' : 'Required'}</Pill></div><div><span>Reference files</span><Pill tone={uploadedReferences === 2 ? 'success' : 'warning'}>{uploadedReferences}/2</Pill></div><div><span>Required outputs</span><strong>{routes.length}</strong></div><div><span>Source warnings</span><strong>{parseWarnings.length}</strong></div></div></section>
      <article className="metric-tile"><small>Client</small><strong>{parsed.name || 'No source loaded'}</strong><span>{sourceReady ? 'Detected from source' : 'Upload TXT to begin'}</span></article><article className="metric-tile"><small>Detected letters</small><strong>{routes.length}</strong><span>{routes.length ? 'Ready for verification' : 'No routes assessed'}</span></article><article className="metric-tile"><small>Saved references</small><strong>{uploadedReferences}<em>/2</em></strong><span>{round}</span></article><article className="metric-tile"><small>Generated DOCX</small><strong>{outputs.length}</strong><span>{zipOutput ? 'Package available' : 'Awaiting generation'}</span></article>
      <section className="panel dashboard-routes"><div className="panel-heading"><div><h2>Detected output plan</h2><p>Bureau-specific documents required from the current source.</p></div>{generationReady && <button className="text-action" onClick={() => setPanel('Generate')}>Open generation →</button>}</div>{routes.length ? <div className="route-list">{routes.map((route) => <div className="route-card" key={`${route.type}-${route.bureau}`}><strong>{route.bureau}</strong><span>{label[route.type]}</span><small>{route.reason}</small></div>)}</div> : <Empty title="No source assessed" text="Import a TXT source file to detect output routes." />}</section>
    </div>;
  }
  function templatesView() {
    return <div className="content-grid">
      <section className="panel"><div className="panel-heading"><div><h2>Completed output references</h2><p>Upload one finished DOCX reference per letter type and per round.</p></div><Pill tone="accent">{round}</Pill></div>{roundTabs()}<div className="documents">{roundSlots.map((slot, index) => <button key={slot.id} className={`document ${slot.id === selected.id ? 'selected' : ''}`} onClick={() => setSelectedId(slot.id)}><i>{index + 1}</i><span><strong>{slot.name}</strong><small>{slot.file || 'Finished output reference DOCX required'}</small></span><Pill tone={slot.file ? 'success' : 'warning'}>{slot.file ? 'Saved' : 'Needed'}</Pill></button>)}</div></section>
      <section className="panel editor-panel"><div className="panel-heading"><div><h2>{selected.name}</h2><p>Reference document for generated output</p></div><Pill tone={selected.file ? 'success' : 'warning'}>{selected.file ? 'Saved' : 'Needed'}</Pill></div>{selected.file ? <div className="saved-file"><strong>{selected.file}</strong><span>{bytes(selected.size)} · DOCX</span><p>Generated output uses this document&apos;s content regions and format.</p></div> : <div className="upload-empty"><p>Upload a completed DOCX showing how this letter type should look.</p></div>}<label className="field-label">Upload or replace DOCX reference<input className="file-input" type="file" accept=".docx" onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadSlot(file); event.target.value = ''; }} /></label>{selected.file && <button className="delete-button" onClick={() => void deleteSlot()}>Delete saved file</button>}<div className="info-card"><strong>{selected.type === 'DISPUTE' ? 'Dispute reference requirement' : 'Late Payment reference requirement'}</strong><p>{selected.type === 'DISPUTE' ? 'Include client, date, bureau, account/item area, inquiry area and signature sections.' : 'Include client, date, bureau, creditor/account and signature sections.'}</p></div></section>
    </div>;
  }
  function sourceView() {
    return <div className="source-workspace">
      <section className="panel source-input-panel"><div className="panel-heading"><div><h2>Source TXT</h2><p>Upload or paste client records. The system identifies eligible bureau letters before generation.</p></div>{source && <Pill tone={parseWarnings.length ? 'warning' : 'success'}>{parseWarnings.length ? `${parseWarnings.length} review` : 'Validated'}</Pill>}</div><div className="source-actions"><label className="field-label">Upload TXT file<input className="file-input" type="file" accept=".txt" onChange={async (event) => { const file = event.target.files?.[0]; if (file) { setSource(await file.text()); resetPackage(); setStatus('Source imported. Verify detected outputs before generating.'); } }} /></label>{!source.trim() && <button className="secondary-button" onClick={() => { setSource(recommendedSourceFormat); resetPackage(); setStatus('Standard TXT format inserted. Replace example values with client data.'); }}>Use standard format</button>}</div><textarea className="source-area" value={source} onChange={(event) => { setSource(event.target.value); resetPackage(); }} placeholder="Paste TXT source here, or select Use standard format to begin…" /></section>
      {sourceReady ? <section className="panel source-results-panel"><div className="panel-heading"><div><h2>Detected letters</h2><p>Confirm the bureau and letter type before continuing.</p></div><Pill tone="accent">{routes.length} output{routes.length === 1 ? '' : 's'}</Pill></div><div className="detection-table">{bureaus.map((bureau) => { const dispute = parsed.dispute[bureau].length; const inquiry = parsed.inquiry[bureau].length; const late = parsed.late[bureau].length; return <div className="detection-row" key={bureau}><strong>{bureau}</strong><span>{dispute || inquiry ? `${dispute} dispute · ${inquiry} inquiry` : 'No dispute data'}</span><span>{late ? `${late} late payment` : 'No late payment'}</span></div>; })}</div>{parseWarnings.length > 0 && <section className="source-review"><strong>Review before generating</strong>{parseWarnings.slice(0, 4).map((warning, index) => <p key={`${warning.message}-${index}`}>{warning.line ? `Line ${warning.line}: ` : ''}{warning.message}</p>)}</section>}<button className="action-button" disabled={!generationReady} onClick={() => setPanel('Generate')}>Review {routes.length} detected letter{routes.length === 1 ? '' : 's'}</button></section> : <section className="panel source-guide"><h2>TXT source standard</h2><p>For reliable detection, label each category and bureau explicitly.</p><div className="guide-steps"><div><strong>1</strong><span>Client identity and address</span></div><div><strong>2</strong><span>Dispute, inquiry or late-payment heading</span></div><div><strong>3</strong><span>Bureau heading before each record</span></div></div><p className="guide-note">Hard inquiries should use: <strong>COMPANY - MM/DD/YYYY</strong></p></section>}
    </div>;
  }
  function generateView() {
    if (!generationReady) return <section className="panel idle-panel"><Empty title="Generation unavailable" text="Load valid source data first, then confirm the detected bureau outputs." /></section>;
    return <div className="generation-workspace">
      <section className="panel generation-overview"><div><p className="eyebrow">Package preparation</p><h2>Prepare {round} delivery</h2><p>Verify which DOCX letters will be generated from the detected bureau data before creating the ZIP package.</p></div><div className="generation-summary"><div><strong>{routes.length}</strong><span>DOCX letters</span></div><div><strong>{activeBureaus.length}</strong><span>Bureaus</span></div><div><strong>{requiredTypes.length}</strong><span>Letter types</span></div></div></section>
      <div className="generation-layout">
        <section className="panel route-production"><div className="panel-heading"><div><h2>Output plan</h2><p>One document will be produced for each item shown below.</p></div><Pill tone="accent">{routes.length} ready</Pill></div><div className="production-rows">{activeBureaus.map((bureau) => <section className="bureau-output" key={bureau}><header><strong>{bureau}</strong><span>{routes.filter((route) => route.bureau === bureau).length} document{routes.filter((route) => route.bureau === bureau).length === 1 ? '' : 's'}</span></header>{routes.filter((route) => route.bureau === bureau).map((route) => <div className="production-row" key={`${route.type}-${route.bureau}`}><div><strong>{label[route.type]}</strong><small>{route.reason}</small></div><Pill tone="success">Create</Pill></div>)}</section>)}</div></section>
        <aside className="panel execution-panel"><div className="panel-heading"><div><h2>Ready to generate</h2><p>Final pre-flight confirmation.</p></div></div><div className="readiness-checks"><div className={sourceReady ? 'checked' : ''}><strong>Source verified</strong><span>{parsed.name || 'Client missing'}</span></div><div className={!missingTypes.length ? 'checked' : 'blocked'}><strong>References available</strong><span>{missingTypes.length ? `Missing ${missingTypes.map((type) => label[type]).join(', ')}` : 'All required layouts uploaded'}</span></div><div className={!parseWarnings.length ? 'checked' : 'review'}><strong>Detection review</strong><span>{parseWarnings.length ? `${parseWarnings.length} source warning(s) to review` : 'No unresolved source warnings'}</span></div></div>{blockers.map((item) => <div className="alert error" key={item}>{item}</div>)}<button className="action-button generate-primary" disabled={loading || (strict && missing.length > 0)} onClick={() => void generate()}>{loading ? 'Rendering DOCX letters…' : `Generate ${routes.length} DOCX Letters ZIP`}</button><p className="generation-note">After generation, review and edit each letter before downloading the package.</p></aside>
      </div>
    </div>;
  }
  function outputsView() { return <OutputReviewWorkspace round={round} outputs={outputs} zipName={zipOutput?.name} warnings={generationWarnings} onZip={() => { if (zipOutput) download(zipOutput.name, zipOutput.blob); }} onDownload={(output) => download(output.path.split('/').pop() || 'letter.docx', output.blob)} onReplace={replaceReviewedDocx} onRemove={removeReviewedDocx} />; }
  function settingsView() { return <section className="panel settings"><div className="panel-heading"><div><h2>Generation rules</h2><p>Completed-reference document processing.</p></div></div><label className="setting"><input type="checkbox" checked={strict} onChange={(event) => setStrict(event.target.checked)} /><span><strong>Block missing required references</strong><small>Use once completed reference documents for required letter types are ready.</small></span></label><div className="info-card"><strong>Generated file naming</strong><p>Each generated DOCX is named as Client Name + Bureau Name.</p></div></section>; }

  return <main className="app-shell"><aside className="sidebar"><div className="brand"><span /><div><strong>LetterGenerator</strong><small>Visual reference output</small></div></div><nav aria-label="Primary navigation">{panels.map((item) => <button key={item} disabled={!panelEnabled(item)} className={item === panel ? 'active' : ''} onClick={() => setPanel(item)}><strong>{item}</strong></button>)}</nav></aside><section className="main-area"><header className="header"><div><p className="eyebrow">{panel === 'Dashboard' ? 'Document operations' : `${round} workflow`}</p><h1>{panel}</h1></div></header>{workflow.includes(panel) && workflowNav()}{panel === 'Dashboard' && dashboardView()}{panel === 'Templates' && templatesView()}{panel === 'Source Data' && sourceView()}{panel === 'Generate' && generateView()}{panel === 'Outputs' && outputsView()}{panel === 'Settings' && settingsView()}<div className="toast activity-status" role="status" aria-live="polite"><strong>Activity</strong><span>{status}</span></div></section></main>;
}
