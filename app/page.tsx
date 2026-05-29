'use client';

import { useMemo, useState } from 'react';

type Bureau = 'TRANSUNION' | 'EQUIFAX' | 'EXPERIAN';
type Panel = 'Dashboard' | 'Templates' | 'TXT Source' | 'Generator' | 'Validation' | 'Output Files' | 'GitHub Sync' | 'Settings';
type Output = { name: string; content: string; bureau: Bureau; type: string; created: string };
const bureaus: Bureau[] = ['TRANSUNION', 'EQUIFAX', 'EXPERIAN'];
const nav: Panel[] = ['Dashboard', 'Templates', 'TXT Source', 'Generator', 'Validation', 'Output Files', 'GitHub Sync', 'Settings'];
const bureauAddress: Record<Bureau, string> = {
  TRANSUNION: 'TransUnion LLC\nP.O. Box 2000\nChester, PA 19016-2000',
  EQUIFAX: 'Equifax Information Services LLC\nPO Box 105139\nAtlanta, GA 30348',
  EXPERIAN: 'Experian\nPO Box 4500\nAllen, TX 75013'
};

function blank() {
  return { name: '', address: [] as string[], dob: '', ssn: '', open: [] as string[], dispute: { TRANSUNION: [] as string[], EQUIFAX: [] as string[], EXPERIAN: [] as string[] }, late: { TRANSUNION: [] as string[], EQUIFAX: [] as string[], EXPERIAN: [] as string[] }, inquiry: [] as string[] };
}
function bureauOf(line: string): Bureau | '' {
  const v = line.trim().replace(/:$/, '').toUpperCase();
  if (v === 'TRANSUNION' || v === 'TRANS UNION' || v === 'TU') return 'TRANSUNION';
  if (v === 'EQUIFAX' || v === 'EQ') return 'EQUIFAX';
  if (v === 'EXPERIAN' || v === 'EXP') return 'EXPERIAN';
  return '';
}
function areaOf(line: string) {
  const v = line.trim().replace(/:$/, '').toUpperCase();
  if (v.startsWith('DISPUTE')) return 'dispute';
  if (v.startsWith('LATE')) return 'late';
  if (v.startsWith('HARD')) return 'inquiry';
  if (v.startsWith('OPEN')) return 'open';
  return '';
}
function parseSource(text: string) {
  const out = blank(); const header: string[] = []; let area = 'header'; let bureau: Bureau | '' = '';
  text.split(/\r?\n/).forEach((raw) => {
    const line = raw.trim(); if (!line) return;
    const nextArea = areaOf(line); if (nextArea) { area = nextArea; bureau = ''; return; }
    const nextBureau = bureauOf(line); if (nextBureau) { bureau = nextBureau; return; }
    if (area === 'header') header.push(line);
    if (area === 'open') out.open.push(line);
    if (area === 'inquiry') out.inquiry.push(line);
    if (area === 'dispute' && bureau) out.dispute[bureau].push(line);
    if (area === 'late' && bureau) out.late[bureau].push(line);
  });
  out.name = header[0] || '';
  out.dob = (header.find((x) => x.toUpperCase().startsWith('DOB:')) || '').replace(/^DOB:\s*/i, '');
  out.ssn = (header.find((x) => x.toUpperCase().startsWith('SSN:')) || '').replace(/^SSN:\s*/i, '');
  out.address = header.slice(1).filter((x) => !/^(DOB|SSN):/i.test(x));
  return out;
}
function save(name: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: 'text/plain' }));
  const a = document.createElement('a'); a.href = url; a.download = name; a.click(); URL.revokeObjectURL(url);
}
function clean(value: string) { return (value || 'CLIENT').replace(/[^a-z0-9]+/gi, '_').replace(/^_|_$/g, '').toUpperCase(); }

