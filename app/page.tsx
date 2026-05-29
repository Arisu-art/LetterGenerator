'use client';

import { useEffect, useMemo, useState } from 'react';

type Bureau = 'TRANSUNION' | 'EQUIFAX' | 'EXPERIAN';
type Panel = 'Dashboard' | 'Templates' | 'TXT Source' | 'Generator' | 'Validation' | 'Output Files' | 'GitHub Sync' | 'Settings';
type Round = '1st Round' | '2nd Round' | '3rd Round' | 'Final';
type Kind = 'DISPUTE' | 'LATE_PAYMENT';
type Doc = { id: string; name: string; required: boolean; placeholders: boolean; fields: string; file: string; size?: number; savedAt?: string };
type Packet = { id: string; round: Round; kind: Kind; name: string; active: boolean; docs: Doc[] };
type Parsed = { name: string; address: string[]; dob: string; ssn: string; dispute: Record<Bureau, string[]>; late: Record<Bureau, string[]> };
type Output = { name: string; packet: string; bureau: Bureau; kind: Kind; content: string };

const bureaus: Bureau[] = ['TRANSUNION', 'EQUIFAX', 'EXPERIAN'];
const rounds: Round[] = ['1st Round', '2nd Round', '3rd Round', 'Final'];
const nav: Panel[] = ['Dashboard', 'Templates', 'TXT Source', 'Generator', 'Validation', 'Output Files', 'GitHub Sync', 'Settings'];
const metadataKey = 'lettergenerator.packet.library.v1';
const dbName = 'lettergenerator-private-template-files';
const storeName = 'files';
const fields = '{{consumer.name}}\n{{consumer.address}}\n{{consumer.dob}}\n{{consumer.ssn}}\n{{today.us_long}}\n{{bureau.name}}\n{{bureau.address}}\n{{accounts_block}}';
const addresses: Record<Bureau, string> = {
  TRANSUNION: 'TransUnion LLC\nP.O. Box 2000\nChester, PA 19016-2000',
  EQUIFAX: 'Equifax Information Services LLC\nPO Box 105139\nAtlanta, GA 30348',
  EXPERIAN: 'Experian\nPO Box 4500\nAllen, TX 75013'
};

function disputeDocs(prefix: string): Doc[] { return [
  { id: `${prefix}-letter`, name: 'Letter for Dispute', required: true, placeholders: true, fields, file: '' },
  { id: `${prefix}-support`, name: 'Supporting Documents', required: true, placeholders: true, fields: '{{consumer.name}}\n{{consumer.address}}\n{{today.us_long}}', file: '' },
  { id: `${prefix}-fcra`, name: 'FCRA', required: true, placeholders: true, fields: '{{consumer.name}}\n{{today.us_long}}', file: '' },
  { id: `${prefix}-affidavit`, name: 'Affidavit', required: true, placeholders: true, fields, file: '' },
  { id: `${prefix}-attachment`, name: 'Attachment', required: true, placeholders: false, fields: '', file: '' },
  { id: `${prefix}-ftc`, name: 'FTC', required: true, placeholders: true, fields, file: '' }
]; }
function lateDocs(prefix: string): Doc[] { return [
  { id: `${prefix}-letter`, name: 'Late Payment Letter', required: true, placeholders: true, fields, file: '' },
  { id: `${prefix}-support`, name: 'Supporting Documents', required: true, placeholders: true, fields: '{{consumer.name}}\n{{consumer.address}}\n{{today.us_long}}', file: '' }
]; }
function librarySeed(): Packet[] { return rounds.flatMap((round, index) => [
  { id: `r${index}-dispute`, round, kind: 'DISPUTE', name: `${round} Dispute Packet`, active: true, docs: disputeDocs(`r${index}-dispute`) },
  { id: `r${index}-late`, round, kind: 'LATE_PAYMENT', name: `${round} Late Payment Packet`, active: true, docs: lateDocs(`r${index}-late`) }
]); }
function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(dbName, 1);
    request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains(storeName)) request.result.createObjectStore(storeName); };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
