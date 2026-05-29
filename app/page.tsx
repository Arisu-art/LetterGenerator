'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import JSZip from 'jszip';
import { isDocx, renderDocxTemplate, type PlaceholderValues } from '../lib/docx-renderer';

type Bureau = 'TRANSUNION' | 'EQUIFAX' | 'EXPERIAN';
type Round = '1st Round' | '2nd Round' | '3rd Round' | 'Final';
type LetterType = 'DISPUTE' | 'LATE_PAYMENT';
type Panel = 'Templates' | 'Source Data' | 'Generate' | 'Outputs' | 'Settings';
type Tone = 'neutral' | 'success' | 'warning' | 'accent';
type Template = { id: string; round: Round; type: LetterType; name: string; file: string; size?: number };
type Parsed = { name: string; address: string[]; dob: string; ssn: string; dispute: Record<Bureau, string[]>; late: Record<Bureau, string[]> };
type Route = { bureau: Bureau; type: LetterType; lines: string[]; reason: string };
type Output = { path: string; type: LetterType; bureau: Bureau; count: number; blob: Blob };

const rounds: Round[] = ['1st Round', '2nd Round', '3rd Round', 'Final'];
const bureaus: Bureau[] = ['TRANSUNION', 'EQUIFAX', 'EXPERIAN'];
const panels: Panel[] = ['Templates', 'Source Data', 'Generate', 'Outputs', 'Settings'];
const workflow: Panel[] = ['Templates', 'Source Data', 'Generate', 'Outputs'];
const storageKey = 'lettergenerator.category-letters.v8';
const oldKeys = ['lettergenerator.reference-canvas.v6', 'lettergenerator.round.library.v5', 'lettergenerator.round.library.v4', 'lettergenerator.round.library.v3', 'lettergenerator.first-round.library.v2'];
const databaseName = 'lettergenerator-private-templates';
const storeName = 'files';
const labels: Record<LetterType, string> = { DISPUTE: 'Dispute Letter', LATE_PAYMENT: 'Late Payment Letter' };
const folders: Record<LetterType, string> = { DISPUTE: 'Dispute Letters', LATE_PAYMENT: 'Late Payment Letters' };
const bureauInfo: Record<Bureau, { name: string; address: string }> = {
  TRANSUNION: { name: 'TransUnion LLC', address: 'P.O. Box 2000\nChester, PA 19016-2000' },
  EQUIFAX: { name: 'Equifax Information Services LLC', address: 'PO Box 105139\nAtlanta, GA 30348' },
  EXPERIAN: { name: 'Experian', address: 'PO Box 4500\nAllen, TX 75013' }
};
const placeholderGuide = [
  '{{consumer.name}}', '{{consumer.address}}', '{{consumer.dob}}', '{{consumer.ssn}}', '{{today.us_long}}',
  '{{bureau.name}}', '{{bureau.address}}', '{{accounts_block}}', '{{late_payments_block}}'
].join('\n');

