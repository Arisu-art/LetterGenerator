'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import JSZip from 'jszip';
import { isDocx, renderDocxTemplate, type PlaceholderValues } from '../lib/docx-renderer';

type Bureau = 'TRANSUNION' | 'EQUIFAX' | 'EXPERIAN';
type Round = '1st Round' | '2nd Round' | '3rd Round' | 'Final';
type LetterType = 'DISPUTE' | 'LATE_PAYMENT';
type ItemType = 'DISPUTE_ACCOUNT' | 'HARD_INQUIRY' | 'LATE_PAYMENT';
type Section = 'header' | 'dispute' | 'inquiry' | 'late' | 'ignore';
type Panel = 'Templates' | 'Source Data' | 'Generate' | 'Outputs' | 'Settings';
type Tone = 'neutral' | 'success' | 'warning' | 'accent';
type Template = { id: string; round: Round; type: LetterType; name: string; file: string; size?: number };
type SourceItem = { type: ItemType; displayText: string; lines: string[] };
type Parsed = {
  name: string;
  address: string[];
  dob: string;
  ssn: string;
  dispute: Record<Bureau, SourceItem[]>;
  inquiry: Record<Bureau, SourceItem[]>;
  late: Record<Bureau, SourceItem[]>;
};
type Route = { bureau: Bureau; type: LetterType; items: SourceItem[]; reason: string };
type Output = { path: string; type: LetterType; bureau: Bureau; count: number; blob: Blob };

const rounds: Round[] = ['1st Round', '2nd Round', '3rd Round', 'Final'];
const bureaus: Bureau[] = ['TRANSUNION', 'EQUIFAX', 'EXPERIAN'];
const panels: Panel[] = ['Templates', 'Source Data', 'Generate', 'Outputs', 'Settings'];
const workflow: Panel[] = ['Templates', 'Source Data', 'Generate', 'Outputs'];
const storageKey = 'lettergenerator.reference-accurate-letters.v9';
const oldKeys = ['lettergenerator.category-letters.v8', 'lettergenerator.reference-canvas.v6', 'lettergenerator.round.library.v5', 'lettergenerator.round.library.v4', 'lettergenerator.round.library.v3', 'lettergenerator.first-round.library.v2'];
const databaseName = 'lettergenerator-private-templates';
const storeName = 'files';
const labels: Record<LetterType, string> = { DISPUTE: 'Dispute Letter', LATE_PAYMENT: 'Late Payment Letter' };
const folders: Record<LetterType, string> = { DISPUTE: 'Dispute Letters', LATE_PAYMENT: 'Late Payment Letters' };
const bureauInfo: Record<Bureau, { name: string; address: string }> = {
  TRANSUNION: { name: 'TransUnion LLC Consumer Dispute Center', address: 'PO Box 2000\nChester, PA 19016' },
  EQUIFAX: { name: 'Equifax Information Services LLC', address: 'PO Box 105139\nAtlanta, GA 30348' },
  EXPERIAN: { name: 'Experian', address: 'PO Box 4500\nAllen, TX 75013' }
};
const identityTheftStatement = 'Pursuant to 15 USC 1681a(3), this account does not constitute a legitimate consumer obligation. My personal information was used without authorization, and this tradeline is the direct result of identity theft.';
const placeholderGuide = [
  '{{consumer.name}}', '{{consumer.address}}', '{{consumer.dob}}', '{{consumer.ssn}}', '{{today.us_long}}',
  '{{bureau.name}}', '{{bureau.address}}', '{{accounts_block}}', '{{late_payments_block}}',
  '{{#fraud_items}}  {{display_text}}  {{/fraud_items}}'
].join('\n');

