'use client';

import { useEffect, useRef, useState } from 'react';
import SupportingDocumentsLayoutEditor from './SupportingDocumentsLayoutEditor';
import { loadPacketAssets, type PacketAssets } from '../lib/packet-assets';
import { readTemplateExhibit, type ExhibitKind } from '../lib/template-exhibits';
import type { Round } from '../lib/reference-store';

type Props = {
  kind: 'SUPPORTING' | 'FCRA' | 'ATTACHMENT';
  round: Round;
};

function latestSupportingKey() {
  const prefix = 'lettergenerator.packet-assets.v1.';
  const keys = Object.keys(localStorage).filter((key) => key.startsWith(prefix)).reverse();
  return keys.map((key) => key.slice(prefix.length)).find((key) => loadPacketAssets(key).supporting.length > 0) || '';
}

function EmptyInsert({ message }: { message: string }) {
  return <div className="packet-insert-status missing"><strong>None</strong><span>{message}</span></div>;
}

function StaticTemplateViewer({ kind, round }: { kind: ExhibitKind; round: Round }) {
  const host = useRef<HTMLDivElement>(null);
  const [url, setUrl] = useState('');
  const [missing, setMissing] = useState(false);
  const [docx, setDocx] = useState(false);

  useEffect(() => {
    let active = true;
    let objectUrl = '';
    setUrl('');
    setMissing(false);
    setDocx(false);
    void readTemplateExhibit(round, kind).then(async (file) => {
      if (!active) return;
      if (!file) { setMissing(true); return; }
      const isDocx = /\.docx$/i.test(file.name) || /wordprocessingml/i.test(file.type);
      if (isDocx && host.current) {
        setDocx(true);
        const { renderAsync } = await import('docx-preview');
        if (!active || !host.current) return;
        host.current.innerHTML = '';
        await renderAsync(await file.arrayBuffer(), host.current, undefined, { className: 'packet-static-docx', inWrapper: true, ignoreWidth: false, ignoreHeight: false, breakPages: true, renderHeaders: true, renderFooters: true });
        return;
      }
      objectUrl = URL.createObjectURL(file);
      setUrl(objectUrl);
    }).catch(() => setMissing(true));
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [kind, round]);

  if (missing) return <EmptyInsert message="Not configured for this packet position." />;
  if (url) return <div className="packet-static-file-view"><iframe title={`${kind} configured insert`} src={url} /></div>;
  return <div ref={host} className={docx ? 'packet-static-docx-host' : 'packet-insert-loading'}>{!docx && 'Loading configured insert…'}</div>;
}

export default function PacketInsertViewer({ kind, round }: Props) {
  const [storageKey, setStorageKey] = useState('');
  const [assets, setAssets] = useState<PacketAssets>({ supporting: [], legalPdf: null });
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (kind !== 'SUPPORTING') return;
    const key = latestSupportingKey();
    setStorageKey(key);
    setAssets(key ? loadPacketAssets(key) : { supporting: [], legalPdf: null });
  }, [kind]);

  if (kind !== 'SUPPORTING') return <StaticTemplateViewer kind={kind} round={round} />;
  if (!storageKey || !assets.supporting.length) return <EmptyInsert message="No supporting documents have been uploaded for this packet." />;
  return <div className="packet-supporting-inline"><SupportingDocumentsLayoutEditor storageKey={storageKey} assets={assets} onChanged={setAssets} onMessage={setMessage} />{message && <p className="packet-supporting-message">{message}</p>}</div>;
}