function seedTemplates(): Template[] {
  return rounds.flatMap((round, index) => {
    const prefix = index === 0 ? '' : `r${index + 1}-`;
    return [
      { id: `${prefix}dispute-letter`, round, type: 'DISPUTE', name: `${round} Dispute Letter`, file: '' },
      { id: `${prefix}late-letter`, round, type: 'LATE_PAYMENT', name: `${round} Late Payment Letter`, file: '' }
    ];
  });
}
function bureauMap(): Record<Bureau, string[]> { return { TRANSUNION: [], EQUIFAX: [], EXPERIAN: [] }; }
function normal(value: string) { return value.replace(/:$/, '').replace(/\s+/g, ' ').trim().toUpperCase(); }
function bureauOf(value: string): Bureau | '' {
  const key = normal(value);
  if (key === 'TRANSUNION' || key === 'TRANS UNION' || key === 'TU') return 'TRANSUNION';
  if (key === 'EQUIFAX' || key === 'EQ') return 'EQUIFAX';
  if (key === 'EXPERIAN' || key === 'EXP') return 'EXPERIAN';
  return '';
}
function sectionOf(value: string): 'dispute' | 'late' | 'ignore' | '' {
  const key = normal(value);
  // The source uses headings such as "FOR DISPUTE ACCOUNT". It must be recognized before routing.
  if (/^(FOR\s+)?DISPUTE(\s+(ACCOUNT|ACCOUNTS|ITEM|ITEMS|LETTER|LETTERS))?S?$/.test(key)) return 'dispute';
  if (/^LATE\s*PAYMENTS?(\s+(ACCOUNT|ACCOUNTS|ITEM|ITEMS|LETTER|LETTERS))?S?$/.test(key)) return 'late';
  if (/^HARD\s*(INQ|INQUIRY|INQUIRIES)/.test(key) || /^OPEN\s+ACCOUNT/.test(key)) return 'ignore';
  return '';
}
function isNoData(value: string) {
  return /^(N+ONE|NONE|NO\s+(ACCOUNT|ACCOUNTS|ITEM|ITEMS|LATE\s+PAYMENTS?)|N\/?A|NOTHING)$/i.test(normal(value));
}
function valid(lines: string[]) { return lines.filter((line) => line.trim() && !isNoData(line)); }
function parseSource(text: string): Parsed {
  const result: Parsed = { name: '', address: [], dob: '', ssn: '', dispute: bureauMap(), late: bureauMap() };
  const header: string[] = [];
  let section: 'header' | 'dispute' | 'late' | 'ignore' = 'header';
  let bureau: Bureau | '' = '';
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const nextSection = sectionOf(line);
    if (nextSection) { section = nextSection; bureau = ''; continue; }
    const nextBureau = bureauOf(line);
    if (nextBureau) { bureau = nextBureau; continue; }
    if (section === 'header') header.push(line);
    if (section === 'dispute' && bureau) result.dispute[bureau].push(line);
    if (section === 'late' && bureau) result.late[bureau].push(line);
  }
  result.name = header[0] || '';
  result.dob = (header.find((item) => /^DOB:/i.test(item)) || '').replace(/^DOB:\s*/i, '');
  result.ssn = (header.find((item) => /^SSN:/i.test(item)) || '').replace(/^SSN:\s*/i, '');
  result.address = header.slice(1).filter((item) => !/^(DOB|SSN):/i.test(item));
  return result;
}
function detectedRoutes(parsed: Parsed): Route[] {
  return bureaus.flatMap((bureau) => {
    const dispute = valid(parsed.dispute[bureau]);
    const late = valid(parsed.late[bureau]);
    const routes: Route[] = [];
    if (dispute.length) routes.push({ bureau, type: 'DISPUTE', lines: dispute, reason: 'Valid data found under the dispute section.' });
    if (late.length) routes.push({ bureau, type: 'LATE_PAYMENT', lines: late, reason: 'Valid data found under the late-payment section.' });
    return routes;
  });
}
function migrateTemplates(saved: unknown): Template[] {
  const seed = seedTemplates();
  if (!Array.isArray(saved)) return seed;
  const legacyDocs = saved.flatMap((item: { docs?: Array<{ id: string; file?: string; size?: number }> }) => item.docs || []);
  return seed.map((slot) => {
    const direct = saved.find((item: Template) => item.id === slot.id && typeof item.file === 'string') as Template | undefined;
    const doc = legacyDocs.find((item) => item.id === slot.id);
    return direct ? { ...slot, file: direct.file, size: direct.size } : doc ? { ...slot, file: doc.file || '', size: doc.size } : slot;
  });
}
function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1);
    request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains(storeName)) request.result.createObjectStore(storeName); };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
