'use client';

import { useMemo, useState } from 'react';

type Bureau = 'TRANSUNION' | 'EQUIFAX' | 'EXPERIAN';
type Panel = 'Dashboard' | 'Templates' | 'TXT Source' | 'Generator' | 'Validation' | 'Output Files' | 'GitHub Sync' | 'Settings';
type Round = '1st Round' | '2nd Round' | '3rd Round' | 'Final';
type LetterKind = 'DISPUTE' | 'LATE_PAYMENT';
type DocumentRole = 'LETTER' | 'SUPPORTING_DOCUMENTS' | 'FCRA' | 'AFFIDAVIT' | 'ATTACHMENT' | 'FTC';
type DocumentSlot = { id: string; role: DocumentRole; name: string; required: boolean; supportsPlaceholders: boolean; placeholders: string; fileName: string };
type TemplatePacket = { id: string; round: Round; kind: LetterKind; name: string; description: string; enabled: boolean; documents: DocumentSlot[] };
type Output = { name: string; bureau: Bureau; kind: LetterKind; packetName: string; documentCount: number; manifest: string; created: string };

const bureaus: Bureau[] = ['TRANSUNION', 'EQUIFAX', 'EXPERIAN'];
const rounds: Round[] = ['1st Round', '2nd Round', '3rd Round', 'Final'];
const nav: Panel[] = ['Dashboard', 'Templates', 'TXT Source', 'Generator', 'Validation', 'Output Files', 'GitHub Sync', 'Settings'];
const placeholderSet = '{{consumer.name}}\n{{consumer.address}}\n{{consumer.dob}}\n{{consumer.ssn}}\n{{today.us_long}}\n{{bureau.name}}\n{{bureau.address}}\n{{accounts_block}}\n{{inquiries_block}}';
const bureauAddress: Record<Bureau, string> = {
  TRANSUNION: 'TransUnion LLC\nP.O. Box 2000\nChester, PA 19016-2000',
  EQUIFAX: 'Equifax Information Services LLC\nPO Box 105139\nAtlanta, GA 30348',
  EXPERIAN: 'Experian\nPO Box 4500\nAllen, TX 75013'
};

