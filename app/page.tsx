'use client';

import { useEffect, useMemo, useState } from 'react';

type Bureau = 'TRANSUNION' | 'EQUIFAX' | 'EXPERIAN';
type Round = '1st Round' | '2nd Round' | '3rd Round' | 'Final';
type Panel = 'Templates' | 'Source Data' | 'Generate' | 'Outputs' | 'Settings';
type Kind = 'DISPUTE' | 'LATE_PAYMENT';
type Tone = 'neutral' | 'success' | 'warning' | 'accent';
type Doc = { id: string; name: string; file: string; fileType?: string; extension?: string; size?: number; savedAt?: string; placeholders: boolean; fields: string };
type Packet = { id: string; round: Round; kind: Kind; name: string; description: string; docs: Doc[] };
type Parsed = { name: string; address: string[]; dob: string; ssn: string; dispute: Record<Bureau, string[]>; late: Record<Bureau, string[]> };
type Route = { bureau: Bureau; kind: Kind; records: string[] };
type Output = { id: string; name: string; packet: string; document: string; bureau: Bureau; kind: Kind; fileType: string; blob: Blob };

const rounds: Round[] = ['1st Round', '2nd Round', '3rd Round', 'Final'];
const bureaus: Bureau[] = ['TRANSUNION', 'EQUIFAX', 'EXPERIAN'];
const navigation: { id: Panel; label: string; description: string }[] = [
  { id: 'Templates', label: 'Templates', description: 'Round packet library' },
  { id: 'Source Data', label: 'Source Data', description: 'Import and route' },
  { id: 'Generate', label: 'Generate', description: 'Export exact copies' },
  { id: 'Outputs', label: 'Outputs', description: 'Download files' },
  { id: 'Settings', label: 'Settings', description: 'Preferences' }
];
const workflow: Panel[] = ['Templates', 'Source Data', 'Generate', 'Outputs'];
const metadataKey = 'lettergenerator.round.library.v3';
const legacyKey = 'lettergenerator.first-round.library.v2';
const dbName = 'lettergenerator-private-templates';
const storeName = 'files';
const commonFields = '{{consumer.name}}\n{{consumer.address}}\n{{consumer.dob}}\n{{consumer.ssn}}\n{{today.us_long}}\n{{bureau.name}}\n{{bureau.address}}\n{{accounts_block}}';
const addresses: Record<Bureau, string> = {
  TRANSUNION: 'TransUnion LLC\nP.O. Box 2000\nChester, PA 19016-2000',
  EQUIFAX: 'Equifax Information Services LLC\nPO Box 105139\nAtlanta, GA 30348',
  EXPERIAN: 'Experian\nPO Box 4500\nAllen, TX 75013'
};