export default function Page() {
  const [panel, setPanel] = useState<Panel>('Dashboard');
  const [source, setSource] = useState('');
  const [template, setTemplate] = useState<File | null>(null);
  const [templateType, setTemplateType] = useState('Dispute + Late Payment');
  const [outputs, setOutputs] = useState<Output[]>([]);
  const [status, setStatus] = useState('Upload a template and TXT source to begin.');
  const [requireTemplate, setRequireTemplate] = useState(true);
  const [appendDate, setAppendDate] = useState(true);
  const parsed = useMemo(() => parseSource(source), [source]);
  const candidates = useMemo(() => bureaus.flatMap((b) => [parsed.dispute[b].length ? { bureau: b, type: 'DISPUTE', rows: parsed.dispute[b] } : null, parsed.late[b].length ? { bureau: b, type: 'LATE_PAYMENT', rows: parsed.late[b] } : null].filter(Boolean) as { bureau: Bureau; type: string; rows: string[] }[]), [parsed]);
  const issues = useMemo(() => {
    const found: string[] = [];
    if (!template) found.push('No DOCX template uploaded.');
    if (!source.trim()) found.push('No TXT source pasted or uploaded.');
    if (source.trim() && !parsed.name) found.push('Consumer name could not be detected.');
    if (source.trim() && !candidates.length) found.push('No bureau-specific dispute or late-payment records detected.');
    return found;
  }, [template, source, parsed.name, candidates.length]);
  const dateSuffix = new Date().toISOString().slice(0, 10);

  async function uploadTxt(file: File) { setSource(await file.text()); setStatus(`TXT loaded: ${file.name}`); }
  function generate() {
    if (requireTemplate && !template) { setStatus('Blocked: upload a DOCX template first.'); setPanel('Validation'); return; }
    if (!candidates.length) { setStatus('Blocked: no bureau records available to generate.'); setPanel('Validation'); return; }
    const next = candidates.map((item) => {
      const fileName = `${clean(parsed.name)}_${item.bureau}_${item.type}${appendDate ? `_${dateSuffix}` : ''}.txt`;
      const content = [parsed.name, ...parsed.address, `DOB: ${parsed.dob}`, `SSN: ${parsed.ssn}`, '', bureauAddress[item.bureau], '', item.rows.join('\n')].join('\n');
      return { name: fileName, content, bureau: item.bureau, type: item.type, created: new Date().toLocaleTimeString() };
    });
    setOutputs(next); setStatus(`${next.length} output preview file(s) generated.`); setPanel('Output Files');
  }
  function renderBureauTable() {
    return <table className="table"><thead><tr><th>Bureau</th><th>Dispute</th><th>Late Payment</th></tr></thead><tbody>{bureaus.map((b) => <tr key={b}><td>{b}</td><td><span className={`badge ${parsed.dispute[b].length ? 'success' : 'warning'}`}>{parsed.dispute[b].length ? `${parsed.dispute[b].length} lines` : 'Skip'}</span></td><td><span className={`badge ${parsed.late[b].length ? 'success' : 'warning'}`}>{parsed.late[b].length ? `${parsed.late[b].length} lines` : 'Skip'}</span></td></tr>)}</tbody></table>;
  }
  function content() {
    if (panel === 'Dashboard') return <div className="grid cols-2"><section className="card"><h2 className="card-title">Workflow Status</h2><p className="card-copy">{status}</p><div className="toolbar" style={{ marginTop: 18 }}><button className="btn" onClick={() => setPanel('Templates')}>Upload template</button><button className="btn secondary" onClick={() => setPanel('TXT Source')}>Add TXT source</button></div></section><section className="card"><h2 className="card-title">Ready Outputs</h2>{renderBureauTable()}</section></div>;
    if (panel === 'Templates') return <section className="card"><h2 className="card-title">Template Library</h2><p className="card-copy">Upload a DOCX design source. Static wording, formatting, colors and images must remain unchanged.</p><div className="grid cols-2" style={{ marginTop: 18 }}><div className="upload"><strong>{template?.name || 'No DOCX selected'}</strong><input className="input" type="file" accept=".docx" onChange={(e) => { const f = e.target.files?.[0] || null; setTemplate(f); setStatus(f ? `Template loaded: ${f.name}` : 'Template removed.'); }} /></div><div><label>Template type</label><select className="input" value={templateType} onChange={(e) => setTemplateType(e.target.value)}><option>Dispute + Late Payment</option><option>Dispute only</option><option>Late Payment only</option></select><p className="card-copy" style={{ marginTop: 18 }}>Required placeholders for DOCX rendering phase: <span className="placeholder">{'{{consumer.name}}'}</span> <span className="placeholder">{'{{bureau.name}}'}</span> <span className="placeholder">{'{{accounts_block}}'}</span></p></div></div></section>;
    if (panel === 'TXT Source') return <div className="grid cols-2"><section className="card"><h2 className="card-title">TXT Source</h2><input className="input" type="file" accept=".txt" onChange={(e) => e.target.files?.[0] && uploadTxt(e.target.files[0])} /><textarea className="input textarea" value={source} onChange={(e) => setSource(e.target.value)} placeholder="Paste source TXT here..." /></section><section className="card"><h2 className="card-title">Parsed Consumer</h2><p><strong>{parsed.name || 'No name detected'}</strong></p><p className="card-copy">{parsed.address.join(' ') || 'No address detected'}</p>{renderBureauTable()}</section></div>;
    if (panel === 'Generator') return <div className="grid cols-2"><section className="card"><h2 className="card-title">Generation Queue</h2>{renderBureauTable()}<div className="toolbar" style={{ marginTop: 18 }}><button className="btn" onClick={generate}>Generate {candidates.length} Files</button><button className="btn secondary" onClick={() => setPanel('Validation')}>Validate</button></div></section><section className="card"><h2 className="card-title">Rules</h2><p className="card-copy">One output per bureau and letter category. Empty bureau data is skipped. The current export is a TXT preview while the DOCX rendering module is completed.</p><p className="card-copy" style={{ marginTop: 16 }}>Active template: <strong>{template?.name || 'Not uploaded'}</strong><br />Type: <strong>{templateType}</strong></p></section></div>;
    if (panel === 'Validation') return <section className="card"><h2 className="card-title">Validation Center</h2><p className="card-copy">Review blockers before generating files.</p><table className="table" style={{ marginTop: 16 }}><tbody>{issues.length ? issues.map((issue) => <tr key={issue}><td><span className="badge warning">Blocker</span></td><td>{issue}</td></tr>) : <tr><td><span className="badge success">Passed</span></td><td>Template and source data are ready for generation.</td></tr>}</tbody></table></section>;
    if (panel === 'Output Files') return <section className="card"><h2 className="card-title">Generated Outputs</h2><p className="card-copy">Download generated preview files below.</p><table className="table" style={{ marginTop: 16 }}><thead><tr><th>File</th><th>Type</th><th>Created</th><th></th></tr></thead><tbody>{outputs.length ? outputs.map((o) => <tr key={o.name}><td>{o.name}</td><td>{o.bureau} · {o.type}</td><td>{o.created}</td><td><button className="btn secondary" onClick={() => save(o.name, o.content)}>Download</button></td></tr>) : <tr><td colSpan={4}>No generated outputs yet. Use the Generator tab.</td></tr>}</tbody></table></section>;
    if (panel === 'GitHub Sync') return <section className="card"><h2 className="card-title">GitHub Sync</h2><p className="card-copy">Connected project: <strong>Arisu-art/LetterGenerator</strong>. Application code is synced through committed repository updates. Generated client files stay local unless a secure storage workflow is added.</p><div className="toolbar" style={{ marginTop: 18 }}><span className="badge success">Repository connected</span></div></section>;
    return <section className="card"><h2 className="card-title">Settings</h2><div className="grid cols-2" style={{ marginTop: 18 }}><label className="stat"><input type="checkbox" checked={requireTemplate} onChange={(e) => setRequireTemplate(e.target.checked)} /> Require template before generation</label><label className="stat"><input type="checkbox" checked={appendDate} onChange={(e) => setAppendDate(e.target.checked)} /> Append date to output filename</label></div><h3>Bureau Mailing Registry</h3><pre className="input textarea" style={{ whiteSpace: 'pre-wrap' }}>{bureaus.map((b) => `${b}\n${bureauAddress[b]}`).join('\n\n')}</pre></section>;
  }
  return <main className="shell"><aside className="sidebar"><div className="brand"><div className="brand-mark" /><div><div className="brand-title">LetterGenerator</div><div className="brand-subtitle">Precision engine</div></div></div><nav className="nav">{nav.map((item) => <button key={item} className={`nav-item ${panel === item ? 'active' : ''}`} onClick={() => setPanel(item)}>{item}</button>)}</nav><div className="sidebar-footer">Template-safe mode: preserve static DOCX design.</div></aside><section className="main"><header className="header"><div><div className="eyebrow">{panel}</div><h1>Letter Workflow Console</h1><p className="lead">Connect a DOCX template to structured TXT data and route outputs by bureau.</p></div><div className="toolbar"><button className="btn secondary" onClick={() => setPanel('Validation')}>Validate</button><button className="btn" onClick={generate}>Generate {candidates.length} Files</button></div></header><div className="grid cols-3" style={{ marginBottom: 18 }}><div className="stat"><div className="stat-value">{candidates.length}</div><div className="stat-label">Files ready</div></div><div className="stat"><div className="stat-value">{parsed.inquiry.length}</div><div className="stat-label">Inquiries</div></div><div className="stat"><div className="stat-value">{outputs.length}</div><div className="stat-label">Generated</div></div></div>{content()}</section></main>;
}
