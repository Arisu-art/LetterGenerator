'use client';

import { useEffect, useMemo, useState } from 'react';
import JSZip from 'jszip';
import { isDocx, renderDocxTemplate } from '../lib/docx-renderer';

type Bureau = 'TRANSUNION' | 'EQUIFAX' | 'EXPERIAN';
type Round = '1st Round' | '2nd Round' | '3rd Round' | 'Final';
type Panel = 'Templates' | 'Source Data' | 'Generate' | 'Outputs' | 'Settings';
type Kind = 'DISPUTE' | 'LATE_PAYMENT' | 'HARD_INQUIRY';
type Tone = 'neutral' | 'success' | 'warning' | 'accent';
type Doc = { id: string; name: string; file: string; fileType?: string; extension?: string; size?: number; placeholders: boolean; fields: string };
type Packet = { id: string; round: Round; kind: Kind; name: string; description: string; docs: Doc[] };
type Parsed = { name: string; address: string[]; dob: string; ssn: string; dispute: Record<Bureau, string[]>; late: Record<Bureau, string[]>; inquiry: Record<Bureau, string[]>; unassignedInquiry: string[] };
type Route = { bureau: Bureau; kind: Kind; records: string[] };
type Output = { id: string; path: string; name: string; packet: string; document: string; bureau: Bureau; kind: Kind; rendered: boolean; detail: string; blob: Blob };
type ZipOutput = { name: string; blob: Blob } | null;

const rounds: Round[] = ['1st Round', '2nd Round', '3rd Round', 'Final'];
const bureaus: Bureau[] = ['TRANSUNION', 'EQUIFAX', 'EXPERIAN'];
const panels: { id: Panel; title: string; subtitle: string }[] = [
  { id: 'Templates', title: 'Templates', subtitle: 'Round packet library' },
  { id: 'Source Data', title: 'Source Data', subtitle: 'Import and auto-detect' },
  { id: 'Generate', title: 'Generate', subtitle: 'Build ZIP package' },
  { id: 'Outputs', title: 'Outputs', subtitle: 'Download ZIP' },
  { id: 'Settings', title: 'Settings', subtitle: 'Preferences' }
];
const workflow: Panel[] = ['Templates', 'Source Data', 'Generate', 'Outputs'];
const metadataKey = 'lettergenerator.round.library.v5';
const legacyKeys = ['lettergenerator.round.library.v4', 'lettergenerator.round.library.v3', 'lettergenerator.first-round.library.v2'];
const dbName = 'lettergenerator-private-templates';
const storeName = 'files';
const docxTags = ['{{consumer.name}}', '{{consumer.address}}', '{{consumer.dob}}', '{{consumer.ssn}}', '{{today.us_long}}', '{{bureau.name}}', '{{bureau.address}}', '{{accounts_block}}', '{{inquiries_block}}'].join('\n');
const bureauInfo: Record<Bureau, { name: string; address: string }> = {
  TRANSUNION: { name: 'TransUnion LLC', address: 'P.O. Box 2000\nChester, PA 19016-2000' },
  EQUIFAX: { name: 'Equifax Information Services LLC', address: 'PO Box 105139\nAtlanta, GA 30348' },
  EXPERIAN: { name: 'Experian', address: 'PO Box 4500\nAllen, TX 75013' }
};
const kindInfo: Record<Kind, { label: string; folder: string }> = {
  DISPUTE: { label: 'Dispute', folder: 'Dispute' },
  LATE_PAYMENT: { label: 'Late Payment', folder: 'Late Payment' },
  HARD_INQUIRY: { label: 'Hard Inquiry', folder: 'Hard Inquiries' }
};

