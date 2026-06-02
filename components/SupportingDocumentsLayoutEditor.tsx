'use client';

import { useEffect, useMemo, useRef, useState, type PointerEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { loadPacketFile, saveSupportingPlacement, resetSupportingPlacements, type PacketAsset, type PacketAssets, type SupportingPlacement } from '../lib/packet-assets';

type Props = { storageKey: string; assets: PacketAssets; toolbarTargetId?: string; onChanged: (assets: PacketAssets) => void; onMessage: (message: string) => void };
type Preview = { id: string; url: string };
type ToolMode = 'POSITION' | 'CROP';
type Drag = { id: string; pointerId: number; x: number; y: number; placement: SupportingPlacement; mode: ToolMode } | null;
const PAGE_RATIO = 8.5 / 11;
const MIN = 0.08;
function clamp(value: number, low: number, high: number) { return Math.max(low, Math.min(high, value)); }
function auto(index: number, count: number): SupportingPlacement { const n = Math.max(1, count); const gap = .018; const x = .08; const y = .045; const height = (1 - y * 2 - gap * (n - 1)) / n; return { x, y: y + index * (height + gap), width: 1 - x * 2, height, cropX: 0, cropY: 0, cropWidth: 1, cropHeight: 1 }; }
function placement(asset: PacketAsset, index: number, count: number) { return asset.placement || auto(index, count); }
function pct(value: number) { return `${Math.round(value * 100)}%`; }

export default function SupportingDocumentsLayoutEditor({ storageKey, assets, toolbarTargetId, onChanged, onMessage }: Props) {
  const [workingAssets, setWorkingAssets] = useState<PacketAssets>(assets);
  const [previews, setPreviews] = useState<Preview[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(assets.supporting[0]?.id || null);
  const [tool, setTool] = useState<ToolMode>('POSITION');
  const [drag, setDrag] = useState<Drag>(null);
  const [toolbarTarget, setToolbarTarget] = useState<HTMLElement | null>(null);
  const latestAssets = useRef<PacketAssets>(assets);
  const page = useRef<HTMLDivElement>(null);
  useEffect(() => { setWorkingAssets(assets); latestAssets.current = assets; }, [assets]);
  useEffect(() => { let live = true; const urls: string[] = []; void Promise.all(workingAssets.supporting.map(async (asset) => { const file = await loadPacketFile(storageKey, asset.id); if (!file) return null; const url = URL.createObjectURL(file); urls.push(url); return { id: asset.id, url }; })).then((next) => { if (live) setPreviews(next.filter(Boolean) as Preview[]); }); return () => { live = false; urls.forEach((url) => URL.revokeObjectURL(url)); }; }, [storageKey, workingAssets.supporting.length]);
  useEffect(() => { if (!workingAssets.supporting.some((asset) => asset.id === selectedId)) setSelectedId(workingAssets.supporting[0]?.id || null); }, [workingAssets.supporting, selectedId]);
  useEffect(() => { setToolbarTarget(toolbarTargetId ? document.getElementById(toolbarTargetId) : null); }, [toolbarTargetId]);
  const selectedIndex = workingAssets.supporting.findIndex((asset) => asset.id === selectedId);
  const selected = selectedIndex < 0 ? null : workingAssets.supporting[selectedIndex];
  const current = selected ? placement(selected, selectedIndex, workingAssets.supporting.length) : null;
  const images = useMemo(() => new Map(previews.map((preview) => [preview.id, preview.url])), [previews]);
  function persist(id: string, next: SupportingPlacement, publish = true) { const updated = saveSupportingPlacement(storageKey, id, next); latestAssets.current = updated; setWorkingAssets(updated); if (publish) onChanged(updated); }
  function edit(values: Partial<SupportingPlacement>, publish = true) { if (!selected || !current) return; const next = { ...current, ...values }; next.width = clamp(next.width, MIN, 1); next.height = clamp(next.height, MIN, 1); next.x = clamp(next.x, 0, 1 - next.width); next.y = clamp(next.y, 0, 1 - next.height); next.cropWidth = clamp(next.cropWidth, .1, 1); next.cropHeight = clamp(next.cropHeight, .1, 1); next.cropX = clamp(next.cropX, 0, 1 - next.cropWidth); next.cropY = clamp(next.cropY, 0, 1 - next.cropHeight); persist(selected.id, next, publish); }
  function choose(id: string) { if (id !== selectedId) setTool('POSITION'); setSelectedId(id); }
  function beginCrop() {
    setTool('CROP');
    if (current && current.cropWidth >= .99 && current.cropHeight >= .99) {
      const cropWidth = .84;
      const cropHeight = .84;
      edit({ cropWidth, cropHeight, cropX: (1 - cropWidth) / 2, cropY: (1 - cropHeight) / 2 });
    }
  }
  function doneCrop() { setTool('POSITION'); onMessage('Image crop saved for packet position 02.'); }
  function resetCrop() { edit({ cropX: 0, cropY: 0, cropWidth: 1, cropHeight: 1 }); setTool('POSITION'); onMessage('Selected image crop reset.'); }
  function start(event: PointerEvent<HTMLDivElement>, asset: PacketAsset, index: number) {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const isSelected = asset.id === selectedId;
    const dragMode: ToolMode = isSelected ? tool : 'POSITION';
    choose(asset.id);
    setDrag({ id: asset.id, pointerId: event.pointerId, x: event.clientX, y: event.clientY, placement: placement(asset, index, workingAssets.supporting.length), mode: dragMode });
  }
  function move(event: PointerEvent<HTMLDivElement>) {
    if (!drag || drag.pointerId !== event.pointerId || !page.current) return;
    const bounds = page.current.getBoundingClientRect();
    const deltaX = event.clientX - drag.x;
    const deltaY = event.clientY - drag.y;
    if (drag.mode === 'CROP') {
      const frameWidth = Math.max(1, bounds.width * drag.placement.width);
      const frameHeight = Math.max(1, bounds.height * drag.placement.height);
      persist(drag.id, { ...drag.placement, cropX: clamp(drag.placement.cropX - (deltaX / frameWidth) * drag.placement.cropWidth, 0, 1 - drag.placement.cropWidth), cropY: clamp(drag.placement.cropY - (deltaY / frameHeight) * drag.placement.cropHeight, 0, 1 - drag.placement.cropHeight) }, false);
      return;
    }
    persist(drag.id, { ...drag.placement, x: clamp(drag.placement.x + deltaX / bounds.width, 0, 1 - drag.placement.width), y: clamp(drag.placement.y + deltaY / bounds.height, 0, 1 - drag.placement.height) }, false);
  }
  function finish(event: PointerEvent<HTMLDivElement>) { if (drag?.pointerId === event.pointerId) { onChanged(latestAssets.current); setDrag(null); if (drag.mode !== 'CROP') onMessage('Evidence position saved for packet position 02.'); } }
  function resetPage() { const updated = resetSupportingPlacements(storageKey); latestAssets.current = updated; setWorkingAssets(updated); onChanged(updated); setTool('POSITION'); onMessage('Evidence page returned to automatic alignment.'); }
  if (!workingAssets.supporting.length) return null;
  const toolbar: ReactNode = <div className="evidence-header-tools"><nav className="support-image-strip" aria-label="Evidence images">{workingAssets.supporting.map((asset, index) => <button type="button" key={asset.id} className={asset.id === selectedId ? 'selected' : ''} onClick={() => choose(asset.id)}><span>{images.get(asset.id) && <img src={images.get(asset.id)} alt="" />}</span><strong>{String(index + 1).padStart(2, '0')}</strong><small>{asset.name}</small></button>)}</nav><span className="evidence-toolbar-separator controls-divider" aria-hidden="true" /><button type="button" className="evidence-auto-align" onClick={resetPage}>Reset page</button></div>;
  return <section className="support-layout-editor professional-evidence-editor word-crop-editor">
    {toolbarTarget ? createPortal(toolbar, toolbarTarget) : toolbarTargetId ? null : <header className="support-layout-header evidence-command-bar"><div className="evidence-heading"><p className="eyebrow">Evidence editor</p><h3>Supporting Documents page</h3><span>Position or crop the selected image.</span></div><span className="evidence-toolbar-separator" aria-hidden="true" />{toolbar}</header>}
    <div className="support-layout-grid word-crop-grid"><div className="support-page-frame"><div className="support-canvas-caption"><strong>Page preview</strong><span>{tool === 'CROP' ? 'Drag image to set the crop area, then click Done' : 'Drag an image to position it on the page'}</span></div><div ref={page} className={`support-page-canvas tool-${tool.toLowerCase()}`} style={{ aspectRatio: String(PAGE_RATIO) }}>{workingAssets.supporting.map((asset, index) => { const box = placement(asset, index, workingAssets.supporting.length); const url = images.get(asset.id); const selectedItem = asset.id === selectedId; return <div key={asset.id} className={`support-canvas-item ${selectedItem ? 'selected' : ''} ${selectedItem && tool === 'CROP' ? 'cropping word-cropping' : ''}`} style={{ left: pct(box.x), top: pct(box.y), width: pct(box.width), height: pct(box.height) }} onPointerDown={(event) => start(event, asset, index)} onPointerMove={move} onPointerUp={finish} onPointerCancel={finish}>{url && <img draggable={false} src={url} alt={asset.name} style={{ width: `${100 / box.cropWidth}%`, height: `${100 / box.cropHeight}%`, left: `${-(box.cropX / box.cropWidth) * 100}%`, top: `${-(box.cropY / box.cropHeight) * 100}%` }} />}{selectedItem && tool === 'CROP' && <><i className="crop-handle top-left" /><i className="crop-handle top" /><i className="crop-handle top-right" /><i className="crop-handle right" /><i className="crop-handle bottom-right" /><i className="crop-handle bottom" /><i className="crop-handle bottom-left" /><i className="crop-handle left" /></>}<span>{index + 1}</span></div>; })}</div></div>{selected && current && <aside className="support-layout-controls word-crop-controls"><header><div><p className="eyebrow">Selected image</p><strong>{selected.name}</strong></div><span>{String(selectedIndex + 1).padStart(2, '0')}</span></header><p className="word-crop-help">{tool === 'CROP' ? 'Move the image inside the fixed crop frame.' : 'Click Crop to trim this image like a Word picture.'}</p><div className="word-crop-actions">{tool === 'CROP' ? <button type="button" className="action-button" onClick={doneCrop}>Done</button> : <button type="button" className="action-button crop-command" onClick={beginCrop}>Crop</button>}<button type="button" className="secondary-button" onClick={resetCrop}>Reset crop</button></div><div className="word-position-actions"><button type="button" onClick={() => persist(selected.id, auto(selectedIndex, workingAssets.supporting.length))}>Fit page slot</button><button type="button" onClick={() => edit({ x: (1 - current.width) / 2 })}>Center</button></div></aside>}</div>
  </section>;
}
