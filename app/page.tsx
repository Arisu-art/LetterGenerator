'use client';

import { useEffect, useMemo, useState } from 'react';

type Bureau = 'TRANSUNION' | 'EQUIFAX' | 'EXPERIAN';
type Panel = 'Templates' | 'Source Data' | 'Generate' | 'Outputs' | 'Settings';
type Kind = 'DISPUTE' | 'LATE_PAYMENT';
type Doc = { id: string; name: string; file: string; size?: number; savedAt?: string; placeholders: boolean; fields: string };
type Packet = { id: string; kind: Kind; name: string; docs: Doc[] };
type Parsed = { name: string; address: string[]; dob: string; ssn: string; dispute: Record<Bureau, string[]>; late: Record<Bureau, string[]> };
type Route = { bureau: Bureau; kind: Kind; records: string[] };
type Output = { name: string; packet: string; content: string };

const nav: Panel[] = ['Templates', 'Source Data', 'Generate', 'Outputs', 'Settings'];
const bureaus: Bureau[] = ['TRANSUNION', 'EQUIFAX', 'EXPERIAN'];
const storageKey = 'lettergenerator.first-round.library.v2';
const dbName = 'lettergenerator-private-templates';
const storeName = 'files';
const commonFields = '{{consumer.name}}\n{{consumer.address}}\n{{consumer.dob}}\n{{consumer.ssn}}\n{{today.us_long}}\n{{bureau.name}}\n{{bureau.address}}\n{{accounts_block}}';
const addresses: Record<Bureau, string> = {
  TRANSUNION: 'TransUnion LLC\nP.O. Box 2000\nChester, PA 19016-2000',
  EQUIFAX: 'Equifax Information Services LLC\nPO Box 105139\nAtlanta, GA 30348',
  EXPERIAN: 'Experian\nPO Box 4500\nAllen, TX 75013'
};

function seedPackets(): Packet[] {
  return [
    {
      id: 'first-dispute', kind: 'DISPUTE', name: '1st Round Dispute Packet', docs: [
        { id: 'dispute-letter', name: 'Dispute Letter', file: '', placeholders: true, fields: commonFields },
        { id: 'dispute-support', name: 'Supporting Documents', file: '', placeholders: true, fields: '{{consumer.name}}\n{{consumer.address}}\n{{today.us_long}}' },
        { id: 'dispute-fcra', name: 'FCRA', file: '', placeholders: true, fields: '{{consumer.name}}\n{{today.us_long}}' },
        { id: 'dispute-affidavit', name: 'Affidavit', file: '', placeholders: true, fields: commonFields },
        { id: 'dispute-attachment', name: 'Attachment', file: '', placeholders: false, fields: '' },
        { id: 'dispute-ftc', name: 'FTC', file: '', placeholders: true, fields: commonFields }
      ]
    },
    {
      id: 'first-late', kind: 'LATE_PAYMENT', name: '1st Round Late Payment Packet', docs: [
        { id: 'late-letter', name: 'Late Payment Letter', file: '', placeholders: true, fields: commonFields },
        { id: 'late-support', name: 'Supporting Documents', file: '', placeholders: true, fields: '{{consumer.name}}\n{{consumer.address}}\n{{today.us_long}}' }
      ]
    }
  ];
}
function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(dbName, 1);
    request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains(storeName)) request.result.createObjectStore(storeName); };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
