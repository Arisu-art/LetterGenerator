'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import JSZip from 'jszip';
import { isDocx, renderDocxTemplate, type PlaceholderValues } from '../lib/docx-renderer';

type Bureau = 'TRANSUNION' | 'EQUIFAX' | 'EXPERIAN';
type Round = '1st Round' | '2nd Round' | '3rd Round' | 'Final';
type Panel = 'Templates' | 'Source Data' | 'Generate' | 'Outputs' | 'Settings';
type Kind = 'FOR_DISPUTE' | 'LATE_PAYMENT';
type Tone = 'neutral' | 'success' | 'warning' | 'accent';
type Doc = { id: string; name: string; file: string; fileType?: string; extension?: string; size?: number; placeholders: boolean; fields: string };
type Packet = { id: string; round: Round; kind: Kind; name: string; description: string; docs: Doc[] };
type Parsed = { name: string; address: string[]; dob: string; ssn: string; dispute: Record<Bureau, string[]>; late: Record<Bureau, string[]>; inquiry: Record<Bureau, string[]> };
type Route = { bureau: Bureau; kind: Kind; records: string[]; disputeRecords: string[]; inquiryRecords: string[]; reason: string };
type Output = { id: string; path: string; name: string; document: string; bureau: Bureau; kind: Kind; rendered: boolean; detail: string; blob: Blob };

const rounds: Round[] = ['1st Round', '2nd Round', '3rd Round', 'Final'];
const bureaus: Bureau[] = ['TRANSUNION', 'EQUIFAX', 'EXPERIAN'];
const panels: { id: Panel; title: string; subtitle: string }[] = [
  { id: 'Templates', title: 'Templates', subtitle: 'Document library' },
  { id: 'Source Data', title: 'Source Data', subtitle: 'Detection canvas' },
  { id: 'Generate', title: 'Generate', subtitle: 'Package output' },
  { id: 'Outputs', title: 'Outputs', subtitle: 'Download ZIP' },
  { id: 'Settings', title: 'Settings', subtitle: 'Rules' }
];
const workflow: Panel[] = ['Templates', 'Source Data', 'Generate', 'Outputs'];
const storageKey = 'lettergenerator.reference-canvas.v6';
const legacyKeys = ['lettergenerator.round.library.v5', 'lettergenerator.round.library.v4', 'lettergenerator.round.library.v3', 'lettergenerator.first-round.library.v2'];
const dbName = 'lettergenerator-private-templates';
const storeName = 'files';
const tags = [
  '{{consumer.name}}', '{{consumer.address}}', '{{consumer.dob}}', '{{consumer.ssn}}', '{{today.us_long}}',
  '{{bureau.name}}', '{{bureau.address}}', '{{accounts_block}}', '{{inquiries_block}}',
  '{{#fraud_items}} ... {{description}} ... {{/fraud_items}}'
].join('\n');
const bureauInfo: Record<Bureau, { name: string; address: string }> = {
  TRANSUNION: { name: 'TransUnion LLC Consumer Dispute Center', address: 'PO Box 2000\nChester, PA 19016' },
  EQUIFAX: { name: 'Equifax Information Services LLC', address: 'PO Box 105139\nAtlanta, GA 30348' },
  EXPERIAN: { name: 'Experian', address: 'PO Box 4500\nAllen, TX 75013' }
};
const category: Record<Kind, { label: string; folder: string }> = {
  FOR_DISPUTE: { label: 'For Dispute', folder: 'For Dispute' },
  LATE_PAYMENT: { label: 'Late Payment', folder: 'Late Payment' }
};