function disputeDocuments(key: string): DocumentSlot[] {
  return [
    { id: `${key}-letter`, role: 'LETTER', name: 'Letter for Dispute', required: true, supportsPlaceholders: true, placeholders: placeholderSet, fileName: '' },
    { id: `${key}-support`, role: 'SUPPORTING_DOCUMENTS', name: 'Supporting Documents', required: true, supportsPlaceholders: true, placeholders: '{{consumer.name}}\n{{consumer.address}}\n{{today.us_long}}', fileName: '' },
    { id: `${key}-fcra`, role: 'FCRA', name: 'FCRA', required: true, supportsPlaceholders: true, placeholders: '{{consumer.name}}\n{{today.us_long}}', fileName: '' },
    { id: `${key}-affidavit`, role: 'AFFIDAVIT', name: 'Affidavit', required: true, supportsPlaceholders: true, placeholders: '{{consumer.name}}\n{{consumer.address}}\n{{consumer.dob}}\n{{consumer.ssn}}\n{{accounts_block}}', fileName: '' },
    { id: `${key}-attachment`, role: 'ATTACHMENT', name: 'Attachment', required: true, supportsPlaceholders: false, placeholders: '', fileName: '' },
    { id: `${key}-ftc`, role: 'FTC', name: 'FTC', required: true, supportsPlaceholders: true, placeholders: '{{consumer.name}}\n{{accounts_block}}\n{{today.us_long}}', fileName: '' }
  ];
}
function latePaymentDocuments(key: string): DocumentSlot[] {
  return [
    { id: `${key}-letter`, role: 'LETTER', name: 'Late Payment Letter', required: true, supportsPlaceholders: true, placeholders: placeholderSet, fileName: '' },
    { id: `${key}-support`, role: 'SUPPORTING_DOCUMENTS', name: 'Supporting Documents', required: true, supportsPlaceholders: true, placeholders: '{{consumer.name}}\n{{consumer.address}}\n{{today.us_long}}', fileName: '' }
  ];
}
function createLibrary(): TemplatePacket[] {
  return rounds.flatMap((round, index) => {
    const prefix = `r${index + 1}`;
    return [
      { id: `${prefix}-dispute`, round, kind: 'DISPUTE', name: `${round} Dispute Packet`, description: 'Complete dispute submission packet routed per credit bureau.', enabled: true, documents: disputeDocuments(`${prefix}-dispute`) },
      { id: `${prefix}-late`, round, kind: 'LATE_PAYMENT', name: `${round} Late Payment Packet`, description: 'Late-payment submission containing the letter and supporting documents only.', enabled: true, documents: latePaymentDocuments(`${prefix}-late`) }
    ];
  });
}
function blankSource() {
  return { name: '', address: [] as string[], dob: '', ssn: '', dispute: { TRANSUNION: [] as string[], EQUIFAX: [] as string[], EXPERIAN: [] as string[] }, late: { TRANSUNION: [] as string[], EQUIFAX: [] as string[], EXPERIAN: [] as string[] } };
}
function getBureau(line: string): Bureau | '' {
  const value = line.trim().replace(/:$/, '').toUpperCase();
  if (value === 'TRANSUNION' || value === 'TRANS UNION' || value === 'TU') return 'TRANSUNION';
  if (value === 'EQUIFAX' || value === 'EQ') return 'EQUIFAX';
  if (value === 'EXPERIAN' || value === 'EXP') return 'EXPERIAN';
  return '';
}
function getArea(line: string) {
  const value = line.trim().replace(/:$/, '').toUpperCase();
  if (value.startsWith('DISPUTE')) return 'dispute';
  if (value.startsWith('LATE')) return 'late';
  if (value.startsWith('OPEN')) return 'open';
  if (value.startsWith('HARD')) return 'inquiry';
  return '';
}
function parseSource(text: string) {
  const parsed = blankSource(); const header: string[] = []; let area = 'header'; let bureau: Bureau | '' = '';
  text.split(/\r?\n/).forEach((raw) => {
    const line = raw.trim(); if (!line) return;
    const nextArea = getArea(line); if (nextArea) { area = nextArea; bureau = ''; return; }
    const nextBureau = getBureau(line); if (nextBureau) { bureau = nextBureau; return; }
    if (area === 'header') header.push(line);
    if (area === 'dispute' && bureau) parsed.dispute[bureau].push(line);
    if (area === 'late' && bureau) parsed.late[bureau].push(line);
  });
  parsed.name = header[0] || '';
  parsed.dob = (header.find((line) => /^DOB:/i.test(line)) || '').replace(/^DOB:\s*/i, '');
  parsed.ssn = (header.find((line) => /^SSN:/i.test(line)) || '').replace(/^SSN:\s*/i, '');
  parsed.address = header.slice(1).filter((line) => !/^(DOB|SSN):/i.test(line));
  return parsed;
}
function safeName(value: string) { return (value || 'CLIENT').replace(/[^a-z0-9]+/gi, '_').replace(/^_|_$/g, '').toUpperCase(); }
function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
  const link = document.createElement('a'); link.href = url; link.download = name; link.click(); URL.revokeObjectURL(url);
}

