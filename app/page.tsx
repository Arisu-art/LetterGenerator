'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import JSZip from 'jszip';
import { isDocx, renderDocxTemplate, renderReferenceDisputeDocx, type PlaceholderValues } from '../lib/docx-renderer';
import { bureauInfo, bureaus, detectRoutes, parseSource, type LetterRoute, type LetterType } from '../lib/letter-engine';

type Round = '1st Round' | '2nd Round' | '3rd Round' | 'Final';
type Panel = 'Templates' | 'Source Data' | 'Generate' | 'Outputs' | 'Settings';
type Tone = 'neutral' | 'success' | 'warning' | 'accent';
type TemplateSlot = { id: string; round: Round; type: LetterType; name: string; file: string; size?: number };
type Output = { path: string; type: LetterType; bureau: string; count: number; detail: string; blob: Blob };

const rounds: Round[] = ['1st Round', '2nd Round', '3rd Round', 'Final'];
const panels: Panel[] = ['Templates', 'Source Data', 'Generate', 'Outputs', 'Settings'];
const workflow: Panel[] = ['Templates', 'Source Data', 'Generate', 'Outputs'];
const storageKey = 'lettergenerator.visual-reference-output.v10';
const legacyKeys = ['lettergenerator.reference-accurate-letters.v9', 'lettergenerator.category-letters.v8', 'lettergenerator.reference-canvas.v6', 'lettergenerator.round.library.v5'];
const dbName = 'lettergenerator-private-templates';
const storeName = 'files';
const label: Record<LetterType, string> = { DISPUTE: 'Dispute Letter', LATE_PAYMENT: 'Late Payment Letter' };
const folder: Record<LetterType, string> = { DISPUTE: 'Dispute Letters', LATE_PAYMENT: 'Late Payment Letters' };
const lateTags = ['{{consumer.name}}', '{{consumer.address}}', '{{consumer.dob}}', '{{consumer.ssn}}', '{{today.us_long}}', '{{bureau.name}}', '{{bureau.address}}', '{{late_payments_block}}'].join('\n');

