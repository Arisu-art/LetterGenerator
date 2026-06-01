'use client';

import { useEffect, useMemo, useRef, useState, type PointerEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { loadPacketFile, saveSupportingPlacement, resetSupportingPlacements, type PacketAsset, type PacketAssets, type SupportingPlacement } from '../lib/packet-assets';

type Props = { storageKey: string; assets: PacketAssets; toolbarTargetId?: string; onChanged: (assets: PacketAssets) => void; onMessage: (message: string) => void };
type Preview = { id: string; url: string };
type ToolMode = 'MOVE' | 'CROP';
type Drag = { id: string; pointerId: number; x: number; y: number; placement: SupportingPlacement; mode: ToolMode } | null;
const PAGE_RATIO = 8.5 / 11;
const MIN = 0.08;
function clamp(value: number, low: number, high: number) { return Math.max(low, Math.min(high, value)); }
function auto(index: number, count: number): SupportingPlacement { const n = Math.max(1, count); const gap = .018; const x = .08; const y = .045; const height = (1 - y * 2 - gap * (n - 1)) / n; return { x, y: y + index * (height + gap), width: 1 - x * 2, height, cropX: 0, cropY: 0, cropWidth: 1, cropHeight: 1 }; }
function placement(asset: PacketAsset, index: number, count: number) { return asset.placement || auto(index, count); }
function pct(value: number) { return `${Math.round(value * 100)}%`; }

export default function SupportingDocumentsLayoutEditor({ storageKey, assets, toolbarTargetId, onChanged, onMessage }: Props) {
  const [previews, setPreviews] = useState<Preview[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(assets.supporting[0]?.id || null);
  const [tool, setTool] = useState<ToolMode>('MOVE');
  const [drag, setDrag] = useState<Drag>(null);
  const [toolbarTarget, setToolbarTarget] = useState<HTMLElement | null>(null);
  const page = useRef<HTMLDivElement>(null);
  useEffect(() => { let live = true; const urls: string[] = []; void Promise.all(assets.supporting.map(async (asset) => { const file = await loadPacketFile(storageKey, asset.id); if (!file) return null; const url = URL.createObjectURL(file); urls.push(url); return { id: asset.id, url }; })).then((next) => { if (live) setPreviews(next.filter(Boolean) as Preview[]); }); return () => { live = false; urls.forEach((url) => URL.revokeObjectURL(url)); }; }, [storageKey, assets.supporting]);
  useEffect(() => { if (!assets.supporting.some((asset) => asset.id === selectedId)) setSelectedId(assets.supporting[0]?.id || null); }, [assets.supporting, selectedId]);
  useEffect(() => { setToolbarTarget(toolbarTargetId ? document.getElementById(toolbarTargetId) : null); }, [toolbarTargetId]);
  const selectedIndex = assets.supporting.findIndex((asset) => asset.id === selectedId);
  const selected = selectedIndex < 0 ? null : assets.supporting[selectedIndex];
  const current = selected ? placement(selected, selectedIndex, assets.supporting.length) : null;
  const images = useMemo(() => new Map(previews.map((preview) => [preview.id, preview.url])), [previews]);
  function persist(id: string, next: SupportingPlacement) { onChanged(saveSupportingPlacement(storageKey, id, next)); }
  function edit(values: Partial<SupportingPlacement>) { if (!selected || !current) return; const next = { ...current, ...values }; next.width = clamp(next.width, MIN, 1); next.height = clamp(next.height, MIN, 1); next.x = clamp(next.x, 0, 1 - next.width); next.y = clamp(next.y, 0, 1 - next.height); next.cropWidth = clamp(next.cropWidth, .1, 1); next.cropHeight = clamp(next.cropHeight, .1, 1); next.cropX = clamp(next.cropX, 0, 1 - next.cropWidth); next.cropY = clamp(next.cropY, 0, 1 - next.cropHeight); persist(selected.id, next); }
  function zoom(delta: number) { if (!current) return; const cropWidth = clamp(current.cropWidth + delta, .1, 1); const cropHeight = clamp(current.cropHeight + delta, .1, 1); edit({ cropWidth, cropHeight, cropX: clamp(current.cropX + (current.cropWidth - cropWidth) / 2, 0, 1 - cropWidth), cropY: clamp(current.cropY + (current.cropHeight - cropHeight) / 2, 0, 1 - cropHeight) }); }
  function useCropTool() { setTool('CROP'); if (current && current.cropWidth >= .99 && current.cropHeight >= .99) zoom(-.18); }
  function start(event: PointerEvent<HTMLDivElement>, asset: PacketAsset, index: number) { event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); setSelectedId(asset.id); setDrag({ id: asset.id, pointerId: event.pointerId, x: event.clientX, y: event.clientY, placement: placement(asset, index, assets.supporting.length), mode: tool }); }
  function move(event: PointerEvent<HTMLDivElement>) {
    if (!drag || drag.pointerId !== event.pointerId || !page.current) return;
    const bounds = page.current.getBoundingClientRect();
    const deltaX = event.clientX - drag.x;
    const deltaY = event.clientY - drag.y;
    if (drag.mode === 'CROP') {
      const frameWidth = Math.max(1, bounds.width * drag.placement.width);
      const frameHeight = Math.max(1, bounds.height * drag.placement.height);
      persist(drag.id, { ...drag.placement, cropX: clamp(drag.placement.cropX - (deltaX / frameWidth) * drag.placement.cropWidth, 0, 1 - drag.placement.cropWidth), cropY: clamp(drag.placement.cropY - (deltaY / frameHeight) * drag.placement.cropHeight, 0, 1 - drag.placement.cropHeight) });
      return;
    }
    persist(drag.id, { ...drag.placement, x: clamp(drag.placement.x + deltaX / bounds.width, 0, 1 - drag.placement.width), y: clamp(drag.placement.y + deltaY / bounds.height, 0, 1 - drag.placement.height) });
  }
  function finish(event: PointerEvent<HTMLDivElement>) { if (drag?.pointerId === event.pointerId) { setDrag(null); onMessage(drag.mode === 'CROP' ? 'Image crop saved for packet position 02.' : 'Evidence layout saved for packet position 02.'); } }
  function resetAll() { onChanged(resetSupportingPlacements(storageKey)); setTool('MOVE'); onMessage('Evidence returned to automatic alignment.'); }
  if (!assets.supporting.length) return null;
  const toolbar: ReactNode = <div className="evidence-header-tools"><nav className="support-image-strip" aria-label="Evidence images">{assets.supporting.map((asset, index) => <button type="button" key={asset.id} className={asset.id === selectedId ? 'selected' : ''} onClick={() => setSelectedId(asset.id)}><span>{images.get(asset.id) && <img src={images.get(asset.id)} alt="" />}</span><strong>{String(index + 1).padStart(2, '0')}</strong><small>{asset.name}</small></button>)}</nav><span className="evidence-toolbar-separator controls-divider" aria-hidden="true" /><button type="button" className="evidence-auto-align" onClick={resetAll}>Auto-align all</button></div>;
  return <section className="support-layout-editor professional-evidence-editor">
    {toolbarTarget ? createPortal(toolbar, toolbarTarget) : <header className="support-layout-header evidence-command-bar"><div className="evidence-heading"><p className="eyebrow">Evidence editor</p><h3>Supporting Documents page</h3><span>Build one clean page for packet position 02.</span></div><span className="evidence-toolbar-separator" aria-hidden="true" />{toolbar}</header>}
    <div className="support-layout-grid"><div className="support-page-frame"><div className="support-canvas-caption"><strong>Page preview</strong><span>{tool === 'CROP' ? 'Drag image to crop' : 'Drag frame to position'}</span></div><div ref={page} className={`support-page-canvas tool-${tool.toLowerCase()}`} style={{ aspectRatio: String(PAGE_RATIO) }}>{assets.supporting.map((asset, index) => { const box = placement(asset, index, assets.supporting.length); const url = images.get(asset.id); return <div key={asset.id} className={`support-canvas-item ${asset.id === selectedId ? 'selected' : ''} ${asset.id === selectedId && tool === 'CROP' ? 'cropping' : ''}`} style={{ left: pct(box.x), top: pct(box.y), width: pct(box.width), height: pct(box.height) }} onPointerDown={(event) => start(event, asset, index)} onPointerMove={move} onPointerUp={finish} onPointerCancel={finish}>{url && <img draggable={false} src={url} alt={asset.name} style={{ width: `${100 / box.cropWidth}%`, height: `${100 / box.cropHeight}%`, left: `${-(box.cropX / box.cropWidth) * 100}%`, top: `${-(box.cropY / box.cropHeight) * 100}%` }} />}<span>{index + 1}</span></div>; })}</div></div>{selected && current && <aside className="support-layout-controls"><header><div><p className="eyebrow">Selected</p><strong>{selected.name}</strong></div><span>{pct(current.width)}</span></header><div className="support-mode-switch" aria-label="Editing tool"><button type="button" className={tool === 'MOVE' ? 'active' : ''} onClick={() => setTool('MOVE')}>Move frame</button><button type="button" className={tool === 'CROP' ? 'active' : ''} onClick={useCropTool}>Crop image</button></div><div className="support-quick-tools"><button type="button" onClick={() => persist(selected.id, auto(selectedIndex, assets.supporting.length))}>Fit</button><button type="button" onClick={() => edit({ x: (1 - current.width) / 2, y: (1 - current.height) / 2 })}>Center</button><button type="button" onClick={() => edit({ x: .06, width: .88 })}>Full width</button><button type="button" onClick={() => edit({ cropX: 0, cropY: 0, cropWidth: 1, cropHeight: 1 })}>Reset crop</button></div><section className="support-control-group"><h4>Zoom & position</h4><div className="support-zoom-tools"><button type="button" onClick={() => zoom(.08)}>−</button><span>Crop zoom</span><button type="button" onClick={() => zoom(-.08)}>+</button></div><div className="support-nudge"><button type="button" onClick={() => edit({ y: current.y - .01 })}>↑</button><button type="button" onClick={() => edit({ x: current.x - .01 })}>←</button><button type="button" onClick={() => edit({ x: current.x + .01 })}>→</button><button type="button" onClick={() => edit({ y: current.y + .01 })}>↓</button></div></section><section className="support-control-group sliders"><h4>Size</h4><label><span>Width</span><input type="range" min="8" max="100" value={Math.round(current.width * 100)} onChange={(event) => edit({ width: Number(event.target.value) / 100 })} /><output>{pct(current.width)}</output></label><label><span>Height</span><input type="range" min="8" max="100" value={Math.round(current.height * 100)} onChange={(event) => edit({ height: Number(event.target.value) / 100 })} /><output>{pct(current.height)}</output></label></section><details className="support-precision-controls"><summary>Precision crop</summary><div className="support-control-group sliders"><label><span>Left</span><input type="range" min="0" max={Math.round((1 - current.cropWidth) * 100)} value={Math.round(current.cropX * 100)} onChange={(event) => edit({ cropX: Number(event.target.value) / 100 })} /><output>{pct(current.cropX)}</output></label><label><span>Top</span><input type="range" min="0" max={Math.round((1 - current.cropHeight) * 100)} value={Math.round(current.cropY * 100)} onChange={(event) => edit({ cropY: Number(event.target.value) / 100 })} /><output>{pct(current.cropY)}</output></label></div></details></aside>}</div>
  </section>;
}
