'use client';

import { useMemo, useState } from 'react';

type Bureau = 'TRANSUNION' | 'EQUIFAX' | 'EXPERIAN';
type Panel = 'Dashboard' | 'Templates' | 'TXT Source' | 'Generator' | 'Validation' | 'Output Files' | 'GitHub Sync' | 'Settings';
type Round = '1st Round' | '2nd Round' | '3rd Round' | 'Final';
type LetterKind = 'DISPUTE' | 'LATE_PAYMENT' | 'HARD_INQUIRY' | 'METHOD_OF_VERIFICATION' | 'ESCALATION' | 'FINAL_NOTICE';
type Output = { name: string; content: string; bureau: Bureau; type: LetterKind; templateName: string; created: string };
type TemplateProfile = { id: string; round: Round; kind: LetterKind; name: string; description: string; placeholders: string; enabled: boolean; fileName: string };

const bureaus: Bureau[] = ['TRANSUNION', 'EQUIFAX', 'EXPERIAN'];
const rounds: Round[] = ['1st Round', '2nd Round', '3rd Round', 'Final'];
const nav: Panel[] = ['Dashboard', 'Templates', 'TXT Source', 'Generator', 'Validation', 'Output Files', 'GitHub Sync', 'Settings'];
const standardPlaceholders = '{{consumer.name}}\n{{consumer.address}}\n{{consumer.dob}}\n{{consumer.ssn}}\n{{today.us_long}}\n{{bureau.name}}\n{{bureau.address}}\n{{accounts_block}}\n{{inquiries_block}}';
const seedTemplates: TemplateProfile[] = [
  { id: 'r1-dispute', round: '1st Round', kind: 'DISPUTE', name: 'Initial Dispute Account Letter', description: 'First submission for inaccurate or identity-theft dispute accounts.', placeholders: standardPlaceholders, enabled: true, fileName: '' },
  { id: 'r1-late', round: '1st Round', kind: 'LATE_PAYMENT', name: 'Initial Late Payment Letter', description: 'First submission for inaccurate late-payment reporting.', placeholders: standardPlaceholders, enabled: true, fileName: '' },
  { id: 'r1-inquiry', round: '1st Round', kind: 'HARD_INQUIRY', name: 'Initial Hard Inquiry Letter', description: 'First submission for unauthorized inquiry records.', placeholders: standardPlaceholders, enabled: true, fileName: '' },
  { id: 'r2-dispute', round: '2nd Round', kind: 'DISPUTE', name: 'Second Dispute Reinvestigation Letter', description: 'Follow-up dispute after incomplete or inadequate response.', placeholders: standardPlaceholders, enabled: true, fileName: '' },
  { id: 'r2-late', round: '2nd Round', kind: 'LATE_PAYMENT', name: 'Second Late Payment Follow-up', description: 'Follow-up on an uncorrected late-payment entry.', placeholders: standardPlaceholders, enabled: true, fileName: '' },
  { id: 'r2-mov', round: '2nd Round', kind: 'METHOD_OF_VERIFICATION', name: 'Method of Verification Request', description: 'Requests investigation procedure and verification details.', placeholders: standardPlaceholders, enabled: true, fileName: '' },
  { id: 'r3-dispute', round: '3rd Round', kind: 'DISPUTE', name: 'Third Dispute Escalation Letter', description: 'Escalated account dispute before final notice.', placeholders: standardPlaceholders, enabled: true, fileName: '' },
  { id: 'r3-late', round: '3rd Round', kind: 'LATE_PAYMENT', name: 'Third Late Payment Escalation', description: 'Escalated late-payment challenge before final notice.', placeholders: standardPlaceholders, enabled: true, fileName: '' },
  { id: 'r3-escalate', round: '3rd Round', kind: 'ESCALATION', name: 'Agency Escalation Notice', description: 'Escalation notice for unresolved reporting issues.', placeholders: standardPlaceholders, enabled: true, fileName: '' },
  { id: 'final-dispute', round: 'Final', kind: 'DISPUTE', name: 'Final Dispute Demand', description: 'Final demand for unresolved disputed accounts.', placeholders: standardPlaceholders, enabled: true, fileName: '' },
  { id: 'final-late', round: 'Final', kind: 'LATE_PAYMENT', name: 'Final Late Payment Demand', description: 'Final demand for unresolved late-payment entries.', placeholders: standardPlaceholders, enabled: true, fileName: '' },
  { id: 'final-notice', round: 'Final', kind: 'FINAL_NOTICE', name: 'Final Notice and Escalation Packet', description: 'Final notice template for formal escalation workflow.', placeholders: standardPlaceholders, enabled: true, fileName: '' }
];
const bureauAddress: Record<Bureau, string> = {
  TRANSUNION: 'TransUnion LLC\nP.O. Box 2000\nChester, PA 19016-2000',
  EQUIFAX: 'Equifax Information Services LLC\nPO Box 105139\nAtlanta, GA 30348',
  EXPERIAN: 'Experian\nPO Box 4500\nAllen, TX 75013'
};