async function savePrivateFile(id: string, file: File) {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => { const tx = db.transaction(storeName, 'readwrite'); tx.objectStore(storeName).put(file, id); tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); });
  db.close();
}
async function deletePrivateFile(id: string) {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => { const tx = db.transaction(storeName, 'readwrite'); tx.objectStore(storeName).delete(id); tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); });
  db.close();
}
function emptyParsed(): Parsed { return { name: '', address: [], dob: '', ssn: '', dispute: { TRANSUNION: [], EQUIFAX: [], EXPERIAN: [] }, late: { TRANSUNION: [], EQUIFAX: [], EXPERIAN: [] } }; }
function bureauOf(value: string): Bureau | '' { const v = value.trim().replace(/:$/, '').toUpperCase(); return v === 'TRANSUNION' || v === 'TRANS UNION' ? 'TRANSUNION' : v === 'EQUIFAX' ? 'EQUIFAX' : v === 'EXPERIAN' ? 'EXPERIAN' : ''; }
function parse(text: string): Parsed {
  const result = emptyParsed(); const header: string[] = []; let type = 'header'; let bureau: Bureau | '' = '';
  text.split(/\r?\n/).forEach((raw) => { const line = raw.trim(); if (!line) return; const key = line.replace(/:$/, '').toUpperCase();
    if (key.startsWith('DISPUTE')) { type = 'dispute'; bureau = ''; return; }
    if (key.startsWith('LATE')) { type = 'late'; bureau = ''; return; }
    if (key.startsWith('HARD') || key.startsWith('OPEN')) { type = 'ignore'; bureau = ''; return; }
    const found = bureauOf(line); if (found) { bureau = found; return; }
    if (type === 'header') header.push(line);
    if (type === 'dispute' && bureau) result.dispute[bureau].push(line);
    if (type === 'late' && bureau) result.late[bureau].push(line);
  });
  result.name = header[0] || ''; result.dob = (header.find((x) => /^DOB:/i.test(x)) || '').replace(/^DOB:\s*/i, ''); result.ssn = (header.find((x) => /^SSN:/i.test(x)) || '').replace(/^SSN:\s*/i, ''); result.address = header.slice(1).filter((x) => !/^(DOB|SSN):/i.test(x)); return result;
}
function filename(value: string) { return (value || 'CLIENT').replace(/[^a-z0-9]+/gi, '_').replace(/^_|_$/g, '').toUpperCase(); }
function download(name: string, content: string) { const url = URL.createObjectURL(new Blob([content], { type: 'text/plain' })); const link = document.createElement('a'); link.href = url; link.download = name; link.click(); URL.revokeObjectURL(url); }
function formatBytes(bytes?: number) { if (!bytes) return ''; if (bytes < 1024) return `${bytes} B`; if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`; return `${(bytes / 1048576).toFixed(1)} MB`; }

export default function Page() {
  const [panel, setPanel] = useState<Panel>('Templates');
  const [library, setLibrary] = useState<Packet[]>(librarySeed);
  const [hydrated, setHydrated] = useState(false);
  const [selectedRound, setSelectedRound] = useState<Round>('1st Round');
  const [generationRound, setGenerationRound] = useState<Round>('1st Round');
  const [packetId, setPacketId] = useState('r0-dispute');
  const [docId, setDocId] = useState('r0-dispute-letter');
  const [source, setSource] = useState('');
  const [outputs, setOutputs] = useState<Output[]>([]);
  const [strict, setStrict] = useState(false);
  const [status, setStatus] = useState('Loading saved packet templates...');

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(metadataKey);
      if (stored) { setLibrary(JSON.parse(stored) as Packet[]); setStatus('Saved templates restored. Files remain stored until replaced or deleted.'); }
      else setStatus('Prototype mode: upload templates once; they will be saved in this browser until deleted or replaced.');
    } catch { setStatus('Template metadata could not be restored; new uploads will be saved.'); }
    setHydrated(true);
  }, []);
  useEffect(() => { if (hydrated) window.localStorage.setItem(metadataKey, JSON.stringify(library)); }, [library, hydrated]);

  const parsed = useMemo(() => parse(source), [source]);
  const selectedPackets = library.filter((packet) => packet.round === selectedRound);
  const packet = library.find((item) => item.id === packetId) || selectedPackets[0];
  const doc = packet?.docs.find((item) => item.id === docId) || packet?.docs[0];
  const roundPackets = library.filter((item) => item.round === generationRound && item.active);
  const routes = useMemo(() => bureaus.flatMap((bureau) => [parsed.dispute[bureau].length ? { bureau, kind: 'DISPUTE' as Kind, rows: parsed.dispute[bureau] } : null, parsed.late[bureau].length ? { bureau, kind: 'LATE_PAYMENT' as Kind, rows: parsed.late[bureau] } : null].filter(Boolean) as { bureau: Bureau; kind: Kind; rows: string[] }[]), [parsed]);
  const blockers = useMemo(() => { const list: string[] = []; if (!source.trim()) list.push('TXT source is required before generation.'); if (source.trim() && !parsed.name) list.push('Consumer name could not be detected.'); if (source.trim() && !routes.length) list.push('No dispute or late-payment bureau records were detected.'); routes.forEach((route) => { if (!roundPackets.some((item) => item.kind === route.kind)) list.push(`No active ${route.kind.replace('_', ' ')} packet configured for ${generationRound}.`); }); return Array.from(new Set(list)); }, [source, parsed.name, routes, roundPackets, generationRound]);
  const pending = useMemo(() => routes.flatMap((route) => { const chosen = roundPackets.find((item) => item.kind === route.kind); return chosen ? chosen.docs.filter((item) => item.required && !item.file).map((item) => `${chosen.name}: ${item.name} is not uploaded yet.`) : []; }), [routes, roundPackets]);
  const activeErrors = strict ? [...blockers, ...pending] : blockers;

  function selectRound(round: Round) { setSelectedRound(round); const first = library.find((item) => item.round === round); if (first) { setPacketId(first.id); setDocId(first.docs[0].id); } }
  function selectPacket(next: Packet) { setPacketId(next.id); setDocId(next.docs[0].id); }
  function patchPacket(change: Partial<Packet>) { if (!packet) return; setLibrary((current) => current.map((item) => item.id === packet.id ? { ...item, ...change } : item)); }
  function patchDoc(change: Partial<Doc>) { if (!packet || !doc) return; setLibrary((current) => current.map((item) => item.id !== packet.id ? item : { ...item, docs: item.docs.map((part) => part.id === doc.id ? { ...part, ...change } : part) })); }
  async function uploadDocument(file: File) { if (!doc) return; await savePrivateFile(doc.id, file); patchDoc({ file: file.name, size: file.size, savedAt: new Date().toISOString() }); setStatus(`${file.name} saved for ${doc.name}. It remains saved until you replace or delete it.`); }
  async function removeDocument() { if (!doc) return; await deletePrivateFile(doc.id); patchDoc({ file: '', size: undefined, savedAt: undefined }); setStatus(`${doc.name} deleted from its packet.`); }
  async function uploadText(file: File) { setSource(await file.text()); setStatus(`Loaded source: ${file.name}`); }
  function generate() {
    if (activeErrors.length) { setPanel('Validation'); setStatus('Resolve blockers before generating. Pending documents only block when strict mode is enabled.'); return; }
    const date = new Date().toISOString().slice(0, 10);
    const items = routes.map((route) => { const chosen = roundPackets.find((item) => item.kind === route.kind)!; const content = [`${chosen.name} - ${route.bureau}`, '', parsed.name, ...parsed.address, `DOB: ${parsed.dob}`, `SSN: ${parsed.ssn}`, '', addresses[route.bureau], '', 'Packet documents:', ...chosen.docs.map((part, index) => `${index + 1}. ${part.name}: ${part.file || 'Pending - allowed for prototype'}`), '', 'Source records:', ...route.rows].join('\n'); return { name: `${filename(parsed.name)}_${filename(generationRound)}_${route.bureau}_${route.kind}_${date}.txt`, bureau: route.bureau, kind: route.kind, packet: chosen.name, content }; });
    setOutputs(items); setPanel('Output Files'); setStatus(`Generated ${items.length} prototype packet manifest(s).`);
  }
  function bureauTable() { return <table className="table"><thead><tr><th>Bureau</th><th>Dispute</th><th>Late Payment</th></tr></thead><tbody>{bureaus.map((bureau) => <tr key={bureau}><td>{bureau}</td><td><span className={`badge ${parsed.dispute[bureau].length ? 'success' : 'warning'}`}>{parsed.dispute[bureau].length ? 'Detected' : 'Skip'}</span></td><td><span className={`badge ${parsed.late[bureau].length ? 'success' : 'warning'}`}>{parsed.late[bureau].length ? 'Detected' : 'Skip'}</span></td></tr>)}</tbody></table>; }
  function templates() { return <div className="template-canvas"><section className="card"><p className="notice" style={{ margin: '0 0 18px' }}><strong>Saved templates:</strong> Uploaded files persist in this browser and remain assigned unless you press Delete or upload a replacement.</p><div className="canvas-head"><div><h2 className="card-title">Round Packet Library</h2><p className="card-copy">Dispute packets include six documents. Late-payment packets include two.</p></div></div><div className="round-tabs">{rounds.map((round) => <button key={round} className={`round-tab ${round === selectedRound ? 'selected' : ''}`} onClick={() => selectRound(round)}>{round}<small>2 packets</small></button>)}</div><div className="template-cards">{selectedPackets.map((item) => <button key={item.id} className={`template-card ${packet?.id === item.id ? 'selected' : ''}`} onClick={() => selectPacket(item)}><span className={`badge ${item.kind === 'DISPUTE' ? 'success' : 'warning'}`}>{item.kind.replace('_', ' ')}</span><strong>{item.name}</strong><small>{item.docs.filter((part) => part.file).length}/{item.docs.length} saved</small></button>)}</div>{packet && <div className="document-stack"><h3>{packet.name} documents</h3>{packet.docs.map((part, index) => <button key={part.id} className={`document-slot ${doc?.id === part.id ? 'selected' : ''}`} onClick={() => setDocId(part.id)}><span className="document-index">{index + 1}</span><span><strong>{part.name}</strong><small>{part.file ? `${part.file}${part.size ? ` · ${formatBytes(part.size)}` : ''}` : 'Not uploaded yet'}</small></span><span className={`badge ${part.file ? 'success' : 'warning'}`}>{part.file ? 'Saved' : 'Pending'}</span></button>)}</div>}</section>{packet && doc && <section className="card editor"><div className="canvas-head"><div><h2 className="card-title">Packet Editor</h2><p className="card-copy">{packet.round} · {packet.kind.replace('_', ' ')}</p></div><label className="toggle"><input type="checkbox" checked={packet.active} onChange={(event) => patchPacket({ active: event.target.checked })} /> Active</label></div><label className="field">Packet Name<input className="input" value={packet.name} onChange={(event) => patchPacket({ name: event.target.value })} /></label><div className="editor-divider" /><h3 className="document-editor-title">{doc.name}</h3>{doc.file && <div className="notice"><strong>Saved:</strong> {doc.file}{doc.size ? ` · ${formatBytes(doc.size)}` : ''}<br />This assignment stays saved until replaced or deleted.</div>}<label className="field">{doc.file ? 'Replace File' : 'Upload File'}<input className="input" type="file" accept=".docx,.pdf,.png,.jpg,.jpeg" onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadDocument(file); event.target.value = ''; }} /></label>{doc.file && <button className="btn secondary" onClick={() => void removeDocument()}>Delete Saved File</button>}<div className="document-options"><label className="toggle"><input type="checkbox" checked={doc.required} onChange={(event) => patchDoc({ required: event.target.checked })} /> Required in final production</label><label className="toggle"><input type="checkbox" checked={doc.placeholders} onChange={(event) => patchDoc({ placeholders: event.target.checked })} /> Has placeholders</label></div>{doc.placeholders && <label className="field">Approved Placeholders<textarea className="input compact code" value={doc.fields} onChange={(event) => patchDoc({ fields: event.target.value })} /></label>}<p className="notice">Prototype mode permits missing documents. Saved template files are kept privately in browser storage, not pushed to the public GitHub repository.</p></section>}</div>; }
  function content() {
    if (panel === 'Templates') return templates();
    if (panel === 'Dashboard') return <div className="grid cols-2"><section className="card"><h2 className="card-title">Current Scope</h2><p className="card-copy">Configure and test only 1st Round dispute and late-payment packets first.</p><div className="toolbar" style={{ marginTop: 18 }}><button className="btn" onClick={() => { selectRound('1st Round'); setPanel('Templates'); }}>Open 1st Round</button><button className="btn secondary" onClick={() => setPanel('Generator')}>Generate</button></div></section><section className="card"><h2 className="card-title">1st Round Coverage</h2>{library.filter((item) => item.round === '1st Round').map((item) => <div className="coverage" key={item.id}><strong>{item.name}</strong><span>{item.docs.filter((part) => part.file).length}/{item.docs.length} saved</span></div>)}</section></div>;
    if (panel === 'TXT Source') return <div className="grid cols-2"><section className="card"><h2 className="card-title">TXT Source</h2><input className="input" type="file" accept=".txt" onChange={(event) => event.target.files?.[0] && uploadText(event.target.files[0])} /><textarea className="input textarea" value={source} onChange={(event) => setSource(event.target.value)} placeholder="Paste TXT source here..." /></section><section className="card"><h2 className="card-title">Detected Data</h2><p><strong>{parsed.name || 'No consumer detected'}</strong></p><p className="card-copy">{parsed.address.join(' ') || 'No address detected'}</p>{bureauTable()}</section></div>;
    if (panel === 'Generator') return <div className="grid cols-2"><section className="card"><h2 className="card-title">Packet Generation</h2><label className="field">Round<select className="input" value={generationRound} onChange={(event) => setGenerationRound(event.target.value as Round)}>{rounds.map((round) => <option key={round}>{round}</option>)}</select></label>{bureauTable()}<div className="toolbar" style={{ marginTop: 18 }}><button className="btn" onClick={generate}>Generate {routes.length}</button><button className="btn secondary" onClick={() => setPanel('Validation')}>Review Status</button></div></section><section className="card"><h2 className="card-title">Prototype Mode</h2><p className="notice">Incomplete packets are allowed. Uploaded templates remain saved between refreshes.</p>{roundPackets.map((item) => <div className="packet-summary" key={item.id}><strong>{item.name}</strong><span className="badge warning">{item.docs.filter((part) => part.file).length}/{item.docs.length}</span></div>)}</section></div>;
    if (panel === 'Validation') return <section className="card"><h2 className="card-title">Validation Center</h2><p className="card-copy">Missing documents are warnings only unless strict mode is enabled.</p><table className="table" style={{ marginTop: 16 }}><tbody>{blockers.length ? blockers.map((item) => <tr key={item}><td><span className="badge warning">Blocker</span></td><td>{item}</td></tr>) : <tr><td><span className="badge success">Ready</span></td><td>No blocking source or routing errors.</td></tr>}{pending.map((item) => <tr key={item}><td><span className="badge warning">Pending</span></td><td>{item} This does not block prototype generation.</td></tr>)}</tbody></table></section>;
    if (panel === 'Output Files') return <section className="card"><h2 className="card-title">Generated Outputs</h2><p className="card-copy">Prototype packet manifests are available for download.</p><table className="table"><tbody>{outputs.length ? outputs.map((item) => <tr key={item.name}><td>{item.name}<br /><small>{item.packet}</small></td><td><button className="btn secondary" onClick={() => download(item.name, item.content)}>Download</button></td></tr>) : <tr><td>No output generated yet.</td></tr>}</tbody></table></section>;
    if (panel === 'GitHub Sync') return <section className="card"><h2 className="card-title">GitHub Sync</h2><p className="card-copy">Application source is synced to <strong>Arisu-art/LetterGenerator</strong>. Saved uploaded documents remain private in this browser storage and are not committed to a public repository.</p></section>;
    return <section className="card"><h2 className="card-title">Settings</h2><label className="setting"><input type="checkbox" checked={strict} onChange={(event) => setStrict(event.target.checked)} /> Strictly require all packet documents before generation</label><p className="notice">Keep strict validation OFF while building the 1st Round workflows.</p><h3>Bureau Mailing Registry</h3><pre className="registry">{bureaus.map((bureau) => `${bureau}\n${addresses[bureau]}`).join('\n\n')}</pre></section>;
  }
  return <main className="shell"><aside className="sidebar"><div className="brand"><div className="brand-mark" /><div><div className="brand-title">LetterGenerator</div><div className="brand-subtitle">Packet operations</div></div></div><nav className="nav">{nav.map((item) => <button key={item} className={`nav-item ${panel === item ? 'active' : ''}`} onClick={() => setPanel(item)}>{item}</button>)}</nav><div className="sidebar-footer">Saved template files remain assigned until explicitly replaced or deleted.</div></aside><section className="main"><header className="header"><div><div className="eyebrow">{panel}</div><h1>{panel === 'Templates' ? 'Document Packet Canvas' : 'Letter Workflow Console'}</h1><p className="lead">Build the 1st Round dispute and late-payment document packets without losing uploaded template assignments.</p></div><div className="toolbar"><button className="btn secondary" onClick={() => setPanel('Validation')}>Status</button><button className="btn" onClick={generate}>Generate {routes.length}</button></div></header><div className="grid cols-3" style={{ marginBottom: 18 }}><div className="stat"><div className="stat-value">2</div><div className="stat-label">1st Round Packets</div></div><div className="stat"><div className="stat-value">{routes.length}</div><div className="stat-label">Ready Routes</div></div><div className="stat"><div className="stat-value">{outputs.length}</div><div className="stat-label">Generated</div></div></div>{content()}<p className="statusbar">{status}</p></section></main>;
}