function seedTemplates(): Template[] {
  return rounds.flatMap((round, index) => {
    const prefix = index === 0 ? '' : `r${index + 1}-`;
    return [
      { id: `${prefix}dispute-letter`, round, type: 'DISPUTE', name: `${round} Dispute Letter`, file: '' },
      { id: `${prefix}late-letter`, round, type: 'LATE_PAYMENT', name: `${round} Late Payment Letter`, file: '' }
    ];
  });
}
function itemMap(): Record<Bureau, SourceItem[]> { return { TRANSUNION: [], EQUIFAX: [], EXPERIAN: [] }; }
function normal(value: string) { return value.replace(/:$/, '').replace(/\s+/g, ' ').trim().toUpperCase(); }
function bureauOf(value: string): Bureau | '' {
  const key = normal(value);
  if (key === 'TRANSUNION' || key === 'TRANS UNION' || key === 'TU') return 'TRANSUNION';
  if (key === 'EQUIFAX' || key === 'EQ') return 'EQUIFAX';
  if (key === 'EXPERIAN' || key === 'EXP') return 'EXPERIAN';
  return '';
}
function sectionOf(value: string): Section | '' {
  const key = normal(value);
  if (/^(FOR\s+)?DISPUTE(\s+(ACCOUNT|ACCOUNTS|ITEM|ITEMS|LETTER|LETTERS))?S?$/.test(key)) return 'dispute';
  if (/^HARD\s*(INQ|INQUIRY|INQUIRIES)/.test(key)) return 'inquiry';
  if (/^LATE\s*PAYMENTS?(\s+(ACCOUNT|ACCOUNTS|ITEM|ITEMS|LETTER|LETTERS))?S?$/.test(key)) return 'late';
  if (/^OPEN\s+ACCOUNT/.test(key) || /^PHONE/.test(key) || /^EMAIL/.test(key)) return 'ignore';
  return '';
}
function isNoData(value: string) {
  return /^(N+ONE|NONE|NO\s+(ACCOUNT|ACCOUNTS|ITEM|ITEMS|LATE\s+PAYMENTS?)|N\/?A|NOTHING)$/i.test(normal(value));
}
function createItem(type: ItemType, lines: string[]): SourceItem | null {
  const cleaned = lines.map((line) => line.trim()).filter(Boolean);
  if (!cleaned.length || cleaned.every(isNoData)) return null;
  return { type, lines: cleaned, displayText: cleaned.join('\n') };
}
function parseSource(text: string): Parsed {
  const parsed: Parsed = { name: '', address: [], dob: '', ssn: '', dispute: itemMap(), inquiry: itemMap(), late: itemMap() };
  const header: string[] = [];
  let section: Section = 'header';
  let bureau: Bureau | '' = '';
  let buffer: string[] = [];

  const flush = () => {
    if (!bureau || !buffer.length) { buffer = []; return; }
    if (section === 'dispute') {
      const item = createItem('DISPUTE_ACCOUNT', buffer);
      if (item) parsed.dispute[bureau].push(item);
    }
    if (section === 'late') {
      const item = createItem('LATE_PAYMENT', buffer);
      if (item) parsed.late[bureau].push(item);
    }
    buffer = [];
  };

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) { flush(); continue; }
    const nextSection = sectionOf(line);
    if (nextSection) { flush(); section = nextSection; bureau = ''; continue; }
    const nextBureau = bureauOf(line);
    if (nextBureau) { flush(); bureau = nextBureau; continue; }
    if (section === 'header') { header.push(line); continue; }
    if (section === 'inquiry' && bureau) {
      const item = createItem('HARD_INQUIRY', [line]);
      if (item) parsed.inquiry[bureau].push(item);
      continue;
    }
    if ((section === 'dispute' || section === 'late') && bureau) {
      if (/^ACCOUNT\s+NAME:/i.test(line) && buffer.length) flush();
      buffer.push(line);
    }
  }
  flush();
  parsed.name = header[0] || '';
  parsed.dob = (header.find((item) => /^DOB:/i.test(item)) || '').replace(/^DOB:\s*/i, '');
  parsed.ssn = (header.find((item) => /^SSN:/i.test(item)) || '').replace(/^SSN:\s*/i, '');
  parsed.address = header.slice(1).filter((item) => !/^(DOB|SSN):/i.test(item));
  return parsed;
}
function detectedRoutes(parsed: Parsed): Route[] {
  return bureaus.flatMap((bureau) => {
    const disputeAccounts = parsed.dispute[bureau];
    const inquiries = parsed.inquiry[bureau];
    const latePayments = parsed.late[bureau];
    const routes: Route[] = [];
    if (disputeAccounts.length || inquiries.length) {
      const reason = disputeAccounts.length && inquiries.length
        ? `${disputeAccounts.length} dispute account(s) and ${inquiries.length} hard inquiry item(s) detected.`
        : disputeAccounts.length
          ? `${disputeAccounts.length} dispute account(s) detected.`
          : `${inquiries.length} hard inquiry item(s) detected.`;
      routes.push({ bureau, type: 'DISPUTE', items: [...disputeAccounts, ...inquiries], reason });
    }
    if (latePayments.length) {
      routes.push({ bureau, type: 'LATE_PAYMENT', items: latePayments, reason: `${latePayments.length} late-payment item(s) detected.` });
    }
    return routes;
  });
}
function migrateTemplates(saved: unknown): Template[] {
  const seed = seedTemplates();
  if (!Array.isArray(saved)) return seed;
  const legacyDocs = saved.flatMap((item: { docs?: Array<{ id: string; file?: string; size?: number }> }) => item.docs || []);
  return seed.map((slot) => {
    const direct = saved.find((item: Template) => item.id === slot.id && typeof item.file === 'string') as Template | undefined;
    const doc = legacyDocs.find((item) => item.id === slot.id);
    return direct ? { ...slot, file: direct.file, size: direct.size } : doc ? { ...slot, file: doc.file || '', size: doc.size } : slot;
  });
}
function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1);
    request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains(storeName)) request.result.createObjectStore(storeName); };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
