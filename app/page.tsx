'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import JSZip from 'jszip';
import { isDocx, renderReferenceDisputeDocx } from '../lib/docx-renderer';
import { renderLatePaymentReference } from '../lib/late-reference-renderer';
import { bureauInfo, bureaus, detectRoutes, parseSource, type LetterRoute, type LetterType } from '../lib/letter-engine';

type Round = '1st Round' | '2nd Round' | '3rd Round' | 'Final';
type Panel = 'Templates' | 'Source Data' | 'Generate' | 'Outputs' | 'Settings';
type Tone = 'neutral' | 'success' | 'warning' | 'accent';
type ReferenceSlot = { id: string; round: Round; type: LetterType; name: string; file: string; size?: number };
type Output = { path: string; type: LetterType; bureau: string; count: number; detail: string; blob: Blob };

const rounds: Round[] = ['1st Round', '2nd Round', '3rd Round', 'Final'];
const panels: Panel[] = ['Templates', 'Source Data', 'Generate', 'Outputs', 'Settings'];
const workflow: Panel[] = ['Templates', 'Source Data', 'Generate', 'Outputs'];
const storageKey = 'lettergenerator.visual-reference-output.v12';
const legacyKeys = [
  'lettergenerator.visual-reference-output.v11',
  'lettergenerator.visual-reference-output.v10',
  'lettergenerator.reference-accurate-letters.v9',
  'lettergenerator.category-letters.v8',
  'lettergenerator.reference-canvas.v6',
  'lettergenerator.round.library.v5'
];
const dbName = 'lettergenerator-private-templates';
const storeName = 'files';
const label: Record<LetterType, string> = { DISPUTE: 'Dispute Letter', LATE_PAYMENT: 'Late Payment Letter' };
const folder: Record<LetterType, string> = { DISPUTE: 'Dispute Letters', LATE_PAYMENT: 'Late Payment Letters' };
const US_TIME_ZONE = 'America/New_York';

function currentUsLetterDate() {
  return new Intl.DateTimeFormat('en-US', {
    month: 'long', day: 'numeric', year: 'numeric', timeZone: US_TIME_ZONE
  }).format(new Date());
}
function seedSlots(): ReferenceSlot[] {
  return rounds.flatMap((round, index) => {
    const prefix = index ? `r${index + 1}-` : '';
    return [
      { id: `${prefix}dispute-letter`, round, type: 'DISPUTE', name: `${round} Dispute Output Reference`, file: '' },
      { id: `${prefix}late-letter`, round, type: 'LATE_PAYMENT', name: `${round} Late Payment Output Reference`, file: '' }
    ];
  });
}
function mergeSaved(raw: unknown): ReferenceSlot[] {
  const slots = seedSlots();
  if (!Array.isArray(raw)) return slots;
  const previousDocuments = raw.flatMap((item: { docs?: Array<{ id: string; file?: string; size?: number }> }) => item.docs || []);
  return slots.map((slot) => {
    const direct = raw.find((item: ReferenceSlot) => item.id === slot.id && typeof item.file === 'string') as ReferenceSlot | undefined;
    const old = previousDocuments.find((item) => item.id === slot.id);
    if (direct) return { ...slot, file: direct.file, size: direct.size };
    return old ? { ...slot, file: old.file || '', size: old.size } : slot;
  });
}
function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(dbName, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(storeName)) request.result.createObjectStore(storeName);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
async function putFile(id: string, file: File) {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    tx.objectStore(storeName).put(file, id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}
async function getFile(id: string): Promise<File | null> {
  const db = await openDb();
  const file = await new Promise<File | null>((resolve, reject) => {
    const request = db.transaction(storeName, 'readonly').objectStore(storeName).get(id);
    request.onsuccess = () => resolve((request.result as File) || null);
    request.onerror = () => reject(request.error);
  });
  db.close();
  return file;
}
async function removeFile(id: string) {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    tx.objectStore(storeName).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}
function safePackageName(value: string) {
  return (value || 'CLIENT').replace(/[^a-z0-9]+/gi, '_').replace(/^_|_$/g, '').toUpperCase();
}
function documentClientName(value: string) {
  return (value || 'CLIENT').replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, ' ').trim().toUpperCase();
}
function bytes(value?: number) {
  if (!value) return '';
  return value > 1048576 ? `${(value / 1048576).toFixed(1)} MB` : `${(value / 1024).toFixed(1)} KB`;
}
function download(name: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}
function Pill({ children, tone = 'neutral' }: { children: ReactNode; tone?: Tone }) {
  return <span className={`pill ${tone}`}>{children}</span>;
}
function Empty({ title, text }: { title: string; text: string }) {
  return <div className="empty-state"><div className="empty-icon">+</div><strong>{title}</strong><p>{text}</p></div>;
}