function blank() {
  return { name: '', address: [] as string[], dob: '', ssn: '', open: [] as string[], dispute: { TRANSUNION: [] as string[], EQUIFAX: [] as string[], EXPERIAN: [] as string[] }, late: { TRANSUNION: [] as string[], EQUIFAX: [] as string[], EXPERIAN: [] as string[] }, inquiry: [] as string[] };
}
function bureauOf(line: string): Bureau | '' {
  const value = line.trim().replace(/:$/, '').toUpperCase();
  if (value === 'TRANSUNION' || value === 'TRANS UNION' || value === 'TU') return 'TRANSUNION';
  if (value === 'EQUIFAX' || value === 'EQ') return 'EQUIFAX';
  if (value === 'EXPERIAN' || value === 'EXP') return 'EXPERIAN';
  return '';
}
function areaOf(line: string) {
  const value = line.trim().replace(/:$/, '').toUpperCase();
  if (value.startsWith('DISPUTE')) return 'dispute';
  if (value.startsWith('LATE')) return 'late';
  if (value.startsWith('HARD')) return 'inquiry';
  if (value.startsWith('OPEN')) return 'open';
  return '';
}
function parseSource(text: string) {
  const result = blank(); const header: string[] = []; let area = 'header'; let bureau: Bureau | '' = '';
  text.split(/\r?\n/).forEach((raw) => {
    const line = raw.trim(); if (!line) return;
    const nextArea = areaOf(line); if (nextArea) { area = nextArea; bureau = ''; return; }
    const nextBureau = bureauOf(line); if (nextBureau) { bureau = nextBureau; return; }
    if (area === 'header') header.push(line);
    if (area === 'open') result.open.push(line);
    if (area === 'inquiry') result.inquiry.push(line);
    if (area === 'dispute' && bureau) result.dispute[bureau].push(line);
    if (area === 'late' && bureau) result.late[bureau].push(line);
  });
  result.name = header[0] || '';
  result.dob = (header.find((line) => line.toUpperCase().startsWith('DOB:')) || '').replace(/^DOB:\s*/i, '');
  result.ssn = (header.find((line) => line.toUpperCase().startsWith('SSN:')) || '').replace(/^SSN:\s*/i, '');
  result.address = header.slice(1).filter((line) => !/^(DOB|SSN):/i.test(line));
  return result;
}
function clean(value: string) { return (value || 'CLIENT').replace(/[^a-z0-9]+/gi, '_').replace(/^_|_$/g, '').toUpperCase(); }
function save(name: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: 'text/plain' }));
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = name; anchor.click(); URL.revokeObjectURL(url);
}