function disputeDocs(prefix: string): Doc[] { return [
  { id: `${prefix}-letter`, name: 'Letter for Dispute', file: '', placeholders: true, fields: tags },
  { id: `${prefix}-support`, name: 'Supporting Documents', file: '', placeholders: true, fields: '{{consumer.name}}\n{{consumer.address}}\n{{today.us_long}}' },
  { id: `${prefix}-fcra`, name: 'FCRA', file: '', placeholders: true, fields: '{{consumer.name}}\n{{today.us_long}}' },
  { id: `${prefix}-affidavit`, name: 'Affidavit', file: '', placeholders: true, fields: tags },
  { id: `${prefix}-attachment`, name: 'Attachment', file: '', placeholders: false, fields: '' },
  { id: `${prefix}-ftc`, name: 'FTC', file: '', placeholders: true, fields: tags }
]; }
function lateDocs(prefix: string): Doc[] { return [
  { id: `${prefix}-letter`, name: 'Late Payment Letter', file: '', placeholders: true, fields: tags },
  { id: `${prefix}-support`, name: 'Supporting Documents', file: '', placeholders: true, fields: '{{consumer.name}}\n{{consumer.address}}\n{{today.us_long}}' }
]; }
function seedLibrary(): Packet[] { return rounds.flatMap((round, index) => {
  const prefix = index === 0 ? '' : `r${index + 1}-`;
  return [
    { id: `${index + 1}-dispute`, round, kind: 'FOR_DISPUTE', name: `${round} For Dispute Packet`, description: 'Dispute accounts and hard inquiries combined per bureau', docs: disputeDocs(`${prefix}dispute`) },
    { id: `${index + 1}-late`, round, kind: 'LATE_PAYMENT', name: `${round} Late Payment Packet`, description: 'Late-payment letter and supporting documents', docs: lateDocs(`${prefix}late`) }
  ];
}); }
function mergeSaved(seed: Packet[], stored: Packet[]) { return seed.map((packet) => {
  const priorKind = packet.kind === 'FOR_DISPUTE' ? ['FOR_DISPUTE', 'DISPUTE'] : ['LATE_PAYMENT'];
  const saved = stored.find((item) => item.round === packet.round && priorKind.includes(item.kind as string)) || (packet.round === '1st Round' ? stored.find((item) => priorKind.includes(item.kind as string)) : undefined);
  if (!saved) return packet;
  return { ...packet, docs: packet.docs.map((doc) => ({ ...doc, ...(saved.docs?.find((old) => old.id === doc.id) || {}) })) };
}); }
function openDb(): Promise<IDBDatabase> { return new Promise((resolve, reject) => { const request = indexedDB.open(dbName, 1); request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains(storeName)) request.result.createObjectStore(storeName); }; request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); }); }
async function storeFile(id: string, file: File) { const db = await openDb(); await new Promise<void>((resolve, reject) => { const tx = db.transaction(storeName, 'readwrite'); tx.objectStore(storeName).put(file, id); tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); }); db.close(); }
async function getFile(id: string) { const db = await openDb(); const file = await new Promise<File | null>((resolve, reject) => { const request = db.transaction(storeName, 'readonly').objectStore(storeName).get(id); request.onsuccess = () => resolve((request.result as File) || null); request.onerror = () => reject(request.error); }); db.close(); return file; }
async function eraseFile(id: string) { const db = await openDb(); await new Promise<void>((resolve, reject) => { const tx = db.transaction(storeName, 'readwrite'); tx.objectStore(storeName).delete(id); tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); }); db.close(); }
function map(): Record<Bureau, string[]> { return { TRANSUNION: [], EQUIFAX: [], EXPERIAN: [] }; }
function isEmptyRecord(line: string) { return /^(N+ONE|NONE|NO\s+(ACCOUNT|ACCOUNTS|ITEM|ITEMS)|N\/?A|NOTHING)$/i.test(line.replace(/\s+/g, ' ').trim()); }
function valid(lines: string[]) { return lines.filter((line) => line.trim() && !isEmptyRecord(line)); }
function parseSource(text: string): Parsed {
  const result: Parsed = { name: '', address: [], dob: '', ssn: '', dispute: map(), late: map(), inquiry: map() };
  const header: string[] = []; let section: 'header' | 'dispute' | 'late' | 'inquiry' | 'skip' = 'header'; let bureau: Bureau | '' = '';
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim(); if (!line) continue; const key = line.replace(/:$/, '').toUpperCase();
    if (key.startsWith('DISPUTE')) { section = 'dispute'; bureau = ''; continue; }
    if (key.startsWith('LATE')) { section = 'late'; bureau = ''; continue; }
    if (key.startsWith('HARD')) { section = 'inquiry'; bureau = ''; continue; }
    if (key.startsWith('OPEN') || key.startsWith('PHONE') || key.startsWith('EMAIL')) { if (section === 'header') section = 'skip'; continue; }
    const found: Bureau | '' = key === 'TRANSUNION' || key === 'TRANS UNION' || key === 'TU' ? 'TRANSUNION' : key === 'EQUIFAX' || key === 'EQ' ? 'EQUIFAX' : key === 'EXPERIAN' || key === 'EXP' ? 'EXPERIAN' : '';
    if (found) { bureau = found; continue; }
    if (section === 'header') header.push(line);
    if (section === 'dispute' && bureau) result.dispute[bureau].push(line);
    if (section === 'late' && bureau) result.late[bureau].push(line);
    if (section === 'inquiry' && bureau) result.inquiry[bureau].push(line);
  }
  result.name = header[0] || '';
  result.dob = (header.find((line) => /^DOB:/i.test(line)) || '').replace(/^DOB:\s*/i, '');
  result.ssn = (header.find((line) => /^SSN:/i.test(line)) || '').replace(/^SSN:\s*/i, '');
  result.address = header.slice(1).filter((line) => !/^(DOB|SSN):/i.test(line));
  return result;
}
function outputRoutes(parsed: Parsed): Route[] { return bureaus.flatMap((bureau) => {
  const disputes = valid(parsed.dispute[bureau]);
  const inquiries = valid(parsed.inquiry[bureau]);
  const late = valid(parsed.late[bureau]);
  const routes: Route[] = [];
  if (disputes.length || inquiries.length) routes.push({ bureau, kind: 'FOR_DISPUTE', records: [...disputes, ...inquiries], disputeRecords: disputes, inquiryRecords: inquiries, reason: disputes.length && inquiries.length ? 'Dispute account and hard inquiry data detected.' : disputes.length ? 'Dispute account data detected.' : 'Hard inquiry data detected; reference output places it in the dispute letter.' });
  if (late.length) routes.push({ bureau, kind: 'LATE_PAYMENT', records: late, disputeRecords: [], inquiryRecords: [], reason: 'Late-payment data detected.' });
  return routes;
}); }
function ext(name: string) { return name.match(/(\.[a-z0-9]+)$/i)?.[1] || ''; }
function clean(value: string) { return (value || 'CLIENT').replace(/[^a-z0-9]+/gi, '_').replace(/^_|_$/g, '').toUpperCase(); }
function bytes(size?: number) { return size ? size >= 1048576 ? `${(size / 1048576).toFixed(1)} MB` : `${(size / 1024).toFixed(1)} KB` : ''; }
function displayDate(value: string) { return new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${value}T00:00:00Z`)); }
function save(name: string, blob: Blob) { const url = URL.createObjectURL(blob); const link = window.document.createElement('a'); link.href = url; link.download = name; link.click(); URL.revokeObjectURL(url); }
function Pill({ children, tone = 'neutral' }: { children: ReactNode; tone?: Tone }) { return <span className={`pill ${tone}`}>{children}</span>; }
function Empty({ title, text }: { title: string; text: string }) { return <div className="empty-state"><div className="empty-icon">+</div><strong>{title}</strong><p>{text}</p></div>; }

export default function Page() {
  const [panel, setPanel] = useState<Panel>('Templates');
  const [library, setLibrary] = useState<Packet[]>(seedLibrary);
  const [round, setRound] = useState<Round>('1st Round');
  const [packetId, setPacketId] = useState('1-dispute');
  const [docId, setDocId] = useState('dispute-letter');
  const [source, setSource] = useState('');
  const [letterDate, setLetterDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [outputs, setOutputs] = useState<Output[]>([]);
  const [zipOutput, setZipOutput] = useState<{ name: string; blob: Blob } | null>(null);
  const [strict, setStrict] = useState(false);
  const [loading, setLoading] = useState(false);
  const [restored, setRestored] = useState(false);
  const [status, setStatus] = useState('Upload the original templates, then import source data.');
  useEffect(() => { try { let saved: Packet[] | null = null; for (const key of [storageKey, ...legacyKeys]) { const stored = localStorage.getItem(key); if (stored) { saved = JSON.parse(stored) as Packet[]; break; } } if (saved) { setLibrary(mergeSaved(seedLibrary(), saved)); setStatus('Saved templates restored into the reference-driven canvas.'); } } catch { setStatus('Template library ready.'); } setRestored(true); }, []);
  useEffect(() => { if (restored) localStorage.setItem(storageKey, JSON.stringify(library)); }, [library, restored]);
  const packets = library.filter((item) => item.round === round);
  const packet = packets.find((item) => item.id === packetId) || packets[0];
  const document = packet.docs.find((item) => item.id === docId) || packet.docs[0];
  const parsed = useMemo(() => parseSource(source), [source]);
  const routes = useMemo(() => outputRoutes(parsed), [parsed]);
  const docs = packets.flatMap((item) => item.docs); const savedCount = docs.filter((doc) => doc.file).length; const missing = docs.filter((doc) => !doc.file);
  const blockers = [!source.trim() ? 'Upload or paste TXT source data.' : '', source.trim() && !parsed.name ? 'Consumer name was not detected.' : '', source.trim() && !routes.length ? 'No valid dispute, hard inquiry, or late-payment data was detected.' : ''].filter(Boolean);
  function switchRound(next: Round) { setRound(next); const first = library.find((item) => item.round === next)!; setPacketId(first.id); setDocId(first.docs[0].id); setOutputs([]); setZipOutput(null); }
  function choosePacket(next: Packet) { setPacketId(next.id); setDocId(next.docs[0].id); }
  function patchDoc(change: Partial<Doc>) { setLibrary((all) => all.map((item) => item.id !== packet.id ? item : { ...item, docs: item.docs.map((doc) => doc.id === document.id ? { ...doc, ...change } : doc) })); }
  async function uploadTemplate(file: File) { await storeFile(document.id, file); patchDoc({ file: file.name, fileType: file.type, extension: ext(file.name), size: file.size }); setStatus(`${document.name} saved. It remains until replaced or deleted.`); }
  async function deleteTemplate() { if (!window.confirm(`Delete ${document.name}?`)) return; await eraseFile(document.id); patchDoc({ file: '', fileType: undefined, extension: undefined, size: undefined }); setStatus(`${document.name} deleted.`); }
  async function loadSource(file: File) { setSource(await file.text()); setPanel('Source Data'); setStatus(`${file.name} loaded. Output decisions are now auto-detected per bureau.`); }
  function values(route: Route): PlaceholderValues { return {
    'consumer.name': parsed.name, 'consumer.address': parsed.address.join('\n'), 'consumer.dob': parsed.dob, 'consumer.ssn': parsed.ssn,
    'today.us_long': displayDate(letterDate), 'bureau.name': bureauInfo[route.bureau].name, 'bureau.address': bureauInfo[route.bureau].address,
    accounts_block: route.records.join('\n'), inquiries_block: route.inquiryRecords.join('\n'),
    fraud_items: route.records.map((description) => ({ description }))
  }; }
  async function generate() {
    if (blockers.length || (strict && missing.length)) { setPanel('Generate'); setStatus('Resolve the checks before generation.'); return; }
    setLoading(true); const made: Output[] = []; const warnings: string[] = []; const zip = new JSZip();
    for (const route of routes) {
      const target = packets.find((item) => item.kind === route.kind)!;
      const uploaded = target.docs.filter((doc) => doc.file);
      if (!uploaded.length) { warnings.push(`${category[route.kind].label}/${route.bureau}: no template uploaded.`); continue; }
      for (const doc of uploaded) {
        const original = await getFile(doc.id); if (!original) continue;
        const name = `${clean(parsed.name)}_${clean(round)}_${route.bureau}_${clean(doc.name)}${doc.extension || ext(original.name)}`;
        let blob: Blob = original; let rendered = false; let detail = 'Exact original copy';
        if (doc.placeholders && isDocx(original.name)) {
          try { blob = await renderDocxTemplate(original, values(route)); rendered = true; detail = 'DOCX placeholders rendered'; }
          catch { warnings.push(`${route.bureau}/${doc.name}: DOCX tags require correction.`); continue; }
        }
        const path = `${category[route.kind].folder}/${route.bureau}/${name}`;
        zip.file(path, blob); made.push({ id: path, path, name, document: doc.name, bureau: route.bureau, kind: route.kind, rendered, detail, blob });
      }
    }
    zip.file('Generation Manifest.txt', [
      'LetterGenerator Reference Canvas Manifest', `Consumer: ${parsed.name}`, `Round: ${round}`, `Letter date: ${displayDate(letterDate)}`, '',
      'Generation decisions:', ...routes.map((route) => `CREATE | ${category[route.kind].label} | ${route.bureau} | ${route.reason}`), '',
      'Created files:', ...made.map((file) => `- ${file.path}`), ...(warnings.length ? ['', 'Warnings:', ...warnings.map((warning) => `- ${warning}`)] : [])
    ].join('\n'));
    const blob = await zip.generateAsync({ type: 'blob' });
    setOutputs(made); setZipOutput({ name: `${clean(parsed.name)}_${clean(round)}_PACKAGE.zip`, blob }); setPanel('Outputs'); setLoading(false);
    setStatus(`${made.length} files created inside one ZIP. For Dispute includes bureau-specific dispute accounts and hard inquiries.`);
  }
  function roundTabs() { return <nav className="stepper" aria-label="Letter round">{rounds.map((item, index) => <button key={item} className={item === round ? 'current' : ''} onClick={() => switchRound(item)}><i>{index + 1}</i><span>{item}</span></button>)}</nav>; }
  function templatesView() { return <><section className="panel" style={{ marginBottom: 18 }}><div className="panel-heading"><div><h2>Template round</h2><p>Every round keeps a For Dispute packet and a Late Payment packet.</p></div><Pill tone="accent">{round}</Pill></div>{roundTabs()}</section><div className="content-grid"><section className="panel"><div className="panel-heading"><div><h2>{round} packet library</h2><p>Hard inquiry records use the For Dispute letter, matching your completed files.</p></div><Pill tone={savedCount ? 'success' : 'neutral'}>{savedCount}/{docs.length} saved</Pill></div><div className="packet-picker">{packets.map((item) => <button key={item.id} className={`packet ${item.id === packet.id ? 'selected' : ''}`} onClick={() => choosePacket(item)}><span>{item.name}</span><small>{item.description}</small><b>{item.docs.filter((doc) => doc.file).length}/{item.docs.length}</b></button>)}</div><div className="documents">{packet.docs.map((doc, i) => <button key={doc.id} className={`document ${doc.id === document.id ? 'selected' : ''}`} onClick={() => setDocId(doc.id)}><i>{i + 1}</i><span><strong>{doc.name}</strong><small>{doc.file || 'No file uploaded'}</small></span><Pill tone={doc.file ? 'success' : 'warning'}>{doc.file ? 'Saved' : 'Pending'}</Pill></button>)}</div></section><section className="panel editor-panel"><div className="panel-heading"><div><h2>{document.name}</h2><p>{packet.name}</p></div><Pill tone={document.file ? 'success' : 'warning'}>{document.file ? 'Saved' : 'Pending'}</Pill></div>{document.file ? <div className="saved-file"><strong>{document.file}</strong><span>{bytes(document.size)} · {document.extension}</span><p>{document.placeholders && isDocx(document.file) ? 'DOCX placeholder and repeating-record rendering enabled.' : 'Exact copy on export.'}</p></div> : <div className="upload-empty"><p>No template uploaded.</p></div>}<label className="field-label">{document.file ? 'Replace template' : 'Upload template'}<input className="file-input" type="file" accept=".docx,.pdf,.png,.jpg,.jpeg" onChange={(e) => { const file = e.target.files?.[0]; if (file) void uploadTemplate(file); e.target.value = ''; }} /></label>{document.file && <button className="delete-button" onClick={() => void deleteTemplate()}>Delete saved file</button>}<label className="switch-row"><input type="checkbox" checked={document.placeholders} onChange={(e) => patchDoc({ placeholders: e.target.checked })} /><span>Render placeholders in DOCX</span></label>{document.placeholders && <label className="field-label">DOCX tags and loop support<textarea className="code-area" value={document.fields} onChange={(e) => patchDoc({ fields: e.target.value })} /></label>}</section></div></>; }
  function sourceView() { return <div className="content-grid"><section className="panel"><div className="panel-heading"><div><h2>Upload source</h2><p>TXT data controls what gets created.</p></div></div><label className="field-label">Source .txt<input className="file-input" type="file" accept=".txt" onChange={(e) => e.target.files?.[0] && loadSource(e.target.files[0])} /></label><label className="field-label">Letter date<input className="file-input" type="date" value={letterDate} onChange={(e) => setLetterDate(e.target.value)} /></label><textarea className="source-area" value={source} onChange={(e) => setSource(e.target.value)} placeholder="Paste TXT source here…" /></section><section className="panel"><div className="panel-heading"><div><h2>Decision canvas</h2><p>What, why, and where each letter is created.</p></div><Pill tone="accent">{round}</Pill></div>{roundTabs()}<div className="route-table">{bureaus.map((bureau) => { const dispute = valid(parsed.dispute[bureau]); const inquiry = valid(parsed.inquiry[bureau]); const late = valid(parsed.late[bureau]); const makesDispute = dispute.length + inquiry.length > 0; return <div className="bureau" key={bureau}><strong>{bureau}</strong><Pill tone={makesDispute ? 'success' : 'neutral'}>{makesDispute ? `For Dispute ${dispute.length + inquiry.length}` : 'Skip Dispute'}</Pill><Pill tone={late.length ? 'success' : 'neutral'}>{late.length ? `Late ${late.length}` : 'Skip Late'}</Pill></div>; })}</div><div className="pending-list">{routes.length ? routes.map((route) => <span key={`${route.kind}-${route.bureau}`}><strong>{category[route.kind].label} / {route.bureau}</strong> — {route.reason}</span>) : <span>No valid routes yet. Values such as NONE or NNONE are skipped.</span>}</div><button className="action-button" onClick={() => setPanel('Generate')}>Continue with {round}</button></section></div>; }
  function generateView() { return <div className="content-grid"><section className="panel"><div className="panel-heading"><div><h2>Generate {round}</h2><p>One ZIP, separated into operational folders.</p></div><Pill tone={routes.length ? 'accent' : 'neutral'}>{routes.length} letters</Pill></div>{routes.length ? <div className="route-list">{routes.map((route) => <div className="route-card" key={`${route.kind}-${route.bureau}`}><strong>{route.bureau}</strong><span>{category[route.kind].label}</span><small>{route.records.length} detected record(s)</small></div>)}</div> : <Empty title="No letters to create" text="Upload valid bureau-specific source data first." />}<button className="action-button" disabled={loading} onClick={() => void generate()}>{loading ? 'Building package…' : 'Generate ZIP package'}</button></section><section className="panel"><div className="panel-heading"><div><h2>Reference-driven rules</h2><p>Based on the completed dispute outputs.</p></div></div><div className="alert success"><strong>HOW:</strong> Hard inquiries and dispute accounts combine into the For Dispute letter for the same bureau.</div><div className="alert success"><strong>WHY:</strong> A bureau letter is created only when valid entries exist; NONE and NNONE are ignored.</div><div className="alert success"><strong>WHERE:</strong> ZIP folders are For Dispute/Bureau and Late Payment/Bureau.</div><div className="alert success"><strong>WHEN:</strong> After source upload, round choice, and template availability.</div>{blockers.map((text) => <div className="alert error" key={text}>{text}</div>)}</section></div>; }
  function outputsView() { return <section className="panel outputs"><div className="panel-heading"><div><h2>{round} package</h2><p>Rendered documents organized by letter purpose and bureau.</p></div><Pill tone={zipOutput ? 'success' : 'neutral'}>{outputs.length} files</Pill></div>{zipOutput && <div className="info-card" style={{ marginBottom: 18 }}><strong>{zipOutput.name}</strong><p>Includes a generation manifest and only folders required by the detected data.</p><button className="secondary-button" style={{ marginTop: 12 }} onClick={() => save(zipOutput.name, zipOutput.blob)}>Download ZIP Package</button></div>}{outputs.length ? <div className="output-list">{outputs.map((file) => <article className="output" key={file.id}><div><Pill tone={file.rendered ? 'success' : 'accent'}>{file.rendered ? 'Rendered DOCX' : 'Exact Copy'}</Pill><h3>{file.path}</h3><p>{file.detail}</p></div></article>)}</div> : <Empty title="No output package" text="Upload source data and generate the selected round." />}</section>; }
  function settingsView() { return <section className="panel settings"><div className="panel-heading"><div><h2>Rules and storage</h2><p>Reference-driven configuration.</p></div></div><label className="setting"><input type="checkbox" checked={strict} onChange={(e) => setStrict(e.target.checked)} /><span><strong>Strict document completion</strong><small>Require every document slot before generating. Keep off while developing templates.</small></span></label><div className="info-card"><strong>DOCX repeating items requirement</strong><p>To reproduce multiple inserted records while preserving formatting, prepare the DOCX with repeating tags <code>{'{{#fraud_items}}'}</code> and <code>{'{{/fraud_items}}'}</code> around the formatted account paragraph.</p></div></section>; }
  const progress = workflow.indexOf(panel);
  return <main className="app-shell"><aside className="sidebar"><div className="brand"><span /><div><strong>LetterGenerator</strong><small>Reference canvas</small></div></div><nav aria-label="Primary navigation">{panels.map((item) => <button key={item.id} className={panel === item.id ? 'active' : ''} onClick={() => setPanel(item.id)}><strong>{item.title}</strong><small>{item.subtitle}</small></button>)}</nav><div className="storage-progress"><div><strong>{savedCount}/{docs.length}</strong><small>{round} templates saved</small></div><div className="bar"><span style={{ width: `${docs.length ? savedCount / docs.length * 100 : 0}%` }} /></div></div></aside><section className="main-area"><header className="header"><div><p className="eyebrow">{round} workflow</p><h1>{panel}</h1></div><button className="header-action" onClick={() => setPanel('Generate')}>Generate</button></header><nav className="stepper" aria-label="Workflow steps">{workflow.map((item, i) => <button key={item} className={item === panel ? 'current' : progress >= 0 && i < progress ? 'complete' : ''} onClick={() => setPanel(item)}><i>{i + 1}</i><span>{item}</span></button>)}</nav>{panel === 'Templates' && templatesView()}{panel === 'Source Data' && sourceView()}{panel === 'Generate' && generateView()}{panel === 'Outputs' && outputsView()}{panel === 'Settings' && settingsView()}<div className="toast" role="status" aria-live="polite">{status}</div></section></main>;
}