async function storeFile(id: string, file: File) {
  const db = await openDatabase();
  await new Promise<void>((resolve, reject) => { const tx = db.transaction(storeName, 'readwrite'); tx.objectStore(storeName).put(file, id); tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); });
  db.close();
}
async function readFile(id: string): Promise<File | null> {
  const db = await openDatabase();
  const file = await new Promise<File | null>((resolve, reject) => { const request = db.transaction(storeName, 'readonly').objectStore(storeName).get(id); request.onsuccess = () => resolve((request.result as File) || null); request.onerror = () => reject(request.error); });
  db.close();
  return file;
}
async function removeFile(id: string) {
  const db = await openDatabase();
  await new Promise<void>((resolve, reject) => { const tx = db.transaction(storeName, 'readwrite'); tx.objectStore(storeName).delete(id); tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); });
  db.close();
}
function clean(value: string) { return (value || 'CLIENT').replace(/[^a-z0-9]+/gi, '_').replace(/^_|_$/g, '').toUpperCase(); }
function displayDate(value: string) { return new Intl.DateTimeFormat('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' }).format(new Date(`${value}T00:00:00Z`)); }
function bytes(value?: number) { return value ? value >= 1048576 ? `${(value / 1048576).toFixed(1)} MB` : `${(value / 1024).toFixed(1)} KB` : ''; }
function download(name: string, blob: Blob) { const url = URL.createObjectURL(blob); const link = window.document.createElement('a'); link.href = url; link.download = name; link.click(); URL.revokeObjectURL(url); }
function Pill({ children, tone = 'neutral' }: { children: ReactNode; tone?: Tone }) { return <span className={`pill ${tone}`}>{children}</span>; }
function Empty({ title, text }: { title: string; text: string }) { return <div className="empty-state"><div className="empty-icon">+</div><strong>{title}</strong><p>{text}</p></div>; }