export default function Page() {
  const [panel, setPanel] = useState<Panel>('Templates');
  const [slots, setSlots] = useState<ReferenceSlot[]>(seedSlots);
  const [round, setRound] = useState<Round>('1st Round');
  const [selectedId, setSelectedId] = useState('dispute-letter');
  const [source, setSource] = useState('');
  const [strict, setStrict] = useState(false);
  const [loading, setLoading] = useState(false);
  const [outputs, setOutputs] = useState<Output[]>([]);
  const [zipOutput, setZipOutput] = useState<{ name: string; blob: Blob } | null>(null);
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState('Upload completed DOCX output references, then upload the TXT source.');

  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) setSlots(mergeSaved(JSON.parse(saved)));
      else {
        for (const key of legacyKeys) {
          const previous = localStorage.getItem(key);
          if (previous) {
            setSlots(mergeSaved(JSON.parse(previous)));
            setStatus('Earlier uploaded document restored. Replace each slot with its finished DOCX output reference.');
            break;
          }
        }
      }
    } catch {
      setStatus('Reference library is ready.');
    }
    setReady(true);
  }, []);
  useEffect(() => {
    if (ready) localStorage.setItem(storageKey, JSON.stringify(slots));
  }, [ready, slots]);

  const roundSlots = slots.filter((slot) => slot.round === round);
  const selected = roundSlots.find((slot) => slot.id === selectedId) || roundSlots[0];
  const parsed = useMemo(() => parseSource(source), [source]);
  const routes = useMemo(() => detectRoutes(parsed), [parsed]);
  const missing = routes.filter((route) => !roundSlots.find((slot) => slot.type === route.type)?.file);
  const blockers = [
    !source.trim() ? 'Upload or paste TXT source data.' : '',
    source.trim() && !parsed.name ? 'Client information could not be read from the TXT file.' : '',
    source.trim() && !routes.length ? 'No valid dispute, hard-inquiry, or late-payment items were detected.' : ''
  ].filter(Boolean);

  function chooseRound(next: Round) {
    setRound(next);
    setSelectedId(slots.find((slot) => slot.round === next)!.id);
    setOutputs([]);
    setZipOutput(null);
  }
  async function uploadSlot(file: File) {
    if (!isDocx(file.name)) {
      setStatus('Only DOCX documents are accepted.');
      return;
    }
    await putFile(selected.id, file);
    setSlots((items) => items.map((slot) => slot.id === selected.id ? { ...slot, file: file.name, size: file.size } : slot));
    setStatus(`${selected.name} saved. It will control that document type's generated appearance.`);
  }
  async function deleteSlot() {
    if (!window.confirm(`Delete ${selected.name}?`)) return;
    await removeFile(selected.id);
    setSlots((items) => items.map((slot) => slot.id === selected.id ? { ...slot, file: '', size: undefined } : slot));
    setStatus(`${selected.name} removed.`);
  }
  async function renderRoute(route: LetterRoute, input: File, letterDate: string) {
    const identity = {
      consumerName: parsed.name,
      addressLines: parsed.address,
      dob: parsed.dob,
      ssn: parsed.ssn,
      letterDate,
      bureauName: bureauInfo[route.bureau].name,
      bureauAddressLines: bureauInfo[route.bureau].address.split('\n')
    };
    if (route.type === 'DISPUTE') {
      return renderReferenceDisputeDocx(input, { ...identity, fraudItems: route.items.map((item) => item.displayText) });
    }
    return renderLatePaymentReference(input, { ...identity, latePaymentItems: route.items.map((item) => item.displayText) });
  }
  async function generate() {
    if (blockers.length || (strict && missing.length)) {
      setPanel('Generate');
      setStatus('Resolve the generation checks shown on the screen.');
      return;
    }
    setLoading(true);
    const zip = new JSZip();
    const made: Output[] = [];
    const warnings: string[] = [];
    const date = currentUsLetterDate();
    for (const route of routes) {
      const slot = roundSlots.find((entry) => entry.type === route.type);
      if (!slot?.file) {
        warnings.push(`${label[route.type]} / ${route.bureau}: completed DOCX reference not uploaded.`);
        continue;
      }
      const input = await getFile(slot.id);
      if (!input) {
        warnings.push(`${label[route.type]} / ${route.bureau}: saved DOCX not readable.`);
        continue;
      }
      try {
        const blob = await renderRoute(route, input, date);
        const filename = `${documentClientName(parsed.name)} ${route.bureau}.docx`;
        const path = `${folder[route.type]}/${filename}`;
        zip.file(path, blob);
        made.push({ path, type: route.type, bureau: route.bureau, count: route.items.length, detail: 'Completed reference format used', blob });
      } catch (error) {
        warnings.push(`${label[route.type]} / ${route.bureau}: ${error instanceof Error ? error.message : 'rendering failed.'}`);
      }
    }
    zip.file('Generation Manifest.txt', [
      'LetterGenerator Visual Reference Manifest',
      `Client: ${parsed.name}`,
      `Round: ${round}`,
      `Letter date (US Eastern): ${date}`,
      '',
      'Output Decisions:',
      ...bureaus.flatMap((bureau) => {
        const dispute = parsed.dispute[bureau].length;
        const inquiry = parsed.inquiry[bureau].length;
        const late = parsed.late[bureau].length;
        return [
          `${dispute || inquiry ? 'CREATE' : 'SKIP'} | Dispute | ${bureau} | ${dispute} dispute account(s), ${inquiry} hard inquiry item(s)`,
          `${late ? 'CREATE' : 'SKIP'} | Late Payment | ${bureau} | ${late} item(s)`
        ];
      }),
      '',
      'Created Files:',
      ...made.map((output) => `- ${output.path}`),
      ...(warnings.length ? ['', 'Warnings:', ...warnings.map((warning) => `- ${warning}`)] : [])
    ].join('\n'));
    const packed = await zip.generateAsync({ type: 'blob' });
    setOutputs(made);
    setZipOutput({ name: `${safePackageName(parsed.name)}_${safePackageName(round)}_LETTERS.zip`, blob: packed });
    setPanel('Outputs');
    setLoading(false);
    setStatus(`${made.length} DOCX letter(s) created. Each DOCX is named using client name and bureau name.`);
  }
  function roundTabs() {
    return <nav className="stepper" aria-label="Output round">{rounds.map((item, index) => <button key={item} className={item === round ? 'current' : ''} onClick={() => chooseRound(item)}><i>{index + 1}</i><span>{item}</span></button>)}</nav>;
  }
  function templatesView() {
    return <div className="content-grid"><section className="panel"><div className="panel-heading"><div><h2>Completed output references</h2><p>Upload one finished DOCX reference per letter type and per round.</p></div><Pill tone="accent">{round}</Pill></div>{roundTabs()}<div className="documents">{roundSlots.map((slot, index) => <button key={slot.id} className={`document ${slot.id === selected.id ? 'selected' : ''}`} onClick={() => setSelectedId(slot.id)}><i>{index + 1}</i><span><strong>{slot.name}</strong><small>{slot.file || 'Finished output reference DOCX required'}</small></span><Pill tone={slot.file ? 'success' : 'warning'}>{slot.file ? 'Saved' : 'Needed'}</Pill></button>)}</div></section><section className="panel editor-panel"><div className="panel-heading"><div><h2>{selected.name}</h2><p>Completed document reference mode</p></div><Pill tone={selected.file ? 'success' : 'warning'}>{selected.file ? 'Saved' : 'Needed'}</Pill></div>{selected.file ? <div className="saved-file"><strong>{selected.file}</strong><span>{bytes(selected.size)} · DOCX</span><p>The output uses this finished document's content regions and formatting.</p></div> : <div className="upload-empty"><p>Upload a completed document that already looks exactly correct for this letter type.</p></div>}<label className="field-label">Upload / replace finished DOCX<input className="file-input" type="file" accept=".docx" onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadSlot(file); event.target.value = ''; }} /></label>{selected.file && <button className="delete-button" onClick={() => void deleteSlot()}>Delete saved file</button>}<div className="info-card"><strong>{selected.type === 'DISPUTE' ? 'Dispute reference content required' : 'Late Payment reference content required'}</strong><p>{selected.type === 'DISPUTE' ? 'Must include the client block, date, bureau block, fraudulent-items heading, one styled item example and the signature section.' : 'Must include the client block, date, bureau block, a visible late-payment items section, one correctly formatted creditor/account example and the signature section.'}</p></div></section></div>;
  }
  function sourceView() {
    return <div className="content-grid"><section className="panel"><div className="panel-heading"><div><h2>Inspect source</h2><p>Data is detected by bureau before output is created. Letter date is inserted automatically using US Eastern date.</p></div></div><label className="field-label">Upload TXT source<input className="file-input" type="file" accept=".txt" onChange={async (event) => { const file = event.target.files?.[0]; if (file) { setSource(await file.text()); setStatus('Source read. Matching outputs are now available for generation.'); } }} /></label><textarea className="source-area" value={source} onChange={(event) => setSource(event.target.value)} placeholder="Paste TXT source here…" /></section><section className="panel"><div className="panel-heading"><div><h2>Output decision canvas</h2><p>One letter per detected bureau and letter type.</p></div><Pill tone="accent">{round}</Pill></div>{roundTabs()}<div className="route-table">{bureaus.map((bureau) => { const dispute = parsed.dispute[bureau].length + parsed.inquiry[bureau].length; const late = parsed.late[bureau].length; return <div className="bureau" key={bureau}><strong>{bureau}</strong><Pill tone={dispute ? 'success' : 'neutral'}>{dispute ? `Dispute ${dispute}` : 'No Dispute'}</Pill><Pill tone={late ? 'success' : 'neutral'}>{late ? `Late ${late}` : 'No Late'}</Pill></div>; })}</div><div className="pending-list">{routes.length ? routes.map((route) => <span key={`${route.type}-${route.bureau}`}><strong>{label[route.type]} / {route.bureau}</strong> — {route.reason}</span>) : <span>No valid output. NONE and NNONE are ignored.</span>}</div><button className="action-button" onClick={() => setPanel('Generate')}>Continue with {round}</button></section></div>;
  }
  function generateView() {
    return <div className="content-grid"><section className="panel"><div className="panel-heading"><div><h2>Generate {round}</h2><p>Uses completed reference layout for dispute and late-payment documents.</p></div><Pill tone={routes.length ? 'accent' : 'neutral'}>{routes.length} letters</Pill></div>{routes.length ? <div className="route-list">{routes.map((route) => <div className="route-card" key={`${route.type}-${route.bureau}`}><strong>{route.bureau}</strong><span>{label[route.type]}</span><small>{route.reason}</small></div>)}</div> : <Empty title="No letters required" text="Upload source data first." />}<button className="action-button" disabled={loading} onClick={() => void generate()}>{loading ? 'Rendering DOCX letters…' : 'Generate DOCX Letters ZIP'}</button></section><section className="panel"><div className="panel-heading"><div><h2>Output rules</h2><p>Visual-reference document processing.</p></div></div><div className="alert success">Date is automatically inserted using the current US Eastern calendar date and is no longer editable in the UI.</div><div className="alert success">Each DOCX filename uses only the client name and the bureau name.</div><div className="alert success">ZIP contains category folders only, without bureau subfolders.</div>{blockers.map((item) => <div className="alert error" key={item}>{item}</div>)}{missing.length > 0 && <div className="pending-list"><p>Required completed reference not uploaded:</p>{missing.map((route) => <span key={`${route.type}-${route.bureau}`}>{label[route.type]} / {route.bureau}</span>)}</div>}</section></div>;
  }
  function outputsView() {
    return <section className="panel outputs"><div className="panel-heading"><div><h2>{round} output package</h2><p>DOCX files in flat category folders.</p></div><Pill tone={zipOutput ? 'success' : 'neutral'}>{outputs.length} DOCX</Pill></div>{zipOutput && <div className="info-card" style={{ marginBottom: 18 }}><strong>{zipOutput.name}</strong><p>Includes generated DOCX files and a decision manifest.</p><button className="secondary-button" style={{ marginTop: 12 }} onClick={() => download(zipOutput.name, zipOutput.blob)}>Download ZIP Package</button></div>}{outputs.length ? <div className="output-list">{outputs.map((output) => <article className="output" key={output.path}><div><Pill tone="success">Rendered DOCX</Pill><h3>{output.path}</h3><p>{output.count} item block(s) · {output.detail}</p></div></article>)}</div> : <Empty title="No outputs" text="Upload finished references, source data and generate." />}</section>;
  }
  function settingsView() {
    return <section className="panel settings"><div className="panel-heading"><div><h2>Generation rules</h2><p>Completed-reference document processing.</p></div></div><label className="setting"><input type="checkbox" checked={strict} onChange={(event) => setStrict(event.target.checked)} /><span><strong>Block missing required references</strong><small>Use once completed reference documents for required letter types are ready.</small></span></label><div className="info-card"><strong>Generated file naming</strong><p>Each generated DOCX is named as Client Name + Bureau Name, for example: CHEREITTA WARREN TRANSUNION.docx.</p></div></section>;
  }
  const step = workflow.indexOf(panel);
  return <main className="app-shell"><aside className="sidebar"><div className="brand"><span /><div><strong>LetterGenerator</strong><small>Visual reference output</small></div></div><nav aria-label="Primary navigation">{panels.map((item) => <button key={item} className={item === panel ? 'active' : ''} onClick={() => setPanel(item)}><strong>{item}</strong></button>)}</nav></aside><section className="main-area"><header className="header"><div><p className="eyebrow">{round} workflow</p><h1>{panel}</h1></div><button className="header-action" onClick={() => setPanel('Generate')}>Generate</button></header><nav className="stepper" aria-label="Workflow steps">{workflow.map((item, index) => <button key={item} className={item === panel ? 'current' : step >= 0 && index < step ? 'complete' : ''} onClick={() => setPanel(item)}><i>{index + 1}</i><span>{item}</span></button>)}</nav>{panel === 'Templates' && templatesView()}{panel === 'Source Data' && sourceView()}{panel === 'Generate' && generateView()}{panel === 'Outputs' && outputsView()}{panel === 'Settings' && settingsView()}<div className="toast" role="status" aria-live="polite">{status}</div></section></main>;
}