async function keepFile(id: string, file: File) {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => { const transaction = db.transaction(storeName, 'readwrite'); transaction.objectStore(storeName).put(file, id); transaction.oncomplete = () => resolve(); transaction.onerror = () => reject(transaction.error); });
  db.close();
}
async function removeFile(id: string) {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => { const transaction = db.transaction(storeName, 'readwrite'); transaction.objectStore(storeName).delete(id); transaction.oncomplete = () => resolve(); transaction.onerror = () => reject(transaction.error); });
  db.close();
}
function blank(): Parsed { return { name: '', address: [], dob: '', ssn: '', dispute: { TRANSUNION: [], EQUIFAX: [], EXPERIAN: [] }, late: { TRANSUNION: [], EQUIFAX: [], EXPERIAN: [] } }; }
function bureauFrom(value: string): Bureau | '' {
  const key = value.trim().replace(/:$/, '').toUpperCase();
  if (key === 'TRANSUNION' || key === 'TRANS UNION' || key === 'TU') return 'TRANSUNION';
  if (key === 'EQUIFAX' || key === 'EQ') return 'EQUIFAX';
  if (key === 'EXPERIAN' || key === 'EXP') return 'EXPERIAN';
  return '';
}
function parseSource(text: string): Parsed {
  const result = blank(); const header: string[] = []; let section = 'header'; let bureau: Bureau | '' = '';
  text.split(/\r?\n/).forEach((raw) => {
    const line = raw.trim(); if (!line) return;
    const key = line.replace(/:$/, '').toUpperCase();
    if (key.startsWith('DISPUTE')) { section = 'dispute'; bureau = ''; return; }
    if (key.startsWith('LATE')) { section = 'late'; bureau = ''; return; }
    if (key.startsWith('OPEN') || key.startsWith('HARD')) { section = 'skip'; bureau = ''; return; }
    const nextBureau = bureauFrom(line); if (nextBureau) { bureau = nextBureau; return; }
    if (section === 'header') header.push(line);
    if (section === 'dispute' && bureau) result.dispute[bureau].push(line);
    if (section === 'late' && bureau) result.late[bureau].push(line);
  });
  result.name = header[0] || '';
  result.dob = (header.find((item) => /^DOB:/i.test(item)) || '').replace(/^DOB:\s*/i, '');
  result.ssn = (header.find((item) => /^SSN:/i.test(item)) || '').replace(/^SSN:\s*/i, '');
  result.address = header.slice(1).filter((item) => !/^(DOB|SSN):/i.test(item));
  return result;
}
function safeName(value: string) { return (value || 'CLIENT').replace(/[^a-z0-9]+/gi, '_').replace(/^_|_$/g, '').toUpperCase(); }
function bytes(value?: number) { if (!value) return ''; return value > 1048576 ? `${(value / 1048576).toFixed(1)} MB` : `${(value / 1024).toFixed(1)} KB`; }
function download(name: string, content: string) { const url = URL.createObjectURL(new Blob([content], { type: 'text/plain' })); const link = document.createElement('a'); link.href = url; link.download = name; link.click(); URL.revokeObjectURL(url); }