function disputeDocs(prefix: string): Doc[] { return [
  { id: `${prefix}-letter`, name: 'Dispute Letter', file: '', placeholders: true, fields: docxTags },
  { id: `${prefix}-support`, name: 'Supporting Documents', file: '', placeholders: true, fields: '{{consumer.name}}\n{{consumer.address}}\n{{today.us_long}}' },
  { id: `${prefix}-fcra`, name: 'FCRA', file: '', placeholders: true, fields: '{{consumer.name}}\n{{today.us_long}}' },
  { id: `${prefix}-affidavit`, name: 'Affidavit', file: '', placeholders: true, fields: docxTags },
  { id: `${prefix}-attachment`, name: 'Attachment', file: '', placeholders: false, fields: '' },
  { id: `${prefix}-ftc`, name: 'FTC', file: '', placeholders: true, fields: docxTags }
]; }
function lateDocs(prefix: string): Doc[] { return [
  { id: `${prefix}-letter`, name: 'Late Payment Letter', file: '', placeholders: true, fields: docxTags },
  { id: `${prefix}-support`, name: 'Supporting Documents', file: '', placeholders: true, fields: '{{consumer.name}}\n{{consumer.address}}\n{{today.us_long}}' }
]; }
function inquiryDocs(prefix: string): Doc[] { return [
  { id: `${prefix}-letter`, name: 'Hard Inquiry Letter', file: '', placeholders: true, fields: docxTags }
]; }
function seedLibrary(): Packet[] {
  return rounds.flatMap((round, index) => {
    const prefix = index === 0 ? '' : `r${index + 1}-`;
    return [
      { id: `${index + 1}-dispute`, round, kind: 'DISPUTE', name: `${round} Dispute Packet`, description: 'Letter and supporting dispute documentation', docs: disputeDocs(`${prefix}dispute`) },
      { id: `${index + 1}-late`, round, kind: 'LATE_PAYMENT', name: `${round} Late Payment Packet`, description: 'Letter and supporting documentation only', docs: lateDocs(`${prefix}late`) },
      { id: `${index + 1}-inquiry`, round, kind: 'HARD_INQUIRY', name: `${round} Hard Inquiry Packet`, description: 'Unauthorized hard inquiry letter', docs: inquiryDocs(`${prefix}inquiry`) }
    ];
  });
}
function mergeSaved(seed: Packet[], stored: Packet[]) {
  return seed.map((packet) => {
    const saved = stored.find((item) => item.round === packet.round && item.kind === packet.kind) || (packet.round === '1st Round' ? stored.find((item) => item.kind === packet.kind) : undefined);
    if (!saved) return packet;
    return { ...packet, name: saved.name || packet.name, docs: packet.docs.map((doc) => ({ ...doc, ...(saved.docs?.find((item) => item.id === doc.id) || {}) })) };
  });
}
function openDb(): Promise<IDBDatabase> { return new Promise((resolve, reject) => { const request = indexedDB.open(dbName, 1); request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains(storeName)) request.result.createObjectStore(storeName); }; request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); }); }
async function storeFile(id: string, file: File) { const db = await openDb(); await new Promise<void>((resolve, reject) => { const tx = db.transaction(storeName, 'readwrite'); tx.objectStore(storeName).put(file, id); tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); }); db.close(); }
async function getFile(id: string) { const db = await openDb(); const file = await new Promise<File | null>((resolve, reject) => { const request = db.transaction(storeName, 'readonly').objectStore(storeName).get(id); request.onsuccess = () => resolve((request.result as File) || null); request.onerror = () => reject(request.error); }); db.close(); return file; }
async function eraseFile(id: string) { const db = await openDb(); await new Promise<void>((resolve, reject) => { const tx = db.transaction(storeName, 'readwrite'); tx.objectStore(storeName).delete(id); tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); }); db.close(); }
function emptyMap(): Record<Bureau, string[]> { return { TRANSUNION: [], EQUIFAX: [], EXPERIAN: [] }; }
function blank(): Parsed { return { name: '', address: [], dob: '', ssn: '', dispute: emptyMap(), late: emptyMap(), inquiry: emptyMap(), unassignedInquiry: [] }; }
function parseSource(text: string): Parsed {
  const data = blank(); const header: string[] = []; let section: 'header' | 'dispute' | 'late' | 'inquiry' | 'skip' = 'header'; let bureau: Bureau | '' = '';
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim(); if (!line) continue; const key = line.replace(/:$/, '').trim().toUpperCase();
    if (key.startsWith('DISPUTE')) { section = 'dispute'; bureau = ''; continue; }
    if (key.startsWith('LATE')) { section = 'late'; bureau = ''; continue; }
    if (key.startsWith('HARD')) { section = 'inquiry'; bureau = ''; continue; }
    if (key.startsWith('OPEN')) { section = 'skip'; bureau = ''; continue; }
    const found: Bureau | '' = key === 'TRANSUNION' || key === 'TRANS UNION' || key === 'TU' ? 'TRANSUNION' : key === 'EQUIFAX' || key === 'EQ' ? 'EQUIFAX' : key === 'EXPERIAN' || key === 'EXP' ? 'EXPERIAN' : '';
    if (found) { bureau = found; continue; }
    if (section === 'header') header.push(line);
    if (section === 'dispute' && bureau) data.dispute[bureau].push(line);
    if (section === 'late' && bureau) data.late[bureau].push(line);
    if (section === 'inquiry') { if (bureau) data.inquiry[bureau].push(line); else data.unassignedInquiry.push(line); }
  }
  data.name = header[0] || ''; data.dob = (header.find((line) => /^DOB:/i.test(line)) || '').replace(/^DOB:\s*/i, ''); data.ssn = (header.find((line) => /^SSN:/i.test(line)) || '').replace(/^SSN:\s*/i, ''); data.address = header.slice(1).filter((line) => !/^(DOB|SSN):/i.test(line)); return data;
}
function ext(name: string) { return name.match(/(\.[a-z0-9]+)$/i)?.[1] || ''; }
function clean(name: string) { return (name || 'CLIENT').replace(/[^a-z0-9]+/gi, '_').replace(/^_|_$/g, '').toUpperCase(); }
function bytes(size?: number) { return size ? size >= 1048576 ? `${(size / 1048576).toFixed(1)} MB` : `${(size / 1024).toFixed(1)} KB` : ''; }
function dateNow() { return new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric' }).format(new Date()); }
function save(name: string, blob: Blob) { const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = name; link.click(); URL.revokeObjectURL(url); }
function Pill({ children, tone = 'neutral' }: { children: React.ReactNode; tone?: Tone }) { return <span className={`pill ${tone}`}>{children}</span>; }
function Empty({ title, text }: { title: string; text: string }) { return <div className="empty-state"><div className="empty-icon">+</div><strong>{title}</strong><p>{text}</p></div>; }

export default function Page() {
  const [panel, setPanel] = useState<Panel>('Templates');
  const [library, setLibrary] = useState<Packet[]>(seedLibrary);
  const [round, setRound] = useState<Round>('1st Round');
  const [packetId, setPacketId] = useState('1-dispute');
  const [docId, setDocId] = useState('dispute-letter');
  const [source, setSource] = useState('');
  const [outputs, setOutputs] = useState<Output[]>([]);
  const [zipOutput, setZipOutput] = useState<ZipOutput>(null);
  const [strict, setStrict] = useState(false);
  const [loading, setLoading] = useState(false);
  const [restored, setRestored] = useState(false);
  const [status, setStatus] = useState('Upload the original templates for each letter category.');
  useEffect(() => { try { let saved: Packet[] | null = null; for (const key of [metadataKey, ...legacyKeys]) { const value = localStorage.getItem(key); if (value) { saved = JSON.parse(value) as Packet[]; break; } } if (saved) { setLibrary(mergeSaved(seedLibrary(), saved)); setStatus('Saved templates restored.'); } } catch { setStatus('Template library ready.'); } setRestored(true); }, []);
  useEffect(() => { if (restored) localStorage.setItem(metadataKey, JSON.stringify(library)); }, [library, restored]);
  const packets = library.filter((item) => item.round === round);
  const packet = packets.find((item) => item.id === packetId) || packets[0];
  const document = packet.docs.find((item) => item.id === docId) || packet.docs[0];
  const parsed = useMemo(() => parseSource(source), [source]);
  const routes: Route[] = useMemo(() => bureaus.flatMap((bureau) => [
    parsed.dispute[bureau].length ? { bureau, kind: 'DISPUTE' as Kind, records: parsed.dispute[bureau] } : null,
    parsed.late[bureau].length ? { bureau, kind: 'LATE_PAYMENT' as Kind, records: parsed.late[bureau] } : null,
    parsed.inquiry[bureau].length ? { bureau, kind: 'HARD_INQUIRY' as Kind, records: parsed.inquiry[bureau] } : null
  ].filter(Boolean) as Route[]), [parsed]);
  const documents = packets.flatMap((item) => item.docs); const savedCount = documents.filter((item) => item.file).length; const missing = documents.filter((item) => !item.file);
  const blockers = [!source.trim() ? 'Upload or paste TXT source data.' : '', source.trim() && !parsed.name ? 'Consumer name was not detected.' : '', source.trim() && !routes.length ? 'No dispute, late-payment, or bureau-assigned hard-inquiry routes detected.' : ''].filter(Boolean);
  function switchRound(next: Round) { setRound(next); const first = library.find((item) => item.round === next)!; setPacketId(first.id); setDocId(first.docs[0].id); setOutputs([]); setZipOutput(null); }
  function choosePacket(next: Packet) { setPacketId(next.id); setDocId(next.docs[0].id); }
  function patchDoc(change: Partial<Doc>) { setLibrary((all) => all.map((item) => item.id !== packet.id ? item : { ...item, docs: item.docs.map((doc) => doc.id === document.id ? { ...doc, ...change } : doc) })); }
  async function uploadTemplate(file: File) { await storeFile(document.id, file); patchDoc({ file: file.name, fileType: file.type, extension: ext(file.name), size: file.size }); setStatus(`${document.name} saved. DOCX placeholders will render during generation.`); }
  async function deleteTemplate() { if (!confirm(`Delete ${document.name}?`)) return; await eraseFile(document.id); patchDoc({ file: '', fileType: undefined, extension: undefined, size: undefined }); setStatus(`${document.name} deleted.`); }
  async function loadSource(file: File) { setSource(await file.text()); setPanel('Source Data'); setStatus(`${file.name} loaded. Select the output round and review auto-detected routes.`); }
  function values(route: Route) { return { 'consumer.name': parsed.name, 'consumer.address': parsed.address.join('\n'), 'consumer.dob': parsed.dob, 'consumer.ssn': parsed.ssn, 'today.us_long': dateNow(), 'bureau.name': bureauInfo[route.bureau].name, 'bureau.address': bureauInfo[route.bureau].address, accounts_block: route.records.join('\n'), inquiries_block: route.kind === 'HARD_INQUIRY' ? route.records.join('\n') : parsed.inquiry[route.bureau].join('\n') }; }
  async function generate() {
    if (blockers.length || (strict && missing.length)) { setPanel('Generate'); setStatus('Resolve the checks before generation.'); return; }
    setLoading(true); const made: Output[] = []; const failed: string[] = []; const skipped: string[] = []; const zip = new JSZip();
    for (const route of routes) {
      const targetPacket = packets.find((item) => item.kind === route.kind)!;
      const available = targetPacket.docs.filter((item) => item.file);
      if (!available.length) { skipped.push(`${kindInfo[route.kind].label} / ${route.bureau}: no saved template`); continue; }
      for (const doc of available) {
        const original = await getFile(doc.id); if (!original) { skipped.push(`${doc.name}: saved file could not be read`); continue; }
        const name = `${clean(parsed.name)}_${clean(round)}_${route.bureau}_${route.kind}_${clean(doc.name)}${doc.extension || ext(original.name)}`;
        let blob: Blob = original; let rendered = false; let detail = `${doc.extension || ext(original.name)} · exact copy`;
        if (doc.placeholders && isDocx(original.name)) {
          try { blob = await renderDocxTemplate(original, values(route)); rendered = true; detail = 'DOCX · placeholders rendered'; }
          catch { failed.push(`${route.bureau} / ${doc.name}`); continue; }
        }
        const path = `${kindInfo[route.kind].folder}/${route.bureau}/${name}`;
        zip.file(path, blob); made.push({ id: path, path, name, packet: targetPacket.name, document: doc.name, bureau: route.bureau, kind: route.kind, rendered, detail, blob });
      }
    }
    const manifest = [`LetterGenerator Package`, `Client: ${parsed.name}`, `Round: ${round}`, `Created: ${dateNow()}`, '', 'Detected routes:', ...routes.map((route) => `- ${kindInfo[route.kind].label} / ${route.bureau}: ${route.records.length} source line(s)`), '', 'Created files:', ...made.map((file) => `- ${file.path}`), '', ...(skipped.length ? ['Skipped:', ...skipped.map((item) => `- ${item}`), ''] : []), ...(failed.length ? ['DOCX rendering failures:', ...failed.map((item) => `- ${item}`)] : [])].join('\n');
    zip.file('Manifest.txt', manifest);
    const zipBlob = await zip.generateAsync({ type: 'blob' });
    const zipName = `${clean(parsed.name)}_${clean(round)}_LETTER_PACKAGE.zip`;
    setOutputs(made); setZipOutput({ name: zipName, blob: zipBlob }); setPanel('Outputs'); setLoading(false); setStatus(`${made.length} file(s) packaged into one ZIP. Only categories with detected bureau data were created.`);
  }
  function roundTabs() { return <nav className="stepper" aria-label="Letter round">{rounds.map((item, index) => <button key={item} className={item === round ? 'current' : ''} onClick={() => switchRound(item)}><i>{index + 1}</i><span>{item}</span></button>)}</nav>; }
  function templateScreen() { return <><section className="panel" style={{ marginBottom: 18 }}><div className="panel-heading"><div><h2>Choose template round</h2><p>Each round stores separate dispute, late-payment and hard-inquiry templates.</p></div><Pill tone="accent">{round}</Pill></div>{roundTabs()}</section><div className="content-grid"><section className="panel"><div className="panel-heading"><div><h2>{round} packets</h2><p>Upload original templates by letter category.</p></div><Pill tone={savedCount ? 'success' : 'neutral'}>{savedCount}/{documents.length} saved</Pill></div><div className="packet-picker">{packets.map((item) => <button key={item.id} className={`packet ${item.id === packet.id ? 'selected' : ''}`} onClick={() => choosePacket(item)}><span>{item.name}</span><small>{item.description}</small><b>{item.docs.filter((doc) => doc.file).length}/{item.docs.length}</b></button>)}</div><div className="documents">{packet.docs.map((doc, i) => <button key={doc.id} className={`document ${doc.id === document.id ? 'selected' : ''}`} onClick={() => setDocId(doc.id)}><i>{i + 1}</i><span><strong>{doc.name}</strong><small>{doc.file || 'No file uploaded'}</small></span><Pill tone={doc.file ? 'success' : 'warning'}>{doc.file ? 'Saved' : 'Pending'}</Pill></button>)}</div></section><section className="panel editor-panel"><div className="panel-heading"><div><h2>{document.name}</h2><p>{packet.name}</p></div><Pill tone={document.file ? 'success' : 'warning'}>{document.file ? 'Saved' : 'Pending'}</Pill></div>{document.file ? <div className="saved-file"><strong>{document.file}</strong><span>{bytes(document.size)} · {document.extension}</span><p>{document.placeholders && isDocx(document.file) ? 'DOCX placeholder replacement enabled.' : 'Exact copy on export.'}</p></div> : <div className="upload-empty"><p>No template uploaded.</p></div>}<label className="field-label">{document.file ? 'Replace template' : 'Upload template'}<input className="file-input" type="file" accept=".docx,.pdf,.png,.jpg,.jpeg" onChange={(e) => { const file = e.target.files?.[0]; if (file) void uploadTemplate(file); e.target.value = ''; }} /></label>{document.file && <button className="delete-button" onClick={() => void deleteTemplate()}>Delete saved file</button>}<label className="switch-row"><input type="checkbox" checked={document.placeholders} onChange={(e) => patchDoc({ placeholders: e.target.checked })} /><span>Replace approved placeholders in DOCX</span></label>{document.placeholders && <label className="field-label">Use these tags inside the DOCX<textarea className="code-area" value={document.fields} onChange={(e) => patchDoc({ fields: e.target.value })} /></label>}</section></div></>; }
  function sourceScreen() { return <div className="content-grid"><section className="panel"><div className="panel-heading"><div><h2>TXT source</h2><p>Import client data for automatic bureau routing.</p></div></div><label className="field-label">Upload .txt<input className="file-input" type="file" accept=".txt" onChange={(e) => e.target.files?.[0] && loadSource(e.target.files[0])} /></label><textarea className="source-area" value={source} onChange={(e) => setSource(e.target.value)} placeholder="Paste TXT source here…" /></section><section className="panel"><div className="panel-heading"><div><h2>Select output round</h2><p>Only valid detected categories generate files.</p></div><Pill tone="accent">{round}</Pill></div>{roundTabs()}<div className="panel-heading" style={{ marginTop: 20 }}><div><h2>Detected routes</h2><p>{parsed.name || 'No consumer loaded'}</p></div><Pill tone={routes.length ? 'success' : 'neutral'}>{routes.length} routes</Pill></div><div className="route-table">{bureaus.map((bureau) => <div className="bureau" key={bureau}><strong>{bureau}</strong><Pill tone={parsed.dispute[bureau].length ? 'success' : 'neutral'}>Dispute</Pill><Pill tone={parsed.late[bureau].length ? 'success' : 'neutral'}>Late</Pill><Pill tone={parsed.inquiry[bureau].length ? 'success' : 'neutral'}>Inquiry</Pill></div>)}</div>{parsed.unassignedInquiry.length > 0 && <div className="alert error" style={{ marginTop: 12 }}>Hard inquiry data exists without a bureau heading. Add TRANSUNION, EQUIFAX or EXPERIAN below HARD INQ to create the correct letter.</div>}<button className="action-button" onClick={() => setPanel('Generate')}>Continue with {round}</button></section></div>; }
  function generateScreen() { return <div className="content-grid"><section className="panel"><div className="panel-heading"><div><h2>Generate {round}</h2><p>Only source sections containing bureau data create files.</p></div><Pill tone={routes.length ? 'accent' : 'neutral'}>{routes.length} routes</Pill></div>{routes.length ? <div className="route-list">{routes.map((route) => <div className="route-card" key={`${route.bureau}-${route.kind}`}><strong>{route.bureau}</strong><span>{kindInfo[route.kind].label}</span><small>{packets.find((item) => item.kind === route.kind)?.name}</small></div>)}</div> : <Empty title="No routes detected" text="Upload TXT source with bureau-specific records first." />}<button className="action-button" disabled={loading} onClick={() => void generate()}>{loading ? 'Building ZIP package…' : 'Generate one ZIP package'}</button></section><section className="panel"><div className="panel-heading"><div><h2>Package rules</h2><p>Automatic folder organization.</p></div></div><div className="alert success">Dispute, Late Payment and Hard Inquiries are placed into separate folders inside one ZIP file.</div><div className="alert success">DOCX files render approved tags; PDF/image/attachments remain exact copies.</div>{blockers.map((text) => <div className="alert error" key={text}>{text}</div>)}{missing.length > 0 && <div className="pending-list"><p>{missing.length} template document(s) are pending in {round}.</p>{missing.slice(0, 5).map((doc) => <span key={doc.id}>{doc.name}</span>)}</div>}</section></div>; }
  function outputsScreen() { return <section className="panel outputs"><div className="panel-heading"><div><h2>{round} ZIP output</h2><p>Organized by category and bureau.</p></div><Pill tone={zipOutput ? 'success' : 'neutral'}>{outputs.length} files</Pill></div>{zipOutput && <div className="info-card" style={{ marginBottom: 18 }}><strong>{zipOutput.name}</strong><p>Includes folders only for categories and bureaus detected in your source. <button className="secondary-button" style={{ marginTop: 12 }} onClick={() => save(zipOutput.name, zipOutput.blob)}>Download ZIP Package</button></p></div>}{outputs.length ? <div className="output-list">{outputs.map((file) => <article className="output" key={file.id}><div><Pill tone={file.rendered ? 'success' : 'accent'}>{file.rendered ? 'Rendered DOCX' : 'Exact copy'}</Pill><h3>{file.path}</h3><p>{file.detail}</p></div></article>)}</div> : <Empty title="No output package" text="Select a round, upload source data, then generate one ZIP package." />}</section>; }
  function settingsScreen() { return <section className="panel settings"><div className="panel-heading"><div><h2>Preferences</h2><p>Document generation controls.</p></div></div><label className="setting"><input type="checkbox" checked={strict} onChange={(e) => setStrict(e.target.checked)} /><span><strong>Strict template validation</strong><small>Require every document in the selected round before generating.</small></span></label><div className="info-card"><strong>ZIP folder structure</strong><p>Dispute / Bureau / files<br />Late Payment / Bureau / files<br />Hard Inquiries / Bureau / files</p></div></section>; }
  const progress = workflow.indexOf(panel);
  return <main className="app-shell"><aside className="sidebar"><div className="brand"><span /><div><strong>LetterGenerator</strong><small>Round-based workspace</small></div></div><nav aria-label="Primary navigation">{panels.map((item) => <button key={item.id} className={panel === item.id ? 'active' : ''} onClick={() => setPanel(item.id)}><strong>{item.title}</strong><small>{item.subtitle}</small></button>)}</nav><div className="storage-progress"><div><strong>{savedCount}/{documents.length}</strong><small>{round} templates saved</small></div><div className="bar"><span style={{ width: `${documents.length ? savedCount / documents.length * 100 : 0}%` }} /></div></div></aside><section className="main-area"><header className="header"><div><p className="eyebrow">{round} workflow</p><h1>{panel}</h1></div><button className="header-action" onClick={() => setPanel('Generate')}>Generate</button></header><nav className="stepper" aria-label="Workflow steps">{workflow.map((item, i) => <button key={item} className={item === panel ? 'current' : progress >= 0 && i < progress ? 'complete' : ''} onClick={() => setPanel(item)}><i>{i + 1}</i><span>{item}</span></button>)}</nav>{panel === 'Templates' && templateScreen()}{panel === 'Source Data' && sourceScreen()}{panel === 'Generate' && generateScreen()}{panel === 'Outputs' && outputsScreen()}{panel === 'Settings' && settingsScreen()}<div className="toast" role="status">{status}</div></section></main>;
}
