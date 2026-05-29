'use client';

import { useEffect, useMemo, useState } from 'react';

type Bureau = 'TRANSUNION' | 'EQUIFAX' | 'EXPERIAN';
type Panel = 'Templates' | 'Source Data' | 'Generate' | 'Outputs' | 'Settings';
type Kind = 'DISPUTE' | 'LATE_PAYMENT';
type Doc = { id: string; name: string; file: string; size?: number; savedAt?: string; placeholders: boolean; fields: string };
type Packet = { id: string; kind: Kind; name: string; description: string; docs: Doc[] };
type Parsed = { name: string; address: string[]; dob: string; ssn: string; dispute: Record<Bureau, string[]>; late: Record<Bureau, string[]> };
type Route = { bureau: Bureau; kind: Kind; records: string[] };
type Output = { name: string; packet: string; bureau: Bureau; kind: Kind; content: string };
type Tone = 'neutral' | 'success' | 'warning' | 'accent';

const navigation: { id: Panel; label: string; description: string }[] = [
  { id: 'Templates', label: 'Templates', description: 'Prepare packet files' },
  { id: 'Source Data', label: 'Source Data', description: 'Import client text' },
  { id: 'Generate', label: 'Generate', description: 'Review routes' },
  { id: 'Outputs', label: 'Outputs', description: 'Download packets' },
  { id: 'Settings', label: 'Settings', description: 'Preferences' }
];
const workflow: Panel[] = ['Templates', 'Source Data', 'Generate', 'Outputs'];
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
      id: 'first-dispute', kind: 'DISPUTE', name: 'Dispute Packet', description: 'Complete bureau dispute package', docs: [
        { id: 'dispute-letter', name: 'Dispute Letter', file: '', placeholders: true, fields: commonFields },
        { id: 'dispute-support', name: 'Supporting Documents', file: '', placeholders: true, fields: '{{consumer.name}}\n{{consumer.address}}\n{{today.us_long}}' },
        { id: 'dispute-fcra', name: 'FCRA', file: '', placeholders: true, fields: '{{consumer.name}}\n{{today.us_long}}' },
        { id: 'dispute-affidavit', name: 'Affidavit', file: '', placeholders: true, fields: commonFields },
        { id: 'dispute-attachment', name: 'Attachment', file: '', placeholders: false, fields: '' },
        { id: 'dispute-ftc', name: 'FTC', file: '', placeholders: true, fields: commonFields }
      ]
    },
    {
      id: 'first-late', kind: 'LATE_PAYMENT', name: 'Late Payment Packet', description: 'Letter with supporting documents', docs: [
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
function formatBytes(value?: number) { if (!value) return ''; return value >= 1048576 ? `${(value / 1048576).toFixed(1)} MB` : `${(value / 1024).toFixed(1)} KB`; }
function download(name: string, content: string) { const url = URL.createObjectURL(new Blob([content], { type: 'text/plain' })); const link = document.createElement('a'); link.href = url; link.download = name; link.click(); URL.revokeObjectURL(url); }
function Pill({ children, tone = 'neutral' }: { children: React.ReactNode; tone?: Tone }) { return <span className={`pill ${tone}`}>{children}</span>; }
function EmptyState({ title, text }: { title: string; text: string }) { return <div className="empty-state"><div className="empty-icon" aria-hidden="true">+</div><strong>{title}</strong><p>{text}</p></div>; }

export default function Page() {
  const [panel, setPanel] = useState<Panel>('Templates');
  const [packets, setPackets] = useState<Packet[]>(seedPackets);
  const [packetId, setPacketId] = useState('first-dispute');
  const [documentId, setDocumentId] = useState('dispute-letter');
  const [source, setSource] = useState('');
  const [outputs, setOutputs] = useState<Output[]>([]);
  const [strict, setStrict] = useState(false);
  const [status, setStatus] = useState('Set up your first-round templates. Files stay saved until replaced or deleted.');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try { const saved = localStorage.getItem(storageKey); if (saved) { setPackets(JSON.parse(saved) as Packet[]); setStatus('Saved first-round templates restored.'); } } catch { setStatus('Templates are ready for new uploads.'); }
    setReady(true);
  }, []);
  useEffect(() => { if (ready) localStorage.setItem(storageKey, JSON.stringify(packets)); }, [packets, ready]);

  const packet = packets.find((item) => item.id === packetId) || packets[0];
  const selectedDoc = packet.docs.find((item) => item.id === documentId) || packet.docs[0];
  const parsed = useMemo(() => parseSource(source), [source]);
  const routes: Route[] = useMemo(() => bureaus.flatMap((bureau) => [
    parsed.dispute[bureau].length ? { bureau, kind: 'DISPUTE' as Kind, records: parsed.dispute[bureau] } : null,
    parsed.late[bureau].length ? { bureau, kind: 'LATE_PAYMENT' as Kind, records: parsed.late[bureau] } : null
  ].filter(Boolean) as Route[]), [parsed]);
  const allDocs = packets.flatMap((item) => item.docs);
  const uploadedCount = allDocs.filter((item) => item.file).length;
  const missing = allDocs.filter((item) => !item.file).map((item) => item.name);
  const blockers = [!source.trim() ? 'Upload or paste a TXT source to generate packets.' : '', source.trim() && !parsed.name ? 'Consumer name was not detected in the source.' : '', source.trim() && !routes.length ? 'No dispute or late-payment bureau records were detected.' : ''].filter(Boolean);

  function choosePacket(item: Packet) { setPacketId(item.id); setDocumentId(item.docs[0].id); }
  function updateDoc(change: Partial<Doc>) { setPackets((current) => current.map((item) => item.id !== packet.id ? item : { ...item, docs: item.docs.map((doc) => doc.id === selectedDoc.id ? { ...doc, ...change } : doc) })); }
  async function uploadTemplate(file: File) { await keepFile(selectedDoc.id, file); updateDoc({ file: file.name, size: file.size, savedAt: new Date().toISOString() }); setStatus(`${selectedDoc.name} saved. It remains assigned until replaced or deleted.`); }
  async function deleteTemplate() { if (!window.confirm(`Delete the saved file for ${selectedDoc.name}?`)) return; await removeFile(selectedDoc.id); updateDoc({ file: '', size: undefined, savedAt: undefined }); setStatus(`${selectedDoc.name} removed.`); }
  async function uploadTxt(file: File) { setSource(await file.text()); setStatus(`${file.name} loaded.`); }
  function generate() {
    if (blockers.length || (strict && missing.length)) { setPanel('Generate'); setStatus('Resolve the items shown before generation.'); return; }
    const date = new Date().toISOString().slice(0, 10);
    const generated = routes.map((route) => {
      const selected = packets.find((item) => item.kind === route.kind)!;
      const content = [selected.name, route.bureau, '', parsed.name, ...parsed.address, '', addresses[route.bureau], '', 'Included files:', ...selected.docs.map((doc) => `- ${doc.name}: ${doc.file || 'Pending during setup'}`), '', 'Source records:', ...route.records].join('\n');
      return { name: `${safeName(parsed.name)}_1ST_ROUND_${route.bureau}_${route.kind}_${date}.txt`, packet: selected.name, bureau: route.bureau, kind: route.kind, content };
    });
    setOutputs(generated); setPanel('Outputs'); setStatus(`${generated.length} first-round packet preview${generated.length === 1 ? '' : 's'} generated.`);
  }
  function stepClass(item: Panel) { const current = workflow.indexOf(panel); const position = workflow.indexOf(item); return item === panel ? 'current' : position >= 0 && current >= 0 && position < current ? 'complete' : ''; }

  function templatesView() {
    return <div className="content-grid">
      <section className="panel library-panel" aria-label="Template packets">
        <div className="panel-heading"><div><h2>Document packets</h2><p>1st Round setup only</p></div><Pill tone={uploadedCount ? 'success' : 'neutral'}>{uploadedCount}/{allDocs.length} saved</Pill></div>
        <div className="packet-picker" role="tablist" aria-label="Packet type">
          {packets.map((item) => <button key={item.id} role="tab" aria-selected={item.id === packet.id} className={`packet ${item.id === packet.id ? 'selected' : ''}`} onClick={() => choosePacket(item)}><span>{item.name}</span><small>{item.description}</small><b>{item.docs.filter((doc) => doc.file).length}/{item.docs.length}</b></button>)}
        </div>
        <div className="documents" aria-label={`${packet.name} documents`}>
          {packet.docs.map((doc, index) => <button key={doc.id} className={`document ${doc.id === selectedDoc.id ? 'selected' : ''}`} aria-pressed={doc.id === selectedDoc.id} onClick={() => setDocumentId(doc.id)}><i>{index + 1}</i><span><strong>{doc.name}</strong><small>{doc.file || 'No template uploaded'}</small></span><Pill tone={doc.file ? 'success' : 'warning'}>{doc.file ? 'Saved' : 'Pending'}</Pill></button>)}
        </div>
      </section>
      <section className="panel editor-panel" aria-label="Edit selected document template">
        <div className="panel-heading"><div><h2>{selectedDoc.name}</h2><p>{packet.name}</p></div><Pill tone={selectedDoc.file ? 'success' : 'warning'}>{selectedDoc.file ? 'Saved' : 'Pending'}</Pill></div>
        {selectedDoc.file ? <div className="saved-file"><strong>{selectedDoc.file}</strong><span>{formatBytes(selectedDoc.size)} · Persisted locally</span><p>Saved until you replace or delete it.</p></div> : <div className="upload-empty"><p>No file assigned to this document yet.</p></div>}
        <label className="field-label">{selectedDoc.file ? 'Replace template' : 'Upload template'}<input className="file-input" type="file" accept=".docx,.pdf,.png,.jpg,.jpeg" onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadTemplate(file); event.target.value = ''; }} /></label>
        {selectedDoc.file && <button className="delete-button" onClick={() => void deleteTemplate()}>Delete saved file</button>}
        <label className="switch-row"><input type="checkbox" checked={selectedDoc.placeholders} onChange={(event) => updateDoc({ placeholders: event.target.checked })} /><span>Document contains placeholders</span></label>
        {selectedDoc.placeholders && <label className="field-label">Approved placeholders<textarea className="code-area" value={selectedDoc.fields} onChange={(event) => updateDoc({ fields: event.target.value })} /></label>}
      </section>
    </div>;
  }
  function sourceView() {
    return <div className="content-grid source-grid">
      <section className="panel"><div className="panel-heading"><div><h2>Source text</h2><p>Upload or paste the client TXT file.</p></div></div><label className="field-label">Import .txt file<input className="file-input" type="file" accept=".txt" onChange={(event) => event.target.files?.[0] && uploadTxt(event.target.files[0])} /></label><textarea className="source-area" value={source} onChange={(event) => setSource(event.target.value)} placeholder="Paste TXT source here…" aria-label="TXT source data" /></section>
      <section className="panel"><div className="panel-heading"><div><h2>Detected routing</h2><p>{parsed.name || 'No consumer loaded'}</p></div>{routes.length > 0 && <Pill tone="success">{routes.length} route{routes.length === 1 ? '' : 's'}</Pill>}</div>{parsed.address.length > 0 && <p className="client-address">{parsed.address.join(' ')}</p>}<div className="route-table">{bureaus.map((bureau) => <div className="bureau" key={bureau}><strong>{bureau}</strong><Pill tone={parsed.dispute[bureau].length ? 'success' : 'neutral'}>Dispute</Pill><Pill tone={parsed.late[bureau].length ? 'success' : 'neutral'}>Late Payment</Pill></div>)}</div></section>
    </div>;
  }
  function generateView() {
    return <div className="content-grid generate-grid">
      <section className="panel"><div className="panel-heading"><div><h2>Ready to generate</h2><p>One output per bureau and letter type found.</p></div><Pill tone={routes.length ? 'accent' : 'neutral'}>{routes.length} outputs</Pill></div>{routes.length ? <div className="route-list">{routes.map((route) => <div className="route-card" key={`${route.bureau}-${route.kind}`}><strong>{route.bureau}</strong><span>{route.kind === 'LATE_PAYMENT' ? 'Late Payment' : 'Dispute'}</span><small>{packets.find((item) => item.kind === route.kind)?.name}</small></div>)}</div> : <EmptyState title="No routes yet" text="Import a TXT source file to detect output routes." />}<button className="action-button" onClick={generate}>Generate preview packets</button></section>
      <section className="panel"><div className="panel-heading"><div><h2>Preflight check</h2><p>Missing templates are permitted during setup.</p></div></div>{blockers.length ? blockers.map((message) => <div className="alert error" key={message}>{message}</div>) : <div className="alert success">Source data and routing are ready.</div>}{missing.length > 0 && <div className="pending-list"><p>{missing.length} documents still pending</p>{missing.slice(0, 5).map((item) => <span key={item}>{item}</span>)}</div>}</section>
    </div>;
  }
  function outputsView() {
    return <section className="panel outputs"><div className="panel-heading"><div><h2>Generated outputs</h2><p>Preview manifests for the first-round workflow.</p></div>{outputs.length > 0 && <Pill tone="success">{outputs.length} generated</Pill>}</div>{outputs.length ? <div className="output-list">{outputs.map((item) => <article className="output" key={item.name}><div><Pill tone="accent">{item.bureau}</Pill><h3>{item.name}</h3><p>{item.packet}</p></div><button className="secondary-button" onClick={() => download(item.name, item.content)}>Download</button></article>)}</div> : <EmptyState title="Nothing generated" text="Generate a packet preview to see downloads here." />}</section>;
  }
  function settingsView() {
    return <section className="panel settings"><div className="panel-heading"><div><h2>Preferences</h2><p>Controls for your first-round setup.</p></div></div><label className="setting"><input type="checkbox" checked={strict} onChange={(event) => setStrict(event.target.checked)} /><span><strong>Strict template validation</strong><small>Require every packet document before generating. Keep this off during setup.</small></span></label><div className="info-card"><strong>Private local template storage</strong><p>Template uploads are retained in your browser and are not pushed to the public repository.</p></div></section>;
  }

  return <main className="app-shell">
    <aside className="sidebar"><div className="brand"><span aria-hidden="true" /><div><strong>LetterGenerator</strong><small>1st Round workspace</small></div></div><nav aria-label="Primary navigation">{navigation.map((item) => <button key={item.id} className={panel === item.id ? 'active' : ''} aria-current={panel === item.id ? 'page' : undefined} onClick={() => setPanel(item.id)}><strong>{item.label}</strong><small>{item.description}</small></button>)}</nav><div className="storage-progress"><div><strong>{uploadedCount}/{allDocs.length}</strong><small>templates saved</small></div><div className="bar" aria-hidden="true"><span style={{ width: `${(uploadedCount / allDocs.length) * 100}%` }} /></div></div></aside>
    <section className="main-area"><header className="header"><div><p className="eyebrow">Letter workflow · 1st round</p><h1>{panel}</h1></div><button className="header-action" onClick={() => setPanel('Generate')}>Generate</button></header><nav className="stepper" aria-label="Workflow steps">{workflow.map((step, index) => <button key={step} className={stepClass(step)} onClick={() => setPanel(step)}><i>{index + 1}</i><span>{step}</span></button>)}</nav>{panel === 'Templates' && templatesView()}{panel === 'Source Data' && sourceView()}{panel === 'Generate' && generateView()}{panel === 'Outputs' && outputsView()}{panel === 'Settings' && settingsView()}<div className="toast" role="status" aria-live="polite">{status}</div></section>
  </main>;
}