export default function Page() {
  const [panel, setPanel] = useState<Panel>('Templates');
  const [packets, setPackets] = useState<Packet[]>(seedPackets);
  const [packetId, setPacketId] = useState('first-dispute');
  const [documentId, setDocumentId] = useState('dispute-letter');
  const [source, setSource] = useState('');
  const [outputs, setOutputs] = useState<Output[]>([]);
  const [strict, setStrict] = useState(false);
  const [status, setStatus] = useState('Set up your first-round templates. Files stay saved until you replace or delete them.');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try { const existing = localStorage.getItem(storageKey); if (existing) { setPackets(JSON.parse(existing) as Packet[]); setStatus('Saved first-round templates restored.'); } } catch { setStatus('Templates are ready for new uploads.'); }
    setReady(true);
  }, []);
  useEffect(() => { if (ready) localStorage.setItem(storageKey, JSON.stringify(packets)); }, [packets, ready]);

  const packet = packets.find((item) => item.id === packetId) || packets[0];
  const document = packet.docs.find((item) => item.id === documentId) || packet.docs[0];
  const parsed = useMemo(() => parseSource(source), [source]);
  const routes: Route[] = useMemo(() => bureaus.flatMap((bureau) => [
    parsed.dispute[bureau].length ? { bureau, kind: 'DISPUTE' as Kind, records: parsed.dispute[bureau] } : null,
    parsed.late[bureau].length ? { bureau, kind: 'LATE_PAYMENT' as Kind, records: parsed.late[bureau] } : null
  ].filter(Boolean) as Route[]), [parsed]);
  const missing = packets.flatMap((item) => item.docs.filter((doc) => !doc.file).map((doc) => `${item.name}: ${doc.name}`));
  const blockers = [!source.trim() ? 'Upload or paste a TXT source first.' : '', source.trim() && !parsed.name ? 'Consumer name was not detected.' : '', source.trim() && !routes.length ? 'No dispute or late-payment data detected.' : ''].filter(Boolean);
  const uploadedCount = packets.flatMap((item) => item.docs).filter((doc) => doc.file).length;
  const totalCount = packets.flatMap((item) => item.docs).length;

  function pickPacket(next: Packet) { setPacketId(next.id); setDocumentId(next.docs[0].id); }
  function updateDoc(change: Partial<Doc>) { setPackets((current) => current.map((item) => item.id !== packet.id ? item : { ...item, docs: item.docs.map((doc) => doc.id === document.id ? { ...doc, ...change } : doc) })); }
  async function uploadTemplate(file: File) { await keepFile(document.id, file); updateDoc({ file: file.name, size: file.size, savedAt: new Date().toISOString() }); setStatus(`${document.name} saved. It will remain here until replaced or deleted.`); }
  async function deleteTemplate() { await removeFile(document.id); updateDoc({ file: '', size: undefined, savedAt: undefined }); setStatus(`${document.name} removed.`); }
  async function uploadTxt(file: File) { setSource(await file.text()); setStatus(`${file.name} loaded.`); }
  function generate() {
    if (blockers.length || (strict && missing.length)) { setPanel('Generate'); setStatus('Resolve the items shown below before generation.'); return; }
    const date = new Date().toISOString().slice(0, 10);
    const generated = routes.map((route) => { const selected = packets.find((item) => item.kind === route.kind)!; const content = [selected.name, route.bureau, '', parsed.name, ...parsed.address, '', addresses[route.bureau], '', 'Included files:', ...selected.docs.map((doc) => `- ${doc.name}: ${doc.file || 'Pending during setup'}`), '', 'Source records:', ...route.records].join('\n'); return { name: `${safeName(parsed.name)}_1ST_ROUND_${route.bureau}_${route.kind}_${date}.txt`, packet: selected.name, content }; });
    setOutputs(generated); setPanel('Outputs'); setStatus(`${generated.length} first-round packet preview(s) generated.`);
  }
  function templatesView() {
    return <div className="work-layout"><section className="surface"><div className="section-title"><div><h2>1st Round Templates</h2><p>Choose a packet and save each document once.</p></div><span className="pill">{uploadedCount}/{totalCount} saved</span></div><div className="packet-grid">{packets.map((item) => <button key={item.id} className={`packet-card ${item.id === packet.id ? 'chosen' : ''}`} onClick={() => pickPacket(item)}><strong>{item.name}</strong><span>{item.kind === 'DISPUTE' ? '6 documents' : '2 documents'}</span><small>{item.docs.filter((doc) => doc.file).length} saved</small></button>)}</div><div className="doc-list">{packet.docs.map((doc, index) => <button key={doc.id} className={`doc-row ${doc.id === document.id ? 'chosen' : ''}`} onClick={() => setDocumentId(doc.id)}><b>{index + 1}</b><span><strong>{doc.name}</strong><small>{doc.file || 'Not uploaded'}</small></span><em className={doc.file ? 'saved' : ''}>{doc.file ? 'Saved' : 'Pending'}</em></button>)}</div></section><section className="surface editor"><h2>{document.name}</h2><p className="subtle">{packet.name}</p>{document.file && <div className="saved-box"><strong>Saved template</strong><span>{document.file}{document.size ? ` · ${bytes(document.size)}` : ''}</span><small>Remains saved until replaced or deleted.</small></div>}<label className="control">{document.file ? 'Replace template file' : 'Upload template file'}<input type="file" accept=".docx,.pdf,.png,.jpg,.jpeg" onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadTemplate(file); event.target.value = ''; }} /></label>{document.file && <button className="danger" onClick={() => void deleteTemplate()}>Delete saved file</button>}<label className="check"><input type="checkbox" checked={document.placeholders} onChange={(event) => updateDoc({ placeholders: event.target.checked })} /> Contains placeholders</label>{document.placeholders && <label className="control">Approved placeholders<textarea className="code-input" value={document.fields} onChange={(event) => updateDoc({ fields: event.target.value })} /></label>}</section></div>;
  }
  function sourceView() { return <div className="work-layout"><section className="surface"><h2>Source Data</h2><p className="subtle">Paste or upload the TXT containing DISPUTE and LATE PAYMENT sections.</p><label className="control">Upload TXT<input type="file" accept=".txt" onChange={(event) => event.target.files?.[0] && uploadTxt(event.target.files[0])} /></label><textarea className="source-input" value={source} onChange={(event) => setSource(event.target.value)} placeholder="Paste TXT source here..." /></section><section className="surface"><h2>Detected Routes</h2><p className="client-name">{parsed.name || 'No consumer detected'}</p>{bureaus.map((bureau) => <div className="route-row" key={bureau}><strong>{bureau}</strong><span className={parsed.dispute[bureau].length ? 'on' : ''}>Dispute</span><span className={parsed.late[bureau].length ? 'on' : ''}>Late Payment</span></div>)}</section></div>; }
  function generateView() { return <div className="work-layout"><section className="surface"><div className="section-title"><div><h2>Generate 1st Round</h2><p>Creates one packet route per bureau and letter type found.</p></div><span className="pill">{routes.length} ready</span></div>{routes.length ? routes.map((route) => <div className="route-job" key={`${route.bureau}-${route.kind}`}><strong>{route.bureau}</strong><span>{route.kind.replace('_', ' ')}</span><small>{packets.find((item) => item.kind === route.kind)?.name}</small></div>) : <p className="empty">Add source data to see routes.</p>}<button className="primary wide" onClick={generate}>Generate Preview Packets</button></section><section className="surface"><h2>Checks</h2>{blockers.map((item) => <div className="warning" key={item}>{item}</div>)}{!blockers.length && <div className="success-box">Routing is ready.</div>}{missing.length > 0 && <><p className="subtle space-top">Missing templates are allowed during setup.</p>{missing.slice(0, 6).map((item) => <div className="pending" key={item}>{item}</div>)}</>}</section></div>; }
  function outputsView() { return <section className="surface"><div className="section-title"><div><h2>Generated Outputs</h2><p>Prototype manifests for first-round routing.</p></div></div>{outputs.length ? outputs.map((item) => <div className="output-row" key={item.name}><div><strong>{item.name}</strong><small>{item.packet}</small></div><button className="soft-button" onClick={() => download(item.name, item.content)}>Download</button></div>) : <p className="empty">No generated outputs yet.</p>}</section>; }
  function settingsView() { return <section className="surface narrow"><h2>Settings</h2><label className="setting-row"><input type="checkbox" checked={strict} onChange={(event) => setStrict(event.target.checked)} /><span><strong>Strict template requirement</strong><small>Keep off while setting up first-round documents.</small></span></label><div className="privacy">Uploaded templates are saved privately in your browser, not in the public repository.</div></section>; }
  return <main className="app"><aside className="side"><div className="logo"><span /> <div><strong>LetterGenerator</strong><small>First Round Setup</small></div></div><nav>{nav.map((item) => <button key={item} className={panel === item ? 'active' : ''} onClick={() => setPanel(item)}>{item}</button>)}</nav><div className="progress"><strong>{uploadedCount}/{totalCount}</strong><small>templates saved</small><div><span style={{ width: `${(uploadedCount / totalCount) * 100}%` }} /></div></div></aside><section className="workspace"><header className="top"><div><p className="overline">1st Round Workflow</p><h1>{panel}</h1></div><button className="primary" onClick={() => setPanel('Generate')}>Generate</button></header>{panel === 'Templates' && templatesView()}{panel === 'Source Data' && sourceView()}{panel === 'Generate' && generateView()}{panel === 'Outputs' && outputsView()}{panel === 'Settings' && settingsView()}<footer className="status">{status}</footer></section></main>;
}