export default function Page() {
  const [panel, setPanel] = useState<Panel>('Templates');
  const [source, setSource] = useState('');
  const [library, setLibrary] = useState<TemplateProfile[]>(seedTemplates);
  const [selectedRound, setSelectedRound] = useState<Round>('1st Round');
  const [generationRound, setGenerationRound] = useState<Round>('1st Round');
  const [selectedTemplateId, setSelectedTemplateId] = useState('r1-dispute');
  const [outputs, setOutputs] = useState<Output[]>([]);
  const [status, setStatus] = useState('Configure templates by round, then upload TXT source data.');
  const [requireTemplate, setRequireTemplate] = useState(true);
  const [appendDate, setAppendDate] = useState(true);
  const parsed = useMemo(() => parseSource(source), [source]);
  const visibleTemplates = library.filter((item) => item.round === selectedRound);
  const selectedTemplate = library.find((item) => item.id === selectedTemplateId) || visibleTemplates[0];
  const queue = useMemo(() => bureaus.flatMap((bureau) => [
    parsed.dispute[bureau].length ? { bureau, kind: 'DISPUTE' as LetterKind, rows: parsed.dispute[bureau] } : null,
    parsed.late[bureau].length ? { bureau, kind: 'LATE_PAYMENT' as LetterKind, rows: parsed.late[bureau] } : null,
    parsed.inquiry.length ? { bureau, kind: 'HARD_INQUIRY' as LetterKind, rows: parsed.inquiry } : null
  ].filter(Boolean) as { bureau: Bureau; kind: LetterKind; rows: string[] }[]), [parsed]);
  const generationQueue = queue.filter((item) => library.some((profile) => profile.round === generationRound && profile.kind === item.kind && profile.enabled));
  const issues = useMemo(() => {
    const found: string[] = [];
    if (!source.trim()) found.push('TXT source has not been uploaded or pasted.');
    if (source.trim() && !parsed.name) found.push('Consumer name could not be detected from source.');
    if (source.trim() && !generationQueue.length) found.push(`No enabled ${generationRound} template matches the detected source sections.`);
    generationQueue.forEach((item) => {
      const template = library.find((profile) => profile.round === generationRound && profile.kind === item.kind && profile.enabled);
      if (requireTemplate && template && !template.fileName) found.push(`${template.name} requires an uploaded DOCX file.`);
    });
    return Array.from(new Set(found));
  }, [source, parsed.name, generationQueue, generationRound, library, requireTemplate]);

  function chooseRound(round: Round) {
    setSelectedRound(round);
    const first = library.find((item) => item.round === round);
    if (first) setSelectedTemplateId(first.id);
  }
  function updateTemplate(field: keyof TemplateProfile, value: string | boolean) {
    if (!selectedTemplate) return;
    setLibrary((current) => current.map((item) => item.id === selectedTemplate.id ? { ...item, [field]: value } : item));
  }
  function addTemplate() {
    const id = `custom-${Date.now()}`;
    const next = { id, round: selectedRound, kind: 'DISPUTE' as LetterKind, name: 'New Custom Letter', description: 'Describe when this template should be used.', placeholders: standardPlaceholders, enabled: true, fileName: '' };
    setLibrary((current) => [...current, next]); setSelectedTemplateId(id); setStatus(`New template created inside ${selectedRound}.`);
  }
  async function uploadTxt(file: File) { setSource(await file.text()); setStatus(`TXT source loaded: ${file.name}`); }
  function generate() {
    if (issues.length) { setPanel('Validation'); setStatus('Resolve validation blockers before generating outputs.'); return; }
    const date = new Date().toISOString().slice(0, 10);
    const next = generationQueue.map((item) => {
      const template = library.find((profile) => profile.round === generationRound && profile.kind === item.kind && profile.enabled)!;
      const name = `${clean(parsed.name)}_${clean(generationRound)}_${item.bureau}_${item.kind}${appendDate ? `_${date}` : ''}.txt`;
      const content = [generationRound, template.name, '', parsed.name, ...parsed.address, `DOB: ${parsed.dob}`, `SSN: ${parsed.ssn}`, '', bureauAddress[item.bureau], '', item.rows.join('\n')].join('\n');
      return { name, content, bureau: item.bureau, type: item.kind, templateName: template.name, created: new Date().toLocaleTimeString() };
    });
    setOutputs(next); setPanel('Output Files'); setStatus(`${next.length} ${generationRound} preview output file(s) generated.`);
  }
  function bureauTable() {
    return <table className="table"><thead><tr><th>Bureau</th><th>Dispute</th><th>Late Payment</th><th>Inquiry</th></tr></thead><tbody>{bureaus.map((bureau) => <tr key={bureau}><td>{bureau}</td><td><span className={`badge ${parsed.dispute[bureau].length ? 'success' : 'warning'}`}>{parsed.dispute[bureau].length ? 'Detected' : 'Skip'}</span></td><td><span className={`badge ${parsed.late[bureau].length ? 'success' : 'warning'}`}>{parsed.late[bureau].length ? 'Detected' : 'Skip'}</span></td><td><span className={`badge ${parsed.inquiry.length ? 'success' : 'warning'}`}>{parsed.inquiry.length ? 'Detected' : 'Skip'}</span></td></tr>)}</tbody></table>;
  }
  function templateCanvas() {
    return <div className="template-canvas"><section className="card"><div className="canvas-head"><div><h2 className="card-title">Template Canvas</h2><p className="card-copy">A controlled library for every dispute workflow round.</p></div><button className="btn" onClick={addTemplate}>Add Template</button></div><div className="round-tabs">{rounds.map((round) => <button key={round} className={`round-tab ${selectedRound === round ? 'selected' : ''}`} onClick={() => chooseRound(round)}>{round}<small>{library.filter((item) => item.round === round).length} letters</small></button>)}</div><div className="template-cards">{visibleTemplates.map((item) => <button key={item.id} className={`template-card ${selectedTemplate?.id === item.id ? 'selected' : ''}`} onClick={() => setSelectedTemplateId(item.id)}><span className={`badge ${item.enabled ? 'success' : 'warning'}`}>{item.kind.replaceAll('_', ' ')}</span><strong>{item.name}</strong><small>{item.fileName || 'DOCX not uploaded'}</small></button>)}</div></section>{selectedTemplate && <section className="card editor"><div className="canvas-head"><div><h2 className="card-title">Edit Template</h2><p className="card-copy">Replace the DOCX or edit its routing configuration.</p></div><label className="toggle"><input type="checkbox" checked={selectedTemplate.enabled} onChange={(event) => updateTemplate('enabled', event.target.checked)} /> Active</label></div><label className="field">Template Name<input className="input" value={selectedTemplate.name} onChange={(event) => updateTemplate('name', event.target.value)} /></label><label className="field">Letter Category<select className="input" value={selectedTemplate.kind} onChange={(event) => updateTemplate('kind', event.target.value)}><option value="DISPUTE">Dispute Account</option><option value="LATE_PAYMENT">Late Payment</option><option value="HARD_INQUIRY">Hard Inquiry</option><option value="METHOD_OF_VERIFICATION">Method of Verification</option><option value="ESCALATION">Escalation</option><option value="FINAL_NOTICE">Final Notice</option></select></label><label className="field">Purpose<textarea className="input compact" value={selectedTemplate.description} onChange={(event) => updateTemplate('description', event.target.value)} /></label><label className="field">Upload / Replace DOCX<input className="input" type="file" accept=".docx" onChange={(event) => { const file = event.target.files?.[0]; if (file) { updateTemplate('fileName', file.name); setStatus(`${file.name} assigned to ${selectedTemplate.name}.`); } }} /></label><label className="field">Approved Placeholders<textarea className="input compact code" value={selectedTemplate.placeholders} onChange={(event) => updateTemplate('placeholders', event.target.value)} /></label><p className="notice">The application stores template routing and placeholder configuration in this canvas. The DOCX remains the visual source of truth; static wording and design are not rewritten.</p></section>}</div>;
  }
  function content() {
    if (panel === 'Templates') return templateCanvas();
    if (panel === 'Dashboard') return <div className="grid cols-2"><section className="card"><h2 className="card-title">Production Workflow</h2><p className="card-copy">Choose a round, configure different templates for each letter category, upload source TXT, validate, then generate bureau-specific outputs.</p><div className="toolbar" style={{ marginTop: 18 }}><button className="btn" onClick={() => setPanel('Templates')}>Manage Templates</button><button className="btn secondary" onClick={() => setPanel('Generator')}>Generate Letters</button></div></section><section className="card"><h2 className="card-title">Template Coverage</h2>{rounds.map((round) => <div className="coverage" key={round}><strong>{round}</strong><span>{library.filter((item) => item.round === round && item.fileName).length}/{library.filter((item) => item.round === round).length} DOCX uploaded</span></div>)}</section></div>;
    if (panel === 'TXT Source') return <div className="grid cols-2"><section className="card"><h2 className="card-title">TXT Source</h2><input className="input" type="file" accept=".txt" onChange={(event) => event.target.files?.[0] && uploadTxt(event.target.files[0])} /><textarea className="input textarea" value={source} onChange={(event) => setSource(event.target.value)} placeholder="Paste TXT source here..." /></section><section className="card"><h2 className="card-title">Parsed Source Preview</h2><p><strong>{parsed.name || 'No consumer detected'}</strong></p><p className="card-copy">{parsed.address.join(' ') || 'No address detected'}</p>{bureauTable()}</section></div>;
    if (panel === 'Generator') return <div className="grid cols-2"><section className="card"><h2 className="card-title">Generation Setup</h2><label className="field">Letter Round<select className="input" value={generationRound} onChange={(event) => setGenerationRound(event.target.value as Round)}>{rounds.map((round) => <option key={round}>{round}</option>)}</select></label>{bureauTable()}<div className="toolbar" style={{ marginTop: 18 }}><button className="btn" onClick={generate}>Generate {generationQueue.length} Outputs</button><button className="btn secondary" onClick={() => setPanel('Validation')}>Validate</button></div></section><section className="card"><h2 className="card-title">Templates Used in {generationRound}</h2>{library.filter((item) => item.round === generationRound && item.enabled).map((item) => <div className="coverage" key={item.id}><strong>{item.name}</strong><span className={`badge ${item.fileName ? 'success' : 'warning'}`}>{item.fileName || 'Missing DOCX'}</span></div>)}</section></div>;
    if (panel === 'Validation') return <section className="card"><h2 className="card-title">Validation Center</h2><p className="card-copy">Generation is strict: required round templates must have their DOCX assigned.</p><table className="table" style={{ marginTop: 16 }}><tbody>{issues.length ? issues.map((issue) => <tr key={issue}><td><span className="badge warning">Blocker</span></td><td>{issue}</td></tr>) : <tr><td><span className="badge success">Passed</span></td><td>{generationRound} is ready for generation.</td></tr>}</tbody></table></section>;
    if (panel === 'Output Files') return <section className="card"><h2 className="card-title">Generated Outputs</h2><p className="card-copy">Preview exports reflect round and category routing.</p><table className="table" style={{ marginTop: 16 }}><thead><tr><th>File</th><th>Template</th><th>Created</th><th></th></tr></thead><tbody>{outputs.length ? outputs.map((output) => <tr key={output.name}><td>{output.name}</td><td>{output.templateName}<br /><small>{output.bureau} · {output.type}</small></td><td>{output.created}</td><td><button className="btn secondary" onClick={() => save(output.name, output.content)}>Download</button></td></tr>) : <tr><td colSpan={4}>No outputs generated.</td></tr>}</tbody></table></section>;
    if (panel === 'GitHub Sync') return <section className="card"><h2 className="card-title">GitHub Sync</h2><p className="card-copy">Application repository connected: <strong>Arisu-art/LetterGenerator</strong>.</p><span className="badge success">Synced application source</span><p className="notice">Sensitive client outputs should not be committed to a public repository. Keep generated letters local or add secure private storage.</p></section>;
    return <section className="card"><h2 className="card-title">Settings</h2><div className="grid cols-2"><label className="setting"><input type="checkbox" checked={requireTemplate} onChange={(event) => setRequireTemplate(event.target.checked)} /> Require DOCX assignment before generation</label><label className="setting"><input type="checkbox" checked={appendDate} onChange={(event) => setAppendDate(event.target.checked)} /> Append generation date to filenames</label></div><h3>Bureau Mailing Registry</h3><pre className="registry">{bureaus.map((bureau) => `${bureau}\n${bureauAddress[bureau]}`).join('\n\n')}</pre></section>;
  }
  return <main className="shell"><aside className="sidebar"><div className="brand"><div className="brand-mark" /><div><div className="brand-title">LetterGenerator</div><div className="brand-subtitle">Template operations</div></div></div><nav className="nav">{nav.map((item) => <button key={item} className={`nav-item ${panel === item ? 'active' : ''}`} onClick={() => setPanel(item)}>{item}</button>)}</nav><div className="sidebar-footer">Template-safe mode: each round owns distinct DOCX letters.</div></aside><section className="main"><header className="header"><div><div className="eyebrow">{panel}</div><h1>{panel === 'Templates' ? 'Template Canvas' : 'Letter Workflow Console'}</h1><p className="lead">Manage round-based templates and route TXT source data into the correct bureau letter workflow.</p></div><div className="toolbar"><button className="btn secondary" onClick={() => setPanel('Validation')}>Validate</button><button className="btn" onClick={generate}>Generate {generationQueue.length}</button></div></header><div className="grid cols-3" style={{ marginBottom: 18 }}><div className="stat"><div className="stat-value">{library.length}</div><div className="stat-label">Templates</div></div><div className="stat"><div className="stat-value">{generationQueue.length}</div><div className="stat-label">Files ready</div></div><div className="stat"><div className="stat-value">{outputs.length}</div><div className="stat-label">Generated</div></div></div>{content()}<p className="statusbar">{status}</p></section></main>;
}