async function storeFile(id: string, file: File) {
  const db = await openDatabase();
  await new Promise<void>((resolve, reject) => { const tx = db.transaction(storeName, 'readwrite'); tx.objectStore(storeName).put(file, id); tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); });
  db.close();
}
async function readFile(id: string): Promise<File | null> {
  const db = await openDatabase();
  const file = await new Promise<File | null>((resolve, reject) => { const request = db.transaction(storeName, 'readonly').objectStore(storeName).get(id); request.onsuccess = () => resolve((request.result as File) || null); request.onerror = () => reject(request.error); });
  db.close();
  return file;
}
async function removeFile(id: string) {
  const db = await openDatabase();
  await new Promise<void>((resolve, reject) => { const tx = db.transaction(storeName, 'readwrite'); tx.objectStore(storeName).delete(id); tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); });
  db.close();
}
function clean(value: string) { return (value || 'CLIENT').replace(/[^a-z0-9]+/gi, '_').replace(/^_|_$/g, '').toUpperCase(); }
function displayDate(value: string) { return new Intl.DateTimeFormat('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' }).format(new Date(`${value}T00:00:00Z`)); }
function bytes(value?: number) { return value ? value >= 1048576 ? `${(value / 1048576).toFixed(1)} MB` : `${(value / 1024).toFixed(1)} KB` : ''; }
function download(name: string, blob: Blob) { const url = URL.createObjectURL(blob); const link = window.document.createElement('a'); link.href = url; link.download = name; link.click(); URL.revokeObjectURL(url); }
function Pill({ children, tone = 'neutral' }: { children: ReactNode; tone?: Tone }) { return <span className={`pill ${tone}`}>{children}</span>; }
function Empty({ title, text }: { title: string; text: string }) { return <div className="empty-state"><div className="empty-icon">+</div><strong>{title}</strong><p>{text}</p></div>; }