function disputeDocs(prefix: string): Doc[] { return [
  { id: `${prefix}-letter`, name: 'Dispute Letter', file: '', placeholders: true, fields: commonFields },
  { id: `${prefix}-support`, name: 'Supporting Documents', file: '', placeholders: true, fields: '{{consumer.name}}\n{{consumer.address}}\n{{today.us_long}}' },
  { id: `${prefix}-fcra`, name: 'FCRA', file: '', placeholders: true, fields: '{{consumer.name}}\n{{today.us_long}}' },
  { id: `${prefix}-affidavit`, name: 'Affidavit', file: '', placeholders: true, fields: commonFields },
  { id: `${prefix}-attachment`, name: 'Attachment', file: '', placeholders: false, fields: '' },
  { id: `${prefix}-ftc`, name: 'FTC', file: '', placeholders: true, fields: commonFields }
]; }
function lateDocs(prefix: string): Doc[] { return [
  { id: `${prefix}-letter`, name: 'Late Payment Letter', file: '', placeholders: true, fields: commonFields },
  { id: `${prefix}-support`, name: 'Supporting Documents', file: '', placeholders: true, fields: '{{consumer.name}}\n{{consumer.address}}\n{{today.us_long}}' }
]; }
function seedLibrary(): Packet[] {
  return rounds.flatMap((round, index) => {
    const first = index === 0;
    const disputePrefix = first ? 'dispute' : `r${index + 1}-dispute`;
    const latePrefix = first ? 'late' : `r${index + 1}-late`;
    return [
      { id: `${index + 1}-dispute`, round, kind: 'DISPUTE', name: `${round} Dispute Packet`, description: 'Dispute letter with supporting packet documents', docs: disputeDocs(disputePrefix) },
      { id: `${index + 1}-late`, round, kind: 'LATE_PAYMENT', name: `${round} Late Payment Packet`, description: 'Late-payment letter with supporting documents', docs: lateDocs(latePrefix) }
    ];
  });
}
function openDb(): Promise<IDBDatabase> { return new Promise((resolve, reject) => { const request = indexedDB.open(dbName, 1); request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains(storeName)) request.result.createObjectStore(storeName); }; request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); }); }
async function keepFile(id: string, file: File) { const db = await openDb(); await new Promise<void>((resolve, reject) => { const tx = db.transaction(storeName, 'readwrite'); tx.objectStore(storeName).put(file, id); tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); }); db.close(); }
async function retrieveFile(id: string): Promise<File | null> { const db = await openDb(); const file = await new Promise<File | null>((resolve, reject) => { const tx = db.transaction(storeName, 'readonly'); const request = tx.objectStore(storeName).get(id); request.onsuccess = () => resolve((request.result as File | undefined) || null); request.onerror = () => reject(request.error); }); db.close(); return file; }
async function removeFile(id: string) { const db = await openDb(); await new Promise<void>((resolve, reject) => { const tx = db.transaction(storeName, 'readwrite'); tx.objectStore(storeName).delete(id); tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); }); db.close(); }
function blank(): Parsed { return { name: '', address: [], dob: '', ssn: '', dispute: { TRANSUNION: [], EQUIFAX: [], EXPERIAN: [] }, late: { TRANSUNION: [], EQUIFAX: [], EXPERIAN: [] } }; }
function bureauFrom(value: string): Bureau | '' { const key = value.trim().replace(/:$/, '').toUpperCase(); if (key === 'TRANSUNION' || key === 'TRANS UNION' || key === 'TU') return 'TRANSUNION'; if (key === 'EQUIFAX' || key === 'EQ') return 'EQUIFAX'; if (key === 'EXPERIAN' || key === 'EXP') return 'EXPERIAN'; return ''; }
function parseSource(text: string): Parsed {
  const result = blank(); const header: string[] = []; let section = 'header'; let bureau: Bureau | '' = '';
  text.split(/\r?\n/).forEach((raw) => { const line = raw.trim(); if (!line) return; const key = line.replace(/:$/, '').toUpperCase(); if (key.startsWith('DISPUTE')) { section = 'dispute'; bureau = ''; return; } if (key.startsWith('LATE')) { section = 'late'; bureau = ''; return; } if (key.startsWith('OPEN') || key.startsWith('HARD')) { section = 'skip'; bureau = ''; return; } const identified = bureauFrom(line); if (identified) { bureau = identified; return; } if (section === 'header') header.push(line); if (section === 'dispute' && bureau) result.dispute[bureau].push(line); if (section === 'late' && bureau) result.late[bureau].push(line); });
  result.name = header[0] || ''; result.dob = (header.find((item) => /^DOB:/i.test(item)) || '').replace(/^DOB:\s*/i, ''); result.ssn = (header.find((item) => /^SSN:/i.test(item)) || '').replace(/^SSN:\s*/i, ''); result.address = header.slice(1).filter((item) => !/^(DOB|SSN):/i.test(item)); return result;
}
function clean(value: string) { return (value || 'CLIENT').replace(/[^a-z0-9]+/gi, '_').replace(/^_|_$/g, '').toUpperCase(); }
function ext(name: string) { const matched = name.match(/(\.[a-z0-9]+)$/i); return matched ? matched[1] : ''; }
function size(value?: number) { if (!value) return ''; return value >= 1048576 ? `${(value / 1048576).toFixed(1)} MB` : `${(value / 1024).toFixed(1)} KB`; }
function downloadBlob(name: string, blob: Blob) { const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = name; link.click(); URL.revokeObjectURL(url); }
function Pill({ children, tone = 'neutral' }: { children: React.ReactNode; tone?: Tone }) { return <span className={`pill ${tone}`}>{children}</span>; }
function EmptyState({ title, text }: { title: string; text: string }) { return <div className="empty-state"><div className="empty-icon" aria-hidden="true">+</div><strong>{title}</strong><p>{text}</p></div>; }