export default function Page() {
  const [panel, setPanel] = useState<Panel>('Templates');
  const [library, setLibrary] = useState<TemplatePacket[]>(createLibrary);
  const [sourceText, setSourceText] = useState('');
  const [selectedRound, setSelectedRound] = useState<Round>('1st Round');
  const [generationRound, setGenerationRound] = useState<Round>('1st Round');
  const [selectedPacketId, setSelectedPacketId] = useState('r1-dispute');
  const [selectedDocumentId, setSelectedDocumentId] = useState('r1-dispute-letter');
  const [outputs, setOutputs] = useState<Output[]>([]);
  const [status, setStatus] = useState('Configure each dispute and late-payment packet before generation.');
  const [strictFiles, setStrictFiles] = useState(true);
  const parsed = useMemo(() => parseSource(sourceText), [sourceText]);
  const roundPackets = library.filter((packet) => packet.round === selectedRound);
  const selectedPacket = library.find((packet) => packet.id === selectedPacketId) || roundPackets[0];
  const selectedDocument = selectedPacket?.documents.find((document) => document.id === selectedDocumentId) || selectedPacket?.documents[0];
  const generationPackets = library.filter((packet) => packet.round === generationRound && packet.enabled);
  const generationQueue = useMemo(() => bureaus.flatMap((bureau) => [
    parsed.dispute[bureau].length ? { bureau, kind: 'DISPUTE' as LetterKind, rows: parsed.dispute[bureau] } : null,
    parsed.late[bureau].length ? { bureau, kind: 'LATE_PAYMENT' as LetterKind, rows: parsed.late[bureau] } : null
  ].filter(Boolean) as { bureau: Bureau; kind: LetterKind; rows: string[] }[]), [parsed]);
  const validation = useMemo(() => {
    const errors: string[] = [];
    if (!sourceText.trim()) errors.push('TXT source has not been uploaded or pasted.');
    if (sourceText.trim() && !parsed.name) errors.push('Consumer name could not be detected.');
    if (sourceText.trim() && !generationQueue.length) errors.push('No DISPUTE or LATE PAYMENT bureau data was detected.');
    generationQueue.forEach((job) => {
      const packet = generationPackets.find((item) => item.kind === job.kind);
      if (!packet) { errors.push(`${generationRound} has no enabled ${job.kind.replace('_', ' ')} packet.`); return; }
      if (strictFiles) packet.documents.filter((document) => document.required && !document.fileName).forEach((document) => errors.push(`${packet.name}: ${document.name} file is required.`));
    });
    return Array.from(new Set(errors));
  }, [sourceText, parsed.name, generationQueue, generationPackets, generationRound, strictFiles]);

  function selectRound(round: Round) {
    setSelectedRound(round);
    const packet = library.find((item) => item.round === round);
    if (packet) { setSelectedPacketId(packet.id); setSelectedDocumentId(packet.documents[0].id); }
  }
  function selectPacket(packet: TemplatePacket) { setSelectedPacketId(packet.id); setSelectedDocumentId(packet.documents[0].id); }
  function patchPacket(change: Partial<TemplatePacket>) {
    if (!selectedPacket) return;
    setLibrary((current) => current.map((packet) => packet.id === selectedPacket.id ? { ...packet, ...change } : packet));
  }
  function patchDocument(change: Partial<DocumentSlot>) {
    if (!selectedPacket || !selectedDocument) return;
    setLibrary((current) => current.map((packet) => packet.id !== selectedPacket.id ? packet : { ...packet, documents: packet.documents.map((document) => document.id === selectedDocument.id ? { ...document, ...change } : document) }));
  }
  async function uploadSource(file: File) { setSourceText(await file.text()); setStatus(`TXT source loaded: ${file.name}`); }
  function generateOutputs() {
    if (validation.length) { setPanel('Validation'); setStatus('Generation blocked. Resolve required packet documents first.'); return; }
    const today = new Date().toISOString().slice(0, 10);
    const generated = generationQueue.map((job) => {
      const packet = generationPackets.find((item) => item.kind === job.kind)!;
      const lines = [`${packet.name} — ${job.bureau}`, '', `Consumer: ${parsed.name}`, ...parsed.address, '', bureauAddress[job.bureau], '', 'Packet documents:', ...packet.documents.map((document, index) => `${index + 1}. ${document.name}: ${document.fileName || 'not assigned'}`), '', 'Parsed source records:', ...job.rows];
      return { name: `${safeName(parsed.name)}_${safeName(generationRound)}_${job.bureau}_${job.kind}_${today}_PACKET.txt`, bureau: job.bureau, kind: job.kind, packetName: packet.name, documentCount: packet.documents.length, manifest: lines.join('\n'), created: new Date().toLocaleTimeString() };
    });
    setOutputs(generated); setPanel('Output Files'); setStatus(`${generated.length} packet manifest(s) generated for ${generationRound}.`);
  }
  function dataTable() {
    return <table className="table"><thead><tr><th>Bureau</th><th>Dispute</th><th>Late Payment</th></tr></thead><tbody>{bureaus.map((bureau) => <tr key={bureau}><td>{bureau}</td><td><span className={`badge ${parsed.dispute[bureau].length ? 'success' : 'warning'}`}>{parsed.dispute[bureau].length ? 'Detected' : 'Skip'}</span></td><td><span className={`badge ${parsed.late[bureau].length ? 'success' : 'warning'}`}>{parsed.late[bureau].length ? 'Detected' : 'Skip'}</span></td></tr>)}</tbody></table>;
  }
  function templatesCanvas() {
    return <div className="template-canvas"><section className="card"><div className="canvas-head"><div><h2 className="card-title">Round Packet Library</h2><p className="card-copy">Each round has a separate dispute packet and late-payment packet.</p></div></div><div className="round-tabs">{rounds.map((round) => <button key={round} className={`round-tab ${selectedRound === round ? 'selected' : ''}`} onClick={() => selectRound(round)}>{round}<small>{library.filter((packet) => packet.round === round).length} packets</small></button>)}</div><div className="template-cards">{roundPackets.map((packet) => <button key={packet.id} className={`template-card ${selectedPacket?.id === packet.id ? 'selected' : ''}`} onClick={() => selectPacket(packet)}><span className={`badge ${packet.kind === 'DISPUTE' ? 'success' : 'warning'}`}>{packet.kind.replace('_', ' ')}</span><strong>{packet.name}</strong><small>{packet.documents.filter((document) => document.fileName).length}/{packet.documents.length} documents assigned</small></button>)}</div>{selectedPacket && <div className="document-stack"><h3>{selectedPacket.kind === 'DISPUTE' ? 'Dispute packet documents' : 'Late payment packet documents'}</h3>{selectedPacket.documents.map((document, index) => <button key={document.id} className={`document-slot ${selectedDocument?.id === document.id ? 'selected' : ''}`} onClick={() => setSelectedDocumentId(document.id)}><span className="document-index">{index + 1}</span><span><strong>{document.name}</strong><small>{document.fileName || 'Upload required document'}</small></span><span className={`badge ${document.fileName ? 'success' : 'warning'}`}>{document.fileName ? 'Ready' : 'Missing'}</span></button>)}</div>}</section>{selectedPacket && selectedDocument && <section className="card editor"><div className="canvas-head"><div><h2 className="card-title">Packet Editor</h2><p className="card-copy">{selectedPacket.round} · {selectedPacket.kind.replace('_', ' ')}</p></div><label className="toggle"><input type="checkbox" checked={selectedPacket.enabled} onChange={(event) => patchPacket({ enabled: event.target.checked })} /> Active</label></div><label className="field">Packet Name<input className="input" value={selectedPacket.name} onChange={(event) => patchPacket({ name: event.target.value })} /></label><label className="field">Purpose<textarea className="input compact" value={selectedPacket.description} onChange={(event) => patchPacket({ description: event.target.value })} /></label><div className="editor-divider" /><h3 className="document-editor-title">Document {selectedPacket.documents.findIndex((document) => document.id === selectedDocument.id) + 1}: {selectedDocument.name}</h3><label className="field">Upload / Replace File<input className="input" type="file" accept=".docx,.pdf,.png,.jpg,.jpeg" onChange={(event) => { const file = event.target.files?.[0]; if (file) { patchDocument({ fileName: file.name }); setStatus(`${file.name} assigned to ${selectedDocument.name}.`); } }} /></label><div className="document-options"><label className="toggle"><input type="checkbox" checked={selectedDocument.required} onChange={(event) => patchDocument({ required: event.target.checked })} /> Required</label><label className="toggle"><input type="checkbox" checked={selectedDocument.supportsPlaceholders} onChange={(event) => patchDocument({ supportsPlaceholders: event.target.checked })} /> Has placeholders</label></div>{selectedDocument.supportsPlaceholders && <label className="field">Approved Placeholders<textarea className="input compact code" value={selectedDocument.placeholders} onChange={(event) => patchDocument({ placeholders: event.target.value })} /></label>}<p className="notice">Files are grouped as one packet per bureau. For dispute, all six documents are included. Late payment uses only its letter and supporting documents.</p></section>}</div>;
  }
  function content() {
    if (panel === 'Templates') return templatesCanvas();
    if (panel === 'Dashboard') return <div className="grid cols-2"><section className="card"><h2 className="card-title">Packet Workflow</h2><p className="card-copy">Manage document packets for each round, then route the TXT source into bureau-specific dispute or late-payment packets.</p><div className="toolbar" style={{ marginTop: 18 }}><button className="btn" onClick={() => setPanel('Templates')}>Manage Packets</button><button className="btn secondary" onClick={() => setPanel('Generator')}>Generate</button></div></section><section className="card"><h2 className="card-title">Upload Coverage</h2>{rounds.map((round) => { const docs = library.filter((packet) => packet.round === round).flatMap((packet) => packet.documents); return <div className="coverage" key={round}><strong>{round}</strong><span>{docs.filter((doc) => doc.fileName).length}/{docs.length} files assigned</span></div>; })}</section></div>;
    if (panel === 'TXT Source') return <div className="grid cols-2"><section className="card"><h2 className="card-title">TXT Source</h2><input className="input" type="file" accept=".txt" onChange={(event) => event.target.files?.[0] && uploadSource(event.target.files[0])} /><textarea className="input textarea" value={sourceText} onChange={(event) => setSourceText(event.target.value)} placeholder="Paste source TXT here..." /></section><section className="card"><h2 className="card-title">Detected Letter Types</h2><p><strong>{parsed.name || 'No consumer detected'}</strong></p><p className="card-copy">{parsed.address.join(' ') || 'No address detected'}</p>{dataTable()}</section></div>;
    if (panel === 'Generator') return <div className="grid cols-2"><section className="card"><h2 className="card-title">Packet Generation</h2><label className="field">Generate Round<select className="input" value={generationRound} onChange={(event) => setGenerationRound(event.target.value as Round)}>{rounds.map((round) => <option key={round}>{round}</option>)}</select></label>{dataTable()}<div className="toolbar" style={{ marginTop: 18 }}><button className="btn" onClick={generateOutputs}>Generate {generationQueue.length} Packets</button><button className="btn secondary" onClick={() => setPanel('Validation')}>Validate</button></div></section><section className="card"><h2 className="card-title">Packet Contents for {generationRound}</h2>{generationPackets.map((packet) => <div className="packet-summary" key={packet.id}><div><strong>{packet.name}</strong><small>{packet.documents.length} documents required</small></div><span className={`badge ${packet.documents.every((document) => document.fileName) ? 'success' : 'warning'}`}>{packet.documents.filter((document) => document.fileName).length}/{packet.documents.length} ready</span></div>)}</section></div>;
    if (panel === 'Validation') return <section className="card"><h2 className="card-title">Validation Center</h2><p className="card-copy">Validation is based on the selected generation round and required packet documents.</p><table className="table" style={{ marginTop: 16 }}><tbody>{validation.length ? validation.map((error) => <tr key={error}><td><span className="badge warning">Blocker</span></td><td>{error}</td></tr>) : <tr><td><span className="badge success">Passed</span></td><td>{generationRound} dispute and late-payment packets are ready.</td></tr>}</tbody></table></section>;
    if (panel === 'Output Files') return <section className="card"><h2 className="card-title">Generated Packet Outputs</h2><p className="card-copy">Current export is a packet manifest preview; DOCX/PDF packet assembly is the next rendering module.</p><table className="table" style={{ marginTop: 16 }}><thead><tr><th>Output</th><th>Packet</th><th>Documents</th><th></th></tr></thead><tbody>{outputs.length ? outputs.map((output) => <tr key={output.name}><td>{output.name}<br /><small>{output.created}</small></td><td>{output.packetName}<br /><small>{output.bureau} · {output.kind.replace('_', ' ')}</small></td><td>{output.documentCount}</td><td><button className="btn secondary" onClick={() => download(output.name, output.manifest)}>Download</button></td></tr>) : <tr><td colSpan={4}>No generated packet manifests yet.</td></tr>}</tbody></table></section>;
    if (panel === 'GitHub Sync') return <section className="card"><h2 className="card-title">GitHub Sync</h2><p className="card-copy">Application source connected to <strong>Arisu-art/LetterGenerator</strong>. Do not commit consumer files or generated packets to a public repository.</p><p className="notice">Template files may contain sensitive information. Production storage should be private, encrypted, and access-controlled.</p></section>;
    return <section className="card"><h2 className="card-title">Settings</h2><div className="grid cols-2"><label className="setting"><input type="checkbox" checked={strictFiles} onChange={(event) => setStrictFiles(event.target.checked)} /> Require every packet document before generation</label><div className="setting">Output routing: one packet per bureau and letter type</div></div><h3>Bureau Mailing Registry</h3><pre className="registry">{bureaus.map((bureau) => `${bureau}\n${bureauAddress[bureau]}`).join('\n\n')}</pre></section>;
  }
  return <main className="shell"><aside className="sidebar"><div className="brand"><div className="brand-mark" /><div><div className="brand-title">LetterGenerator</div><div className="brand-subtitle">Packet operations</div></div></div><nav className="nav">{nav.map((item) => <button key={item} className={`nav-item ${panel === item ? 'active' : ''}`} onClick={() => setPanel(item)}>{item}</button>)}</nav><div className="sidebar-footer">Template-safe workflow: round packets preserve their assigned documents.</div></aside><section className="main"><header className="header"><div><div className="eyebrow">{panel}</div><h1>{panel === 'Templates' ? 'Document Packet Canvas' : 'Letter Workflow Console'}</h1><p className="lead">Each round owns independent dispute and late-payment packets. Source data determines which bureau packet is generated.</p></div><div className="toolbar"><button className="btn secondary" onClick={() => setPanel('Validation')}>Validate</button><button className="btn" onClick={generateOutputs}>Generate {generationQueue.length}</button></div></header><div className="grid cols-3" style={{ marginBottom: 18 }}><div className="stat"><div className="stat-value">{library.length}</div><div className="stat-label">Packets</div></div><div className="stat"><div className="stat-value">{generationQueue.length}</div><div className="stat-label">Ready Routes</div></div><div className="stat"><div className="stat-value">{outputs.length}</div><div className="stat-label">Generated</div></div></div>{content()}<p className="statusbar">{status}</p></section></main>;
}