function seedSlots(): TemplateSlot[] {
  return rounds.flatMap((round, i) => {
    const prefix = i ? `r${i + 1}-` : '';
    return [
      { id: `${prefix}dispute-letter`, round, type: 'DISPUTE', name: `${round} Dispute Output Reference`, file: '' },
      { id: `${prefix}late-letter`, round, type: 'LATE_PAYMENT', name: `${round} Late Payment Template`, file: '' }
    ];
  });
}
function mergeSaved(raw: unknown): TemplateSlot[] {
  const slots = seedSlots();
  if (!Array.isArray(raw)) return slots;
  const docs = raw.flatMap((item: { docs?: Array<{ id: string; file?: string; size?: number }> }) => item.docs || []);
  return slots.map((slot) => {
    const current = raw.find((item: TemplateSlot) => item.id === slot.id && typeof item.file === 'string') as TemplateSlot | undefined;
    const old = docs.find((item) => item.id === slot.id);
    return current ? { ...slot, file: current.file, size: current.size } : old ? { ...slot, file: old.file || '', size: old.size } : slot;
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
function safe(value: string) { return (value || 'CLIENT').replace(/[^a-z0-9]+/gi, '_').replace(/^_|_$/g, '').toUpperCase(); }
function longDate(value: string) { return new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${value}T00:00:00Z`)); }
function bytes(value?: number) { return value ? value > 1048576 ? `${(value / 1048576).toFixed(1)} MB` : `${(value / 1024).toFixed(1)} KB` : ''; }
function download(name: string, blob: Blob) { const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = name; a.click(); URL.revokeObjectURL(url); }
function Pill({ children, tone = 'neutral' }: { children: ReactNode; tone?: Tone }) { return <span className={`pill ${tone}`}>{children}</span>; }
function Empty({ title, text }: { title: string; text: string }) { return <div className="empty-state"><div className="empty-icon">+</div><strong>{title}</strong><p>{text}</p></div>; }

export default function Page() {
  const [panel, setPanel] = useState<Panel>('Templates');
  const [slots, setSlots] = useState<TemplateSlot[]>(seedSlots);
  const [round, setRound] = useState<Round>('1st Round');
  const [selectedId, setSelectedId] = useState('dispute-letter');
  const [source, setSource] = useState('');
  const [letterDate, setLetterDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [strict, setStrict] = useState(false);
  const [loading, setLoading] = useState(false);
  const [outputs, setOutputs] = useState<Output[]>([]);
  const [zipOutput, setZipOutput] = useState<{ name: string; blob: Blob } | null>(null);
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState('Upload the finished dispute DOCX as the output reference, then upload the TXT source.');

  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) setSlots(mergeSaved(JSON.parse(saved)));
      else for (const key of legacyKeys) { const prior = localStorage.getItem(key); if (prior) { setSlots(mergeSaved(JSON.parse(prior))); setStatus('Earlier document upload restored. Replace the Dispute slot with your finished reference DOCX.'); break; } }
    } catch { setStatus('Reference library is ready.'); }
    setReady(true);
  }, []);
  useEffect(() => { if (ready) localStorage.setItem(storageKey, JSON.stringify(slots)); }, [ready, slots]);

  const roundSlots = slots.filter((slot) => slot.round === round);
  const selected = roundSlots.find((slot) => slot.id === selectedId) || roundSlots[0];
  const parsed = useMemo(() => parseSource(source), [source]);
  const routes = useMemo(() => detectRoutes(parsed), [parsed]);
  const missing = routes.filter((route) => !roundSlots.find((slot) => slot.type === route.type)?.file);
  const blockers = [!source.trim() ? 'Upload or paste TXT source data.' : '', source.trim() && !parsed.name ? 'Client information could not be read from the TXT file.' : '', source.trim() && !routes.length ? 'No valid dispute, hard-inquiry, or late-payment items were detected.' : ''].filter(Boolean);

  function chooseRound(next: Round) { setRound(next); setSelectedId(slots.find((slot) => slot.round === next)!.id); setOutputs([]); setZipOutput(null); }
  async function uploadSlot(file: File) { if (!isDocx(file.name)) { setStatus('Only DOCX documents are accepted in this slot.'); return; } await putFile(selected.id, file); setSlots((current) => current.map((slot) => slot.id === selected.id ? { ...slot, file: file.name, size: file.size } : slot)); setStatus(selected.type === 'DISPUTE' ? 'Finished dispute reference saved. It will control the generated appearance.' : 'Late Payment template saved.'); }
  async function deleteSlot() { if (!window.confirm(`Delete ${selected.name}?`)) return; await removeFile(selected.id); setSlots((current) => current.map((slot) => slot.id === selected.id ? { ...slot, file: '', size: undefined } : slot)); setStatus(`${selected.name} removed.`); }
  function lateValues(route: LetterRoute): PlaceholderValues { return { 'consumer.name': parsed.name, 'consumer.address': parsed.address.join('\n'), 'consumer.dob': parsed.dob, 'consumer.ssn': parsed.ssn, 'today.us_long': longDate(letterDate), 'bureau.name': bureauInfo[route.bureau].name, 'bureau.address': bureauInfo[route.bureau].address, late_payments_block: route.items.map((item) => item.displayText).join('\n\n'), late_payment_items: route.items.map((item) => ({ display_text: item.displayText })) }; }
  async function generate() {
    if (blockers.length || (strict && missing.length)) { setPanel('Generate'); setStatus('Resolve the generation checks shown on the screen.'); return; }
    setLoading(true); const zip = new JSZip(); const made: Output[] = []; const warnings: string[] = [];
    for (const route of routes) {
      const slot = roundSlots.find((entry) => entry.type === route.type);
      if (!slot?.file) { warnings.push(`${label[route.type]} / ${route.bureau}: DOCX not uploaded.`); continue; }
      const input = await getFile(slot.id);
      if (!input) { warnings.push(`${label[route.type]} / ${route.bureau}: saved DOCX not readable.`); continue; }
      try {
        const blob = route.type === 'DISPUTE'
          ? await renderReferenceDisputeDocx(input, { consumerName: parsed.name, addressLines: parsed.address, dob: parsed.dob, ssn: parsed.ssn, letterDate: longDate(letterDate), bureauName: bureauInfo[route.bureau].name, bureauAddressLines: bureauInfo[route.bureau].address.split('\n'), fraudItems: route.items.map((item) => item.displayText) })
          : await renderDocxTemplate(input, lateValues(route));
        const filename = `${safe(parsed.name)}_${safe(round)}_${route.bureau}_${route.type}_LETTER.docx`;
        const path = `${folder[route.type]}/${filename}`;
        zip.file(path, blob); made.push({ path, type: route.type, bureau: route.bureau, count: route.items.length, detail: route.type === 'DISPUTE' ? 'Finished reference format used' : 'Placeholder rendering used', blob });
      } catch (error) { warnings.push(`${label[route.type]} / ${route.bureau}: ${error instanceof Error ? error.message : 'rendering failed.'}`); }
    }
    zip.file('Generation Manifest.txt', ['LetterGenerator Visual Reference Manifest', `Client: ${parsed.name}`, `Round: ${round}`, `Date: ${longDate(letterDate)}`, '', 'Output Decisions:', ...bureaus.flatMap((bureau) => { const d = parsed.dispute[bureau].length; const i = parsed.inquiry[bureau].length; const l = parsed.late[bureau].length; return [`${d || i ? 'CREATE' : 'SKIP'} | Dispute | ${bureau} | ${d} dispute account(s), ${i} hard inquiry item(s)`, `${l ? 'CREATE' : 'SKIP'} | Late Payment | ${bureau} | ${l} item(s)`]; }), '', 'Created Files:', ...made.map((output) => `- ${output.path}`), ...(warnings.length ? ['', 'Warnings:', ...warnings.map((warning) => `- ${warning}`)] : [])].join('\n'));
    const packed = await zip.generateAsync({ type: 'blob' }); setOutputs(made); setZipOutput({ name: `${safe(parsed.name)}_${safe(round)}_LETTERS.zip`, blob: packed }); setPanel('Outputs'); setLoading(false); setStatus(`${made.length} DOCX letter(s) created. Files are grouped by letter type only, not by bureau folders.`);
  }
  function roundTabs() { return <nav className="stepper" aria-label="Output round">{rounds.map((item, i) => <button key={item} className={item === round ? 'current' : ''} onClick={() => chooseRound(item)}><i>{i + 1}</i><span>{item}</span></button>)}</nav>; }
  function templatesView() { return <div className="content-grid"><section className="panel"><div className="panel-heading"><div><h2>Reference documents</h2><p>For Dispute, upload a finished output DOCX that already looks correct.</p></div><Pill tone="accent">{round}</Pill></div>{roundTabs()}<div className="documents">{roundSlots.map((slot, index) => <button key={slot.id} className={`document ${slot.id === selected.id ? 'selected' : ''}`} onClick={() => setSelectedId(slot.id)}><i>{index + 1}</i><span><strong>{slot.name}</strong><small>{slot.file || (slot.type === 'DISPUTE' ? 'Finished output reference DOCX required' : 'Tagged late-payment DOCX required')}</small></span><Pill tone={slot.file ? 'success' : 'warning'}>{slot.file ? 'Saved' : 'Needed'}</Pill></button>)}</div></section><section className="panel editor-panel"><div className="panel-heading"><div><h2>{selected.name}</h2><p>{selected.type === 'DISPUTE' ? 'Finished document reference mode' : 'Placeholder template mode'}</p></div><Pill tone={selected.file ? 'success' : 'warning'}>{selected.file ? 'Saved' : 'Needed'}</Pill></div>{selected.file ? <div className="saved-file"><strong>{selected.file}</strong><span>{bytes(selected.size)} · DOCX</span><p>{selected.type === 'DISPUTE' ? 'Uses the client, recipient, item and signature positions from this completed document.' : 'Uses tagged fields for replacement.'}</p></div> : <div className="upload-empty"><p>{selected.type === 'DISPUTE' ? 'Upload the completed document reference, such as the correctly finished TransUnion letter.' : 'Upload a tagged late-payment DOCX.'}</p></div>}<label className="field-label">Upload / replace DOCX<input className="file-input" type="file" accept=".docx" onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadSlot(file); event.target.value = ''; }} /></label>{selected.file && <button className="delete-button" onClick={() => void deleteSlot()}>Delete saved file</button>}{selected.type === 'DISPUTE' ? <div className="info-card"><strong>Why this fixes missing fields</strong><p>No placeholder tags are needed for the dispute output reference. The app now replaces the completed document's client block, date, bureau block, fraudulent-items section and signature directly while keeping its styles.</p></div> : <div className="info-card"><strong>Late Payment placeholders</strong><pre style={{ whiteSpace: 'pre-wrap', marginBottom: 0 }}>{lateTags}</pre></div>}</section></div>; }
  function sourceView() { return <div className="content-grid"><section className="panel"><div className="panel-heading"><div><h2>Inspect source</h2><p>Data is detected by bureau before output is created.</p></div></div><label className="field-label">Upload TXT source<input className="file-input" type="file" accept=".txt" onChange={async (event) => { const file = event.target.files?.[0]; if (file) { setSource(await file.text()); setStatus('Source read. Dispute outputs include matching dispute accounts and hard inquiries.'); } }} /></label><label className="field-label">Letter date<input className="file-input" type="date" value={letterDate} onChange={(event) => setLetterDate(event.target.value)} /></label><textarea className="source-area" value={source} onChange={(event) => setSource(event.target.value)} placeholder="Paste TXT source here…" /></section><section className="panel"><div className="panel-heading"><div><h2>Output decision canvas</h2><p>One letter per detected bureau and letter type.</p></div><Pill tone="accent">{round}</Pill></div>{roundTabs()}<div className="route-table">{bureaus.map((bureau) => { const dispute = parsed.dispute[bureau].length + parsed.inquiry[bureau].length; const late = parsed.late[bureau].length; return <div className="bureau" key={bureau}><strong>{bureau}</strong><Pill tone={dispute ? 'success' : 'neutral'}>{dispute ? `Dispute ${dispute}` : 'No Dispute'}</Pill><Pill tone={late ? 'success' : 'neutral'}>{late ? `Late ${late}` : 'No Late'}</Pill></div>; })}</div><div className="pending-list">{routes.length ? routes.map((route) => <span key={`${route.type}-${route.bureau}`}><strong>{label[route.type]} / {route.bureau}</strong> — {route.reason}</span>) : <span>No valid output. NONE and NNONE are ignored.</span>}</div><button className="action-button" onClick={() => setPanel('Generate')}>Continue with {round}</button></section></div>; }
  function generateView() { return <div className="content-grid"><section className="panel"><div className="panel-heading"><div><h2>Generate {round}</h2><p>Uses the finished reference layout for dispute documents.</p></div><Pill tone={routes.length ? 'accent' : 'neutral'}>{routes.length} letters</Pill></div>{routes.length ? <div className="route-list">{routes.map((route) => <div className="route-card" key={`${route.type}-${route.bureau}`}><strong>{route.bureau}</strong><span>{label[route.type]}</span><small>{route.reason}</small></div>)}</div> : <Empty title="No letters required" text="Upload source data first." />}<button className="action-button" disabled={loading} onClick={() => void generate()}>{loading ? 'Rendering DOCX letters…' : 'Generate DOCX Letters ZIP'}</button></section><section className="panel"><div className="panel-heading"><div><h2>Reference output rules</h2><p>Directly matches your supplied final-document structure.</p></div></div><div className="alert success">Dispute client data and fraud items are inserted from TXT into the completed DOCX reference layout.</div><div className="alert success">Dispute letters include dispute-account and hard-inquiry records for the same bureau.</div><div className="alert success">The ZIP contains category folders only; no separate bureau folders.</div>{blockers.map((item) => <div className="alert error" key={item}>{item}</div>)}{missing.length > 0 && <div className="pending-list"><p>Required reference/template not uploaded:</p>{missing.map((route) => <span key={`${route.type}-${route.bureau}`}>{label[route.type]} / {route.bureau}</span>)}</div>}</section></div>; }
  function outputsView() { return <section className="panel outputs"><div className="panel-heading"><div><h2>{round} output package</h2><p>DOCX files in flat category folders.</p></div><Pill tone={zipOutput ? 'success' : 'neutral'}>{outputs.length} DOCX</Pill></div>{zipOutput && <div className="info-card" style={{ marginBottom: 18 }}><strong>{zipOutput.name}</strong><p>Includes generated DOCX files and a manifest.</p><button className="secondary-button" style={{ marginTop: 12 }} onClick={() => download(zipOutput.name, zipOutput.blob)}>Download ZIP Package</button></div>}{outputs.length ? <div className="output-list">{outputs.map((output) => <article className="output" key={output.path}><div><Pill tone="success">Rendered DOCX</Pill><h3>{output.path}</h3><p>{output.count} item block(s) · {output.detail}</p></div></article>)}</div> : <Empty title="No outputs" text="Upload references, source data and generate." />}</section>; }
  function settingsView() { return <section className="panel settings"><div className="panel-heading"><div><h2>Generation rules</h2><p>Completed-reference document processing.</p></div></div><label className="setting"><input type="checkbox" checked={strict} onChange={(event) => setStrict(event.target.checked)} /><span><strong>Block missing required references</strong><small>Use once reference documents for all required letter types are ready.</small></span></label><div className="info-card"><strong>Dispute reference requirements</strong><p>The finished DOCX needs the correct client header, recipient block, the heading FRAUDULENT ACCOUNTS FOR IMMEDIATE BLOCKING AND DELETION, one correctly styled fraud item plus its red legal paragraph, LEGAL DEMAND AND NOTICE OF DUTY, and the signature section.</p></div></section>; }
  const step = workflow.indexOf(panel);
  return <main className="app-shell"><aside className="sidebar"><div className="brand"><span /><div><strong>LetterGenerator</strong><small>Visual reference output</small></div></div><nav aria-label="Primary navigation">{panels.map((item) => <button key={item} className={item === panel ? 'active' : ''} onClick={() => setPanel(item)}><strong>{item}</strong></button>)}</nav></aside><section className="main-area"><header className="header"><div><p className="eyebrow">{round} workflow</p><h1>{panel}</h1></div><button className="header-action" onClick={() => setPanel('Generate')}>Generate</button></header><nav className="stepper" aria-label="Workflow steps">{workflow.map((item, index) => <button key={item} className={item === panel ? 'current' : step >= 0 && index < step ? 'complete' : ''} onClick={() => setPanel(item)}><i>{index + 1}</i><span>{item}</span></button>)}</nav>{panel === 'Templates' && templatesView()}{panel === 'Source Data' && sourceView()}{panel === 'Generate' && generateView()}{panel === 'Outputs' && outputsView()}{panel === 'Settings' && settingsView()}<div className="toast" role="status" aria-live="polite">{status}</div></section></main>;
}