export default function Page() {
  const [panel, setPanel] = useState<Panel>('Templates');
  const [templates, setTemplates] = useState<Template[]>(seedTemplates);
  const [round, setRound] = useState<Round>('1st Round');
  const [selectedId, setSelectedId] = useState('dispute-letter');
  const [source, setSource] = useState('');
  const [letterDate, setLetterDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [strict, setStrict] = useState(false);
  const [loading, setLoading] = useState(false);
  const [outputs, setOutputs] = useState<Output[]>([]);
  const [zipOutput, setZipOutput] = useState<{ name: string; blob: Blob } | null>(null);
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState('Upload the DOCX templates, then import your source file.');

  useEffect(() => {
    try {
      const current = window.localStorage.getItem(storageKey);
      if (current) setTemplates(migrateTemplates(JSON.parse(current)));
      else {
        for (const key of oldKeys) {
          const prior = window.localStorage.getItem(key);
          if (prior) { setTemplates(migrateTemplates(JSON.parse(prior))); setStatus('Existing saved DOCX templates restored.'); break; }
        }
      }
    } catch { setStatus('Template library ready for upload.'); }
    setReady(true);
  }, []);
  useEffect(() => { if (ready) window.localStorage.setItem(storageKey, JSON.stringify(templates)); }, [ready, templates]);

  const roundTemplates = templates.filter((item) => item.round === round);
  const selected = roundTemplates.find((item) => item.id === selectedId) || roundTemplates[0];
  const parsed = useMemo(() => parseSource(source), [source]);
  const routes = useMemo(() => detectedRoutes(parsed), [parsed]);
  const missing = routes.filter((route) => !roundTemplates.find((item) => item.type === route.type)?.file);
  const blockers = [
    !source.trim() ? 'Upload or paste TXT source data.' : '',
    source.trim() && !parsed.name ? 'Consumer name was not detected.' : '',
    source.trim() && !routes.length ? 'No valid dispute, hard-inquiry or late-payment data was detected per bureau.' : ''
  ].filter(Boolean);

  function selectRound(next: Round) { setRound(next); const initial = templates.find((item) => item.round === next)!; setSelectedId(initial.id); setOutputs([]); setZipOutput(null); }
  async function uploadTemplate(file: File) {
    if (!isDocx(file.name)) { setStatus('Letter template must be a .docx file.'); return; }
    await storeFile(selected.id, file);
    setTemplates((items) => items.map((item) => item.id === selected.id ? { ...item, file: file.name, size: file.size } : item));
    setStatus(`${selected.name} saved. It remains until replaced or deleted.`);
  }
  async function deleteTemplate() {
    if (!window.confirm(`Delete ${selected.name}?`)) return;
    await removeFile(selected.id);
    setTemplates((items) => items.map((item) => item.id === selected.id ? { ...item, file: '', size: undefined } : item));
    setStatus(`${selected.name} deleted.`);
  }
  function values(route: Route): PlaceholderValues {
    const itemBlocks = route.items.map((item) => `${item.displayText}\n${identityTheftStatement}`).join('\n\n');
    const disputeAccounts = route.items.filter((item) => item.type === 'DISPUTE_ACCOUNT');
    const inquiries = route.items.filter((item) => item.type === 'HARD_INQUIRY');
    return {
      'consumer.name': parsed.name,
      'consumer.address': parsed.address.join('\n'),
      'consumer.dob': parsed.dob,
      'consumer.ssn': parsed.ssn,
      'today.us_long': displayDate(letterDate),
      'bureau.name': bureauInfo[route.bureau].name,
      'bureau.address': bureauInfo[route.bureau].address,
      accounts_block: route.type === 'DISPUTE' ? itemBlocks : '',
      dispute_accounts_block: disputeAccounts.map((item) => item.displayText).join('\n\n'),
      inquiries_block: inquiries.map((item) => item.displayText).join('\n\n'),
      late_payments_block: route.type === 'LATE_PAYMENT' ? route.items.map((item) => item.displayText).join('\n\n') : '',
      fraud_items: route.type === 'DISPUTE' ? route.items.map((item) => ({ display_text: item.displayText, identity_theft_statement: identityTheftStatement })) : [],
      late_payment_items: route.type === 'LATE_PAYMENT' ? route.items.map((item) => ({ display_text: item.displayText })) : []
    };
  }
  async function generate() {
    if (blockers.length || (strict && missing.length)) { setPanel('Generate'); setStatus('Resolve the checks before generation.'); return; }
    setLoading(true);
    const zip = new JSZip(); const created: Output[] = []; const warnings: string[] = [];
    for (const route of routes) {
      const slot = roundTemplates.find((item) => item.type === route.type);
      if (!slot?.file) { warnings.push(`${labels[route.type]} / ${route.bureau}: upload its DOCX template first.`); continue; }
      const file = await readFile(slot.id);
      if (!file) { warnings.push(`${labels[route.type]} / ${route.bureau}: stored template cannot be read.`); continue; }
      try {
        const rendered = await renderDocxTemplate(file, values(route));
        const filename = `${clean(parsed.name)}_${clean(round)}_${route.bureau}_${route.type}_LETTER.docx`;
        const path = `${folders[route.type]}/${route.bureau}/${filename}`;
        zip.file(path, rendered);
        created.push({ path, type: route.type, bureau: route.bureau, count: route.items.length, blob: rendered });
      } catch { warnings.push(`${labels[route.type]} / ${route.bureau}: verify DOCX placeholder or repeating-block tags.`); }
    }
    zip.file('Generation Manifest.txt', [
      'LetterGenerator Reference-Accurate Manifest', `Consumer: ${parsed.name}`, `Round: ${round}`, `Letter date: ${displayDate(letterDate)}`, '', 'Source decision canvas:',
      ...bureaus.flatMap((bureau) => {
        const accounts = parsed.dispute[bureau].length; const inquiries = parsed.inquiry[bureau].length; const late = parsed.late[bureau].length;
        return [
          `${accounts || inquiries ? 'CREATE' : 'SKIP'} | Dispute Letter | ${bureau} | ${accounts} dispute account(s), ${inquiries} hard inquiry item(s)`,
          `${late ? 'CREATE' : 'SKIP'} | Late Payment Letter | ${bureau} | ${late} late-payment item(s)`
        ];
      }), '', 'Created DOCX files:', ...created.map((file) => `- ${file.path}`), ...(warnings.length ? ['', 'Warnings:', ...warnings.map((warning) => `- ${warning}`)] : [])
    ].join('\n'));
    const blob = await zip.generateAsync({ type: 'blob' });
    setOutputs(created); setZipOutput({ name: `${clean(parsed.name)}_${clean(round)}_LETTERS.zip`, blob }); setPanel('Outputs'); setLoading(false);
    setStatus(`${created.length} DOCX letter(s) created. Dispute outputs combine bureau-specific dispute accounts and hard inquiries; late-payment outputs require late-payment data.`);
  }
  function roundTabs() { return <nav className="stepper" aria-label="Output round">{rounds.map((item, index) => <button key={item} className={item === round ? 'current' : ''} onClick={() => selectRound(item)}><i>{index + 1}</i><span>{item}</span></button>)}</nav>; }
  function templatesView() { return <div className="content-grid"><section className="panel"><div className="panel-heading"><div><h2>DOCX letter templates</h2><p>Dispute templates render dispute accounts and hard inquiries. Late Payment templates render only late-payment data.</p></div><Pill tone="accent">{round}</Pill></div>{roundTabs()}<div className="documents">{roundTemplates.map((item, index) => <button key={item.id} className={`document ${item.id === selected.id ? 'selected' : ''}`} onClick={() => setSelectedId(item.id)}><i>{index + 1}</i><span><strong>{item.name}</strong><small>{item.file || 'DOCX not uploaded'}</small></span><Pill tone={item.file ? 'success' : 'warning'}>{item.file ? 'Saved' : 'Needed'}</Pill></button>)}</div></section><section className="panel editor-panel"><div className="panel-heading"><div><h2>{selected.name}</h2><p>{selected.type === 'DISPUTE' ? 'Receives dispute accounts + hard inquiries' : 'Receives late-payment records only'}</p></div><Pill tone={selected.file ? 'success' : 'warning'}>{selected.file ? 'Saved' : 'Needed'}</Pill></div>{selected.file ? <div className="saved-file"><strong>{selected.file}</strong><span>{bytes(selected.size)} · .docx</span><p>Saved until explicitly replaced or deleted.</p></div> : <div className="upload-empty"><p>Upload a DOCX with approved placeholders.</p></div>}<label className="field-label">Upload / replace DOCX<input className="file-input" type="file" accept=".docx" onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadTemplate(file); event.target.value = ''; }} /></label>{selected.file && <button className="delete-button" onClick={() => void deleteTemplate()}>Delete saved file</button>}<div className="info-card"><strong>Template tags</strong><pre style={{ whiteSpace: 'pre-wrap', marginBottom: 0 }}>{placeholderGuide}</pre></div></section></div>; }
  function sourceView() { return <div className="content-grid"><section className="panel"><div className="panel-heading"><div><h2>Inspect source</h2><p>Source content is separated by bureau and category before any letter is created.</p></div></div><label className="field-label">Upload TXT source<input className="file-input" type="file" accept=".txt" onChange={async (event) => { const file = event.target.files?.[0]; if (file) { setSource(await file.text()); setStatus('Source assessed: dispute letters include valid dispute accounts and hard inquiries per bureau.'); } }} /></label><label className="field-label">Letter date<input className="file-input" type="date" value={letterDate} onChange={(event) => setLetterDate(event.target.value)} /></label><textarea className="source-area" value={source} onChange={(event) => setSource(event.target.value)} placeholder="Paste TXT source here…" /></section><section className="panel"><div className="panel-heading"><div><h2>Output decision canvas</h2><p>Green outputs will generate one DOCX for that bureau.</p></div><Pill tone="accent">{round}</Pill></div>{roundTabs()}<div className="route-table">{bureaus.map((bureau) => { const accounts = parsed.dispute[bureau].length; const inquiries = parsed.inquiry[bureau].length; const late = parsed.late[bureau].length; const disputeOutput = accounts + inquiries; return <div className="bureau" key={bureau}><strong>{bureau}</strong><Pill tone={disputeOutput ? 'success' : 'neutral'}>{disputeOutput ? `Dispute ${disputeOutput}` : 'No Dispute'}</Pill><Pill tone={late ? 'success' : 'neutral'}>{late ? `Late ${late}` : 'No Late'}</Pill></div>; })}</div><div className="pending-list">{routes.length ? routes.map((route) => <span key={`${route.type}-${route.bureau}`}><strong>{labels[route.type]} / {route.bureau}</strong> — {route.reason}</span>) : <span>No valid output detected. Values such as NONE and NNONE are ignored.</span>}</div><button className="action-button" onClick={() => setPanel('Generate')}>Continue with {round}</button></section></div>; }
  function generateView() { return <div className="content-grid"><section className="panel"><div className="panel-heading"><div><h2>Generate {round}</h2><p>One DOCX per required bureau/category pair, delivered in one ZIP.</p></div><Pill tone={routes.length ? 'accent' : 'neutral'}>{routes.length} letter{routes.length === 1 ? '' : 's'}</Pill></div>{routes.length ? <div className="route-list">{routes.map((route) => <div className="route-card" key={`${route.type}-${route.bureau}`}><strong>{route.bureau}</strong><span>{labels[route.type]}</span><small>{route.reason}</small></div>)}</div> : <Empty title="No letters required" text="Upload source data containing dispute, hard-inquiry, or late-payment records." />}<button className="action-button" disabled={loading} onClick={() => void generate()}>{loading ? 'Rendering DOCX letters…' : 'Generate DOCX Letters ZIP'}</button></section><section className="panel"><div className="panel-heading"><div><h2>Reference logic</h2><p>Implemented from the completed output documents.</p></div></div><div className="alert success"><strong>Dispute output:</strong> One bureau DOCX is created when a dispute account or hard inquiry exists; both are inserted as repeated fraudulent items.</div><div className="alert success"><strong>Late-payment output:</strong> One bureau DOCX is created only when its Late Payment section contains records.</div><div className="alert success"><strong>Placeholder output:</strong> Each source item becomes a formatted item block, not a numbered filler value.</div>{blockers.map((error) => <div className="alert error" key={error}>{error}</div>)}{missing.length > 0 && <div className="pending-list"><p>DOCX template missing for detected output:</p>{missing.map((route) => <span key={`${route.type}-${route.bureau}`}>{labels[route.type]} / {route.bureau}</span>)}</div>}</section></div>; }
  function outputsView() { return <section className="panel outputs"><div className="panel-heading"><div><h2>{round} letters ZIP</h2><p>DOCX files grouped by purpose and bureau, with a decision manifest.</p></div><Pill tone={zipOutput ? 'success' : 'neutral'}>{outputs.length} DOCX</Pill></div>{zipOutput && <div className="info-card" style={{ marginBottom: 18 }}><strong>{zipOutput.name}</strong><p>Contains generated letters and a manifest explaining each created or skipped route.</p><button className="secondary-button" style={{ marginTop: 12 }} onClick={() => download(zipOutput.name, zipOutput.blob)}>Download ZIP Package</button></div>}{outputs.length ? <div className="output-list">{outputs.map((file) => <article className="output" key={file.path}><div><Pill tone="success">Rendered DOCX</Pill><h3>{file.path}</h3><p>{file.count} formatted item block(s) inserted.</p></div></article>)}</div> : <Empty title="No DOCX output" text="Upload templates, assess source data, and generate." />}</section>; }
  function settingsView() { return <section className="panel settings"><div className="panel-heading"><div><h2>Production rules</h2><p>Reference-driven generation configuration.</p></div></div><label className="setting"><input type="checkbox" checked={strict} onChange={(event) => setStrict(event.target.checked)} /><span><strong>Block when a required DOCX template is missing</strong><small>Recommended after the correct dispute and late-payment templates are uploaded.</small></span></label><div className="info-card"><strong>Dispute template repeating block</strong><p>For dynamic bureau items, use <code>{'{{#fraud_items}}'}</code>, <code>{'{{display_text}}'}</code>, <code>{'{{identity_theft_statement}}'}</code>, and <code>{'{{/fraud_items}}'}</code>. Alternatively, <code>{'{{accounts_block}}'}</code> inserts the complete preformatted block.</p></div></section>; }
  const step = workflow.indexOf(panel);
  return <main className="app-shell"><aside className="sidebar"><div className="brand"><span /><div><strong>LetterGenerator</strong><small>Reference logic</small></div></div><nav aria-label="Primary navigation">{panels.map((item) => <button key={item} className={item === panel ? 'active' : ''} onClick={() => setPanel(item)}><strong>{item}</strong></button>)}</nav></aside><section className="main-area"><header className="header"><div><p className="eyebrow">{round} workflow</p><h1>{panel}</h1></div><button className="header-action" onClick={() => setPanel('Generate')}>Generate</button></header><nav className="stepper" aria-label="Workflow steps">{workflow.map((item, index) => <button key={item} className={item === panel ? 'current' : step >= 0 && index < step ? 'complete' : ''} onClick={() => setPanel(item)}><i>{index + 1}</i><span>{item}</span></button>)}</nav>{panel === 'Templates' && templatesView()}{panel === 'Source Data' && sourceView()}{panel === 'Generate' && generateView()}{panel === 'Outputs' && outputsView()}{panel === 'Settings' && settingsView()}<div className="toast" role="status" aria-live="polite">{status}</div></section></main>;
}