export default function Page() {
  const [panel, setPanel] = useState<Panel>('Templates');
  const [packets, setPackets] = useState<Packet[]>(seedLibrary);
  const [round, setRound] = useState<Round>('1st Round');
  const [packetId, setPacketId] = useState('1-dispute');
  const [documentId, setDocumentId] = useState('dispute-letter');
  const [source, setSource] = useState('');
  const [outputs, setOutputs] = useState<Output[]>([]);
  const [strict, setStrict] = useState(false);
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState('Choose a round and upload its original template files.');

  useEffect(() => {
    try {
      const stored = localStorage.getItem(metadataKey);
      if (stored) { setPackets(JSON.parse(stored) as Packet[]); setStatus('All saved round templates restored.'); }
      else {
        const legacy = localStorage.getItem(legacyKey);
        if (legacy) { const old = JSON.parse(legacy) as Packet[]; setPackets((current) => current.map((item) => item.round === '1st Round' ? (old.find((prior) => prior.kind === item.kind) || item) : item)); setStatus('Saved 1st Round templates restored; other rounds are ready.'); }
      }
    } catch { setStatus('Template library is ready for uploads.'); }
    setReady(true);
  }, []);
  useEffect(() => { if (ready) localStorage.setItem(metadataKey, JSON.stringify(packets)); }, [packets, ready]);

  const roundPackets = packets.filter((item) => item.round === round);
  const packet = roundPackets.find((item) => item.id === packetId) || roundPackets[0];
  const selectedDoc = packet.docs.find((item) => item.id === documentId) || packet.docs[0];
  const parsed = useMemo(() => parseSource(source), [source]);
  const routes: Route[] = useMemo(() => bureaus.flatMap((bureau) => [parsed.dispute[bureau].length ? { bureau, kind: 'DISPUTE' as Kind, records: parsed.dispute[bureau] } : null, parsed.late[bureau].length ? { bureau, kind: 'LATE_PAYMENT' as Kind, records: parsed.late[bureau] } : null].filter(Boolean) as Route[]), [parsed]);
  const roundDocs = roundPackets.flatMap((item) => item.docs);
  const savedCount = roundDocs.filter((item) => item.file).length;
  const missing = roundDocs.filter((item) => !item.file).map((item) => `${packet.name}: ${item.name}`);
  const blockers = [!source.trim() ? 'Upload or paste a TXT source to generate files.' : '', source.trim() && !parsed.name ? 'Consumer name was not detected in the source.' : '', source.trim() && !routes.length ? 'No dispute or late-payment bureau records were detected.' : ''].filter(Boolean);

  function changeRound(next: Round) { setRound(next); const initial = packets.find((item) => item.round === next)!; setPacketId(initial.id); setDocumentId(initial.docs[0].id); setOutputs([]); }
  function choosePacket(item: Packet) { setPacketId(item.id); setDocumentId(item.docs[0].id); }
  function updateDoc(change: Partial<Doc>) { setPackets((current) => current.map((item) => item.id !== packet.id ? item : { ...item, docs: item.docs.map((doc) => doc.id === selectedDoc.id ? { ...doc, ...change } : doc) })); }
  async function uploadTemplate(file: File) { await keepFile(selectedDoc.id, file); updateDoc({ file: file.name, fileType: file.type || 'application/octet-stream', extension: ext(file.name), size: file.size, savedAt: new Date().toISOString() }); setStatus(`${selectedDoc.name} saved in ${round}. Its original file type and content are preserved.`); }
  async function deleteTemplate() { if (!window.confirm(`Delete ${selectedDoc.name} from ${round}?`)) return; await removeFile(selectedDoc.id); updateDoc({ file: '', fileType: undefined, extension: undefined, size: undefined, savedAt: undefined }); setStatus(`${selectedDoc.name} deleted from ${round}.`); }
  async function uploadTxt(file: File) { setSource(await file.text()); setPanel('Source Data'); setStatus(`${file.name} loaded. Select the letter round to use.`); }
  async function generate() {
    if (blockers.length || (strict && missing.length)) { setPanel('Generate'); setStatus('Resolve the listed items before generation.'); return; }
    const result: Output[] = [];
    for (const route of routes) {
      const selectedPacket = roundPackets.find((item) => item.kind === route.kind)!;
      for (const doc of selectedPacket.docs.filter((item) => item.file)) {
        const original = await retrieveFile(doc.id);
        if (!original) continue;
        const outputName = `${clean(parsed.name)}_${clean(round)}_${route.bureau}_${route.kind}_${clean(doc.name)}${doc.extension || ext(original.name)}`;
        result.push({ id: `${route.bureau}-${route.kind}-${doc.id}`, name: outputName, packet: selectedPacket.name, document: doc.name, bureau: route.bureau, kind: route.kind, fileType: original.type || doc.fileType || 'Original file', blob: original });
      }
    }
    setOutputs(result); setPanel('Outputs'); setStatus(`${result.length} original-format file copies prepared for ${round}. No template content or formatting was changed.`);
  }
  function stepClass(item: Panel) { const current = workflow.indexOf(panel); const position = workflow.indexOf(item); return item === panel ? 'current' : position >= 0 && current >= 0 && position < current ? 'complete' : ''; }
  function roundSelector() { return <nav className="stepper" aria-label="Letter round">{rounds.map((item, index) => <button key={item} className={item === round ? 'current' : ''} onClick={() => changeRound(item)}><i>{index + 1}</i><span>{item}</span></button>)}</nav>; }

  function templatesView() { return <><div className="panel" style={{ marginBottom: 18 }}><div className="panel-heading"><div><h2>Template round</h2><p>Each round has its own separate dispute and late-payment templates.</p></div><Pill tone="accent">{round}</Pill></div>{roundSelector()}</div><div className="content-grid"><section className="panel"><div className="panel-heading"><div><h2>{round} packets</h2><p>Original uploaded files are stored exactly as uploaded.</p></div><Pill tone={savedCount ? 'success' : 'neutral'}>{savedCount}/{roundDocs.length} saved</Pill></div><div className="packet-picker" role="tablist" aria-label="Packet type">{roundPackets.map((item) => <button key={item.id} role="tab" aria-selected={item.id === packet.id} className={`packet ${item.id === packet.id ? 'selected' : ''}`} onClick={() => choosePacket(item)}><span>{item.name}</span><small>{item.description}</small><b>{item.docs.filter((doc) => doc.file).length}/{item.docs.length}</b></button>)}</div><div className="documents">{packet.docs.map((doc, index) => <button key={doc.id} className={`document ${doc.id === selectedDoc.id ? 'selected' : ''}`} onClick={() => setDocumentId(doc.id)}><i>{index + 1}</i><span><strong>{doc.name}</strong><small>{doc.file || 'No file uploaded'}</small></span><Pill tone={doc.file ? 'success' : 'warning'}>{doc.file ? 'Saved' : 'Pending'}</Pill></button>)}</div></section><section className="panel editor-panel"><div className="panel-heading"><div><h2>{selectedDoc.name}</h2><p>{packet.name}</p></div><Pill tone={selectedDoc.file ? 'success' : 'warning'}>{selectedDoc.file ? 'Saved' : 'Pending'}</Pill></div>{selectedDoc.file ? <div className="saved-file"><strong>{selectedDoc.file}</strong><span>{size(selectedDoc.size)} · {selectedDoc.extension || 'original file type'}</span><p>Preserved unchanged until you replace or delete it.</p></div> : <div className="upload-empty"><p>No template assigned to this document.</p></div>}<label className="field-label">{selectedDoc.file ? 'Replace original file' : 'Upload original file'}<input className="file-input" type="file" accept=".docx,.pdf,.png,.jpg,.jpeg" onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadTemplate(file); event.target.value = ''; }} /></label>{selectedDoc.file && <button className="delete-button" onClick={() => void deleteTemplate()}>Delete saved file</button>}<label className="switch-row"><input type="checkbox" checked={selectedDoc.placeholders} onChange={(event) => updateDoc({ placeholders: event.target.checked })} /><span>Contains approved placeholders</span></label>{selectedDoc.placeholders && <label className="field-label">Approved placeholders<textarea className="code-area" value={selectedDoc.fields} onChange={(event) => updateDoc({ fields: event.target.value })} /></label>}</section></div></>; }
  function sourceView() { return <div className="content-grid"><section className="panel"><div className="panel-heading"><div><h2>Source text</h2><p>Upload or paste the client TXT source.</p></div></div><label className="field-label">Import .txt file<input className="file-input" type="file" accept=".txt" onChange={(event) => event.target.files?.[0] && uploadTxt(event.target.files[0])} /></label><textarea className="source-area" value={source} onChange={(event) => setSource(event.target.value)} placeholder="Paste TXT source here…" /></section><section className="panel"><div className="panel-heading"><div><h2>Choose letter round</h2><p>The imported source will use templates from this round.</p></div><Pill tone="accent">{round}</Pill></div>{roundSelector()}<div className="panel-heading" style={{ marginTop: 20 }}><div><h2>Detected routes</h2><p>{parsed.name || 'No consumer loaded'}</p></div><Pill tone={routes.length ? 'success' : 'neutral'}>{routes.length} routes</Pill></div><div className="route-table">{bureaus.map((bureau) => <div className="bureau" key={bureau}><strong>{bureau}</strong><Pill tone={parsed.dispute[bureau].length ? 'success' : 'neutral'}>Dispute</Pill><Pill tone={parsed.late[bureau].length ? 'success' : 'neutral'}>Late Payment</Pill></div>)}</div><button className="action-button" onClick={() => setPanel('Generate')}>Continue with {round}</button></section></div>; }
  function generateView() { return <div className="content-grid"><section className="panel"><div className="panel-heading"><div><h2>Generate from {round}</h2><p>One routed copy per uploaded packet document and detected bureau.</p></div><Pill tone={routes.length ? 'accent' : 'neutral'}>{routes.length} routes</Pill></div>{routes.length ? <div className="route-list">{routes.map((route) => <div className="route-card" key={`${route.bureau}-${route.kind}`}><strong>{route.bureau}</strong><span>{route.kind === 'LATE_PAYMENT' ? 'Late Payment' : 'Dispute'}</span><small>{roundPackets.find((item) => item.kind === route.kind)?.name}</small></div>)}</div> : <EmptyState title="No routes detected" text="Add TXT source data before generation." />}<button className="action-button" onClick={() => void generate()}>Create original-format copies</button></section><section className="panel"><div className="panel-heading"><div><h2>Preservation mode</h2><p>Safe template handling for your setup process.</p></div></div><div className="alert success">Templates are exported in their original file type and exact original binary content.</div><div className="alert error">Placeholder replacement is not applied in this safe-copy stage; enabling it later will require DOCX-specific rendering tests.</div>{blockers.map((item) => <div className="alert error" key={item}>{item}</div>)}{missing.length > 0 && <div className="pending-list"><p>{missing.length} files pending in {round}; they do not block setup.</p>{missing.slice(0, 5).map((item) => <span key={item}>{item}</span>)}</div>}</section></div>; }
  function outputsView() { return <section className="panel outputs"><div className="panel-heading"><div><h2>{round} outputs</h2><p>Every output preserves the uploaded file type and original content.</p></div><Pill tone={outputs.length ? 'success' : 'neutral'}>{outputs.length} files</Pill></div>{outputs.length ? <div className="output-list">{outputs.map((item) => <article className="output" key={item.id}><div><Pill tone="accent">{item.bureau}</Pill><h3>{item.name}</h3><p>{item.packet} · {item.document} · {item.fileType}</p></div><button className="secondary-button" onClick={() => downloadBlob(item.name, item.blob)}>Download</button></article>)}</div> : <EmptyState title="No outputs available" text="Choose a round, load source data, then generate files." />}</section>; }
  function settingsView() { return <section className="panel settings"><div className="panel-heading"><div><h2>Preferences</h2><p>Generation and storage controls.</p></div></div><label className="setting"><input type="checkbox" checked={strict} onChange={(event) => setStrict(event.target.checked)} /><span><strong>Strict template validation</strong><small>Require every document in the selected round before generation.</small></span></label><div className="info-card"><strong>Original-file preservation is enabled</strong><p>Uploaded DOCX, PDF and image files are stored privately in the browser and exported in the same file type without modifying formatting or content.</p></div></section>; }

  return <main className="app-shell"><aside className="sidebar"><div className="brand"><span /><div><strong>LetterGenerator</strong><small>Round-based workspace</small></div></div><nav aria-label="Primary navigation">{navigation.map((item) => <button key={item.id} className={panel === item.id ? 'active' : ''} onClick={() => setPanel(item.id)}><strong>{item.label}</strong><small>{item.description}</small></button>)}</nav><div className="storage-progress"><div><strong>{savedCount}/{roundDocs.length}</strong><small>{round} templates saved</small></div><div className="bar"><span style={{ width: `${(savedCount / roundDocs.length) * 100}%` }} /></div></div></aside><section className="main-area"><header className="header"><div><p className="eyebrow">{round} workflow</p><h1>{panel}</h1></div><button className="header-action" onClick={() => setPanel('Generate')}>Generate</button></header><nav className="stepper" aria-label="Workflow steps">{workflow.map((step, index) => <button key={step} className={stepClass(step)} onClick={() => setPanel(step)}><i>{index + 1}</i><span>{step}</span></button>)}</nav>{panel === 'Templates' && templatesView()}{panel === 'Source Data' && sourceView()}{panel === 'Generate' && generateView()}{panel === 'Outputs' && outputsView()}{panel === 'Settings' && settingsView()}<div className="toast" role="status" aria-live="polite">{status}</div></section></main>;
}