export default function Page() {
  const [panel, setPanel] = useState<Panel>('Templates');
  const [templates, setTemplates] = useState<Template[]>(seedTemplates);
  const [round, setRound] = useState<Round>('1st Round');
  const [selectedId, setSelectedId] = useState('dispute-letter');
  const [source, setSource] = useState('');
  const [letterDate, setLetterDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [strict, setStrict] = useState(false);
  const [loading, setLoading] = useState(false);
  const [outputs, setOutputs] = useState<Output[]>([]);
  const [zipOutput, setZipOutput] = useState<{ name: string; blob: Blob } | null>(null);
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState('Upload DOCX templates, then import the source file.');

  useEffect(() => {
    try {
      const current = window.localStorage.getItem(storageKey);
      if (current) setTemplates(migrateTemplates(JSON.parse(current)));
      else {
        for (const key of oldKeys) {
          const prior = window.localStorage.getItem(key);
          if (prior) { setTemplates(migrateTemplates(JSON.parse(prior))); setStatus('Existing saved letter templates restored.'); break; }
        }
      }
    } catch { setStatus('Template library ready for upload.'); }
    setReady(true);
  }, []);
  useEffect(() => { if (ready) window.localStorage.setItem(storageKey, JSON.stringify(templates)); }, [ready, templates]);

  const roundTemplates = templates.filter((item) => item.round === round);
  const selected = roundTemplates.find((item) => item.id === selectedId) || roundTemplates[0];
  const parsed = useMemo(() => parseSource(source), [source]);
  const routes = useMemo(() => detectedRoutes(parsed), [parsed]);
  const missing = routes.filter((route) => !roundTemplates.find((item) => item.type === route.type)?.file);
  const blockers = [
    !source.trim() ? 'Upload or paste TXT source data.' : '',
    source.trim() && !parsed.name ? 'Consumer name was not detected.' : '',
    source.trim() && !routes.length ? 'No valid dispute or late-payment section data was detected per bureau.' : ''
  ].filter(Boolean);

  function selectRound(next: Round) { setRound(next); const initial = templates.find((item) => item.round === next)!; setSelectedId(initial.id); setOutputs([]); setZipOutput(null); }
  async function uploadTemplate(file: File) {
    if (!isDocx(file.name)) { setStatus('Letter template must be a .docx file.'); return; }
    await storeFile(selected.id, file);
    setTemplates((items) => items.map((item) => item.id === selected.id ? { ...item, file: file.name, size: file.size } : item));
    setStatus(`${selected.name} saved. It remains until replaced or deleted.`);
  }
  async function deleteTemplate() {
    if (!window.confirm(`Delete ${selected.name}?`)) return;
    await removeFile(selected.id);
    setTemplates((items) => items.map((item) => item.id === selected.id ? { ...item, file: '', size: undefined } : item));
    setStatus(`${selected.name} deleted.`);
  }
  function values(route: Route): PlaceholderValues {
    const block = route.lines.join('\n');
    return {
      'consumer.name': parsed.name, 'consumer.address': parsed.address.join('\n'), 'consumer.dob': parsed.dob, 'consumer.ssn': parsed.ssn,
      'today.us_long': displayDate(letterDate), 'bureau.name': bureauInfo[route.bureau].name, 'bureau.address': bureauInfo[route.bureau].address,
      accounts_block: route.type === 'DISPUTE' ? block : '', late_payments_block: route.type === 'LATE_PAYMENT' ? block : '',
      items: route.lines.map((description) => ({ description }))
    };
  }
  async function generate() {
    if (blockers.length || (strict && missing.length)) { setPanel('Generate'); setStatus('Resolve the checks before generation.'); return; }
    setLoading(true);
    const zip = new JSZip(); const created: Output[] = []; const warnings: string[] = [];
    for (const route of routes) {
      const slot = roundTemplates.find((item) => item.type === route.type);
      if (!slot?.file) { warnings.push(`${labels[route.type]} / ${route.bureau}: upload the DOCX template first.`); continue; }
      const file = await readFile(slot.id);
      if (!file) { warnings.push(`${labels[route.type]} / ${route.bureau}: the stored template cannot be read.`); continue; }
      try {
        const rendered = await renderDocxTemplate(file, values(route));
        const filename = `${clean(parsed.name)}_${clean(round)}_${route.bureau}_${route.type}_LETTER.docx`;
        const path = `${folders[route.type]}/${route.bureau}/${filename}`;
        zip.file(path, rendered);
        created.push({ path, type: route.type, bureau: route.bureau, count: route.lines.length, blob: rendered });
      } catch { warnings.push(`${labels[route.type]} / ${route.bureau}: fix the DOCX placeholder tags.`); }
    }
    zip.file('Generation Manifest.txt', [
      'LetterGenerator Manifest', `Consumer: ${parsed.name}`, `Round: ${round}`, `Letter date: ${displayDate(letterDate)}`, '', 'Inspected decisions:',
      ...bureaus.flatMap((bureau) => {
        const dispute = valid(parsed.dispute[bureau]).length; const late = valid(parsed.late[bureau]).length;
        return [`${dispute ? 'CREATE' : 'SKIP'} | Dispute Letter | ${bureau} | ${dispute} data line(s)`, `${late ? 'CREATE' : 'SKIP'} | Late Payment Letter | ${bureau} | ${late} data line(s)`];
      }), '', 'Created DOCX files:', ...created.map((file) => `- ${file.path}`), ...(warnings.length ? ['', 'Warnings:', ...warnings.map((warning) => `- ${warning}`)] : [])
    ].join('\n'));
    const blob = await zip.generateAsync({ type: 'blob' });
    setOutputs(created); setZipOutput({ name: `${clean(parsed.name)}_${clean(round)}_LETTERS.zip`, blob }); setPanel('Outputs'); setLoading(false);
    setStatus(`${created.length} DOCX letter(s) created. Only detected dispute or late-payment sections were used.`);
  }
  function roundTabs() { return <nav className="stepper" aria-label="Output round">{rounds.map((item, index) => <button key={item} className={item === round ? 'current' : ''} onClick={() => selectRound(item)}><i>{index + 1}</i><span>{item}</span></button>)}</nav>; }
  function templatesView() { return <div className="content-grid"><section className="panel"><div className="panel-heading"><div><h2>DOCX letter templates</h2><p>Upload a separate dispute and late-payment template for each round.</p></div><Pill tone="accent">{round}</Pill></div>{roundTabs()}<div className="documents">{roundTemplates.map((item, index) => <button key={item.id} className={`document ${item.id === selected.id ? 'selected' : ''}`} onClick={() => setSelectedId(item.id)}><i>{index + 1}</i><span><strong>{item.name}</strong><small>{item.file || 'DOCX not uploaded'}</small></span><Pill tone={item.file ? 'success' : 'warning'}>{item.file ? 'Saved' : 'Needed'}</Pill></button>)}</div></section><section className="panel editor-panel"><div className="panel-heading"><div><h2>{selected.name}</h2><p>DOCX template</p></div><Pill tone={selected.file ? 'success' : 'warning'}>{selected.file ? 'Saved' : 'Needed'}</Pill></div>{selected.file ? <div className="saved-file"><strong>{selected.file}</strong><span>{bytes(selected.size)} · .docx</span><p>Saved until explicitly replaced or deleted.</p></div> : <div className="upload-empty"><p>Upload a DOCX with approved placeholders.</p></div>}<label className="field-label">Upload / replace DOCX<input className="file-input" type="file" accept=".docx" onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadTemplate(file); event.target.value = ''; }} /></label>{selected.file && <button className="delete-button" onClick={() => void deleteTemplate()}>Delete saved file</button>}<div className="info-card"><strong>Supported placeholders</strong><pre style={{ whiteSpace: 'pre-wrap', marginBottom: 0 }}>{placeholderGuide}</pre></div></section></div>; }
  function sourceView() { return <div className="content-grid"><section className="panel"><div className="panel-heading"><div><h2>Inspect source</h2><p>Section detection occurs before letter generation.</p></div></div><label className="field-label">Upload TXT source<input className="file-input" type="file" accept=".txt" onChange={async (event) => { const file = event.target.files?.[0]; if (file) { setSource(await file.text()); setStatus('Source parsed. For Dispute Account is routed as dispute data.'); } }} /></label><label className="field-label">Letter date<input className="file-input" type="date" value={letterDate} onChange={(event) => setLetterDate(event.target.value)} /></label><textarea className="source-area" value={source} onChange={(event) => setSource(event.target.value)} placeholder="Paste TXT source here…" /></section><section className="panel"><div className="panel-heading"><div><h2>Detected letters</h2><p>Green categories will generate one DOCX for that bureau.</p></div><Pill tone="accent">{round}</Pill></div>{roundTabs()}<div className="route-table">{bureaus.map((bureau) => { const dispute = valid(parsed.dispute[bureau]); const late = valid(parsed.late[bureau]); return <div className="bureau" key={bureau}><strong>{bureau}</strong><Pill tone={dispute.length ? 'success' : 'neutral'}>{dispute.length ? 'Dispute' : 'No Dispute'}</Pill><Pill tone={late.length ? 'success' : 'neutral'}>{late.length ? 'Late Payment' : 'No Late'}</Pill></div>; })}</div><div className="pending-list">{routes.length ? routes.map((route) => <span key={`${route.type}-${route.bureau}`}><strong>{labels[route.type]} / {route.bureau}</strong> — {route.reason}</span>) : <span>No valid dispute or late-payment data. NONE and NNONE are ignored.</span>}</div><button className="action-button" onClick={() => setPanel('Generate')}>Continue with {round}</button></section></div>; }
  function generateView() { return <div className="content-grid"><section className="panel"><div className="panel-heading"><div><h2>Generate {round}</h2><p>One DOCX letter per detected bureau/category pair.</p></div><Pill tone={routes.length ? 'accent' : 'neutral'}>{routes.length} letter{routes.length === 1 ? '' : 's'}</Pill></div>{routes.length ? <div className="route-list">{routes.map((route) => <div className="route-card" key={`${route.type}-${route.bureau}`}><strong>{route.bureau}</strong><span>{labels[route.type]}</span><small>{route.reason}</small></div>)}</div> : <Empty title="No letters required" text="Upload source data containing dispute or late-payment records." />}<button className="action-button" disabled={loading} onClick={() => void generate()}>{loading ? 'Rendering DOCX letters…' : 'Generate DOCX Letters ZIP'}</button></section><section className="panel"><div className="panel-heading"><div><h2>Validation</h2><p>Why letters will or will not generate.</p></div></div><div className="alert success"><strong>Dispute:</strong> A dispute letter is created only from a recognized dispute section such as FOR DISPUTE ACCOUNT.</div><div className="alert success"><strong>Late payment:</strong> A late-payment letter is created only from a LATE PAYMENT section.</div>{blockers.map((error) => <div className="alert error" key={error}>{error}</div>)}{missing.length > 0 && <div className="pending-list"><p>DOCX template missing for detected output:</p>{missing.map((route) => <span key={`${route.type}-${route.bureau}`}>{labels[route.type]} / {route.bureau}</span>)}</div>}</section></div>; }
  function outputsView() { return <section className="panel outputs"><div className="panel-heading"><div><h2>{round} letters ZIP</h2><p>DOCX files grouped by letter type and bureau.</p></div><Pill tone={zipOutput ? 'success' : 'neutral'}>{outputs.length} DOCX</Pill></div>{zipOutput && <div className="info-card" style={{ marginBottom: 18 }}><strong>{zipOutput.name}</strong><p>Contains generated letters plus a manifest of created and skipped routes.</p><button className="secondary-button" style={{ marginTop: 12 }} onClick={() => download(zipOutput.name, zipOutput.blob)}>Download ZIP Package</button></div>}{outputs.length ? <div className="output-list">{outputs.map((file) => <article className="output" key={file.path}><div><Pill tone="success">Rendered DOCX</Pill><h3>{file.path}</h3><p>{file.count} source line(s) inserted.</p></div></article>)}</div> : <Empty title="No DOCX output" text="Upload templates, inspect source data, and generate." />}</section>; }
  function settingsView() { return <section className="panel settings"><div className="panel-heading"><div><h2>Generation rules</h2><p>Current category-based letter workflow.</p></div></div><label className="setting"><input type="checkbox" checked={strict} onChange={(event) => setStrict(event.target.checked)} /><span><strong>Block when a matching DOCX template is missing</strong><small>Recommended when you are ready for final production generation.</small></span></label><div className="info-card"><strong>Folders in ZIP</strong><p>Dispute Letters / Bureau / DOCX<br />Late Payment Letters / Bureau / DOCX</p></div></section>; }
  const step = workflow.indexOf(panel);
  return <main className="app-shell"><aside className="sidebar"><div className="brand"><span /><div><strong>LetterGenerator</strong><small>Category letters</small></div></div><nav aria-label="Primary navigation">{panels.map((item) => <button key={item} className={item === panel ? 'active' : ''} onClick={() => setPanel(item)}><strong>{item}</strong></button>)}</nav></aside><section className="main-area"><header className="header"><div><p className="eyebrow">{round} workflow</p><h1>{panel}</h1></div><button className="header-action" onClick={() => setPanel('Generate')}>Generate</button></header><nav className="stepper" aria-label="Workflow steps">{workflow.map((item, index) => <button key={item} className={item === panel ? 'current' : step >= 0 && index < step ? 'complete' : ''} onClick={() => setPanel(item)}><i>{index + 1}</i><span>{item}</span></button>)}</nav>{panel === 'Templates' && templatesView()}{panel === 'Source Data' && sourceView()}{panel === 'Generate' && generateView()}{panel === 'Outputs' && outputsView()}{panel === 'Settings' && settingsView()}<div className="toast" role="status" aria-live="polite">{status}</div></section></main>;
}
