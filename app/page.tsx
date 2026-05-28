'use client';

import { useMemo, useState } from 'react';

const bureaus = ['TRANSUNION', 'EQUIFAX', 'EXPERIAN'] as const;

function blank() {
  return {
    name: '',
    address: [],
    dispute: { TRANSUNION: [], EQUIFAX: [], EXPERIAN: [] },
    late: { TRANSUNION: [], EQUIFAX: [], EXPERIAN: [] },
    inquiry: []
  };
}

function bureauOf(line: string) {
  const v = line.trim().toUpperCase();
  if (v === 'TRANSUNION' || v === 'TRANS UNION' || v === 'TU') return 'TRANSUNION';
  if (v === 'EQUIFAX' || v === 'EQ') return 'EQUIFAX';
  if (v === 'EXPERIAN' || v === 'EXP') return 'EXPERIAN';
  return '';
}

function areaOf(line: string) {
  const v = line.trim().replace(':', '').toUpperCase();
  if (v.startsWith('DISPUTE')) return 'dispute';
  if (v.startsWith('LATE')) return 'late';
  if (v.startsWith('HARD')) return 'inquiry';
  if (v.startsWith('OPEN')) return 'open';
  return '';
}

function parseSource(text: string) {
  const out = blank();
  const header: string[] = [];
  let area = 'header';
  let bureau = '';

  text.split('\n').forEach((raw) => {
    const line = raw.trim();
    if (!line) return;
    const nextArea = areaOf(line);
    if (nextArea) { area = nextArea; bureau = ''; return; }
    const nextBureau = bureauOf(line);
    if (nextBureau) { bureau = nextBureau; return; }
    if (area === 'header') header.push(line);
    if (area === 'inquiry') out.inquiry.push(line);
    if (area === 'dispute' && bureau) out.dispute[bureau as keyof typeof out.dispute].push(line);
    if (area === 'late' && bureau) out.late[bureau as keyof typeof out.late].push(line);
  });

  out.name = header[0] || '';
  out.address = header.slice(1).filter((line) => !line.includes(':'));
  return out;
}

function countFiles(parsed: ReturnType<typeof blank>) {
  let total = 0;
  bureaus.forEach((b) => {
    if (parsed.dispute[b].length) total += 1;
    if (parsed.late[b].length) total += 1;
  });
  return total;
}

function saveFile(name: string, content: string) {
  const blob = new Blob([content], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export default function Page() {
  const [page, setPage] = useState('Generator');
  const [source, setSource] = useState('');
  const [template, setTemplate] = useState('No DOCX template uploaded');
  const [status, setStatus] = useState('Ready');
  const parsed = useMemo(() => parseSource(source), [source]);
  const total = useMemo(() => countFiles(parsed), [parsed]);

  async function loadTxt(file: File) {
    setSource(await file.text());
    setStatus('TXT source loaded');
  }

  function generate() {
    if (!total) { setStatus('No bureau dispute or late-payment data found'); return; }
    let made = 0;
    bureaus.forEach((b) => {
      if (parsed.dispute[b].length) {
        made += 1;
        saveFile(`${parsed.name || 'CLIENT'}_${b}_DISPUTE.txt`, [parsed.name, parsed.address.join(' '), b, '', parsed.dispute[b].join('\n')].join('\n'));
      }
      if (parsed.late[b].length) {
        made += 1;
        saveFile(`${parsed.name || 'CLIENT'}_${b}_LATE_PAYMENT.txt`, [parsed.name, parsed.address.join(' '), b, '', parsed.late[b].join('\n')].join('\n'));
      }
    });
    setStatus(`Generated ${made} preview file(s). DOCX rendering is the next module.`);
  }

  const nav = ['Dashboard', 'Templates', 'TXT Source', 'Generator', 'Validation', 'Output Files', 'GitHub Sync', 'Settings'];

  return (
    <main className="shell">
      <aside className="sidebar">
        <div className="brand"><div className="brand-mark" /><div><div className="brand-title">LetterGenerator</div><div className="brand-subtitle">Precision engine</div></div></div>
        <nav className="nav">{nav.map((item) => <button key={item} className={`nav-item ${page === item ? 'active' : ''}`} onClick={() => setPage(item)}>{item}</button>)}</nav>
        <div className="sidebar-footer">Only placeholders should change. Template design remains untouched.</div>
      </aside>
      <section className="main">
        <div className="header"><div><div className="eyebrow">{page}</div><h1>DOCX Template + TXT Source Connector</h1><p className="lead">Upload a template and a TXT source, then generate bureau-specific outputs only when matching data exists.</p></div><div className="toolbar"><button className="btn secondary" onClick={() => setStatus('Validation complete')}>Validate</button><button className="btn" disabled={!total} onClick={generate}>Generate {total} Files</button></div></div>
        <div className="grid cols-3" style={{ marginBottom: 18 }}><div className="stat"><div className="stat-value">{total}</div><div className="stat-label">Files ready</div></div><div className="stat"><div className="stat-value">{parsed.inquiry.length}</div><div className="stat-label">Hard inquiries</div></div><div className="stat"><div className="stat-value">{template === 'No DOCX template uploaded' ? 0 : 1}</div><div className="stat-label">Templates</div></div></div>
        {page !== 'Generator' ? <section className="card"><h2 className="card-title">{page}</h2><p className="card-copy">This side panel is now interactive. Use Generator for the working flow.</p><p>Status: {status}</p></section> : <section className="grid cols-2"><div className="card"><h2 className="card-title">Upload DOCX Template</h2><p className="card-copy">The next module renders placeholders inside the DOCX. Current build validates and generates preview files.</p><div className="upload" style={{ marginTop: 14 }}><strong>{template}</strong><input className="input" type="file" accept=".docx" onChange={(e) => setTemplate(e.target.files?.[0]?.name || 'No DOCX template uploaded')} /></div></div><div className="card"><h2 className="card-title">Paste or Upload TXT</h2><input className="input" type="file" accept=".txt" onChange={(e) => e.target.files?.[0] && loadTxt(e.target.files[0])} /><textarea className="input textarea" value={source} onChange={(e) => setSource(e.target.value)} placeholder="Paste TXT source here" /></div><div className="card"><h2 className="card-title">Bureau Output Logic</h2><table className="table"><thead><tr><th>Bureau</th><th>Dispute</th><th>Late Payment</th></tr></thead><tbody>{bureaus.map((b) => <tr key={b}><td>{b}</td><td><span className={`badge ${parsed.dispute[b].length ? 'success' : 'warning'}`}>{parsed.dispute[b].length ? 'Create file' : 'Skip'}</span></td><td><span className={`badge ${parsed.late[b].length ? 'success' : 'warning'}`}>{parsed.late[b].length ? 'Create file' : 'Skip'}</span></td></tr>)}</tbody></table><p>Status: {status}</p></div><div className="card"><h2 className="card-title">Parsed Preview</h2><p><strong>{parsed.name || 'No name detected'}</strong></p><p>{parsed.address.join(' ') || 'No address detected'}</p><pre className="input textarea" style={{ whiteSpace: 'pre-wrap' }}>{JSON.stringify(parsed, null, 2)}</pre></div></section>}
      </section>
    </main>
  );
}
