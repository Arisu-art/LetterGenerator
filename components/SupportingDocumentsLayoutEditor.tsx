'use client';

import { useEffect, useMemo, useRef, useState, type PointerEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { loadPacketFile, saveSupportingPlacement, resetSupportingPlacements, type PacketAsset, type PacketAssets, type SupportingPlacement, type SupportingRotation } from '../lib/packet-assets';

type Props = { storageKey: string; assets: PacketAssets; toolbarTargetId?: string; onChanged: (assets: PacketAssets) => void; onMessage: (message: string) => void };
type Preview = { id: string; url: string };
type ToolMode = 'POSITION' | 'CROP';
type CropHandle = 'top-left' | 'top' | 'top-right' | 'right' | 'bottom-right' | 'bottom' | 'bottom-left' | 'left';
type Drag = { id: string; pointerId: number; x: number; y: number; placement: SupportingPlacement; mode: 'MOVE' | 'PAN' | 'HANDLE'; handle?: CropHandle } | null;
const PAGE_RATIO = 8.5 / 11;
const MIN = 0.08;
const MIN_CROP = 0.1;
function clamp(value: number, low: number, high: number) { return Math.max(low, Math.min(high, value)); }
function auto(index: number, count: number): SupportingPlacement { const n = Math.max(1, count); const gap = .018; const x = .08; const y = .045; const height = (1 - y * 2 - gap * (n - 1)) / n; return { x, y: y + index * (height + gap), width: 1 - x * 2, height, cropX: 0, cropY: 0, cropWidth: 1, cropHeight: 1, rotation: 0 }; }
function placement(asset: PacketAsset, index: number, count: number) { return { rotation: 0 as SupportingRotation, ...(asset.placement || auto(index, count)) }; }
function pct(value: number) { return `${Math.round(value * 10000) / 100}%`; }
function safeRotation(value: number): SupportingRotation { return (((value % 360) + 360) % 360) as SupportingRotation; }
function sanitize(next: SupportingPlacement): SupportingPlacement {
  const width = clamp(next.width, MIN, 1);
  const height = clamp(next.height, MIN, 1);
  const cropWidth = clamp(next.cropWidth, MIN_CROP, 1);
  const cropHeight = clamp(next.cropHeight, MIN_CROP, 1);
  return {
    ...next,
    width,
    height,
    x: clamp(next.x, 0, 1 - width),
    y: clamp(next.y, 0, 1 - height),
    cropWidth,
    cropHeight,
    cropX: clamp(next.cropX, 0, 1 - cropWidth),
    cropY: clamp(next.cropY, 0, 1 - cropHeight),
    rotation: next.rotation || 0
  };
}
function adjustLeft(base: SupportingPlacement, requested: number) {
  const ratio = base.cropWidth / base.width;
  const delta = clamp(requested, Math.max(-base.x, -base.cropX / ratio), Math.min(base.width - MIN, (base.cropWidth - MIN_CROP) / ratio));
  return { ...base, x: base.x + delta, width: base.width - delta, cropX: base.cropX + delta * ratio, cropWidth: base.cropWidth - delta * ratio };
}
function adjustRight(base: SupportingPlacement, requested: number) {
  const ratio = base.cropWidth / base.width;
  const delta = clamp(requested, Math.max(-(base.width - MIN), -(base.cropWidth - MIN_CROP) / ratio), Math.min(1 - base.x - base.width, (1 - base.cropX - base.cropWidth) / ratio));
  return { ...base, width: base.width + delta, cropWidth: base.cropWidth + delta * ratio };
}
function adjustTop(base: SupportingPlacement, requested: number) {
  const ratio = base.cropHeight / base.height;
  const delta = clamp(requested, Math.max(-base.y, -base.cropY / ratio), Math.min(base.height - MIN, (base.cropHeight - MIN_CROP) / ratio));
  return { ...base, y: base.y + delta, height: base.height - delta, cropY: base.cropY + delta * ratio, cropHeight: base.cropHeight - delta * ratio };
}
function adjustBottom(base: SupportingPlacement, requested: number) {
  const ratio = base.cropHeight / base.height;
  const delta = clamp(requested, Math.max(-(base.height - MIN), -(base.cropHeight - MIN_CROP) / ratio), Math.min(1 - base.y - base.height, (1 - base.cropY - base.cropHeight) / ratio));
  return { ...base, height: base.height + delta, cropHeight: base.cropHeight + delta * ratio };
}
function cropWithHandle(base: SupportingPlacement, handle: CropHandle, dx: number, dy: number) {
  let next = { ...base };
  if (handle.includes('left')) next = adjustLeft(next, dx);
  if (handle.includes('right')) next = adjustRight(next, dx);
  if (handle.includes('top')) next = adjustTop(next, dy);
  if (handle.includes('bottom')) next = adjustBottom(next, dy);
  return sanitize(next);
}
function PreviewCanvas({ url, box, label }: { url?: string; box: SupportingPlacement; label: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!url || !canvas.current) return;
    let cancelled = false;
    const image = new Image();
    image.onload = () => {
      if (cancelled || !canvas.current) return;
      const rotated = document.createElement('canvas');
      const swap = box.rotation === 90 || box.rotation === 270;
      rotated.width = swap ? image.naturalHeight : image.naturalWidth;
      rotated.height = swap ? image.naturalWidth : image.naturalHeight;
      const sourceContext = rotated.getContext('2d');
      const output = canvas.current;
      const outputWidth = Math.max(1, Math.round(box.width * 1500));
      const outputHeight = Math.max(1, Math.round(box.height * 2100));
      output.width = outputWidth;
      output.height = outputHeight;
      const context = output.getContext('2d');
      if (!sourceContext || !context) return;
      sourceContext.translate(rotated.width / 2, rotated.height / 2);
      sourceContext.rotate(((box.rotation || 0) * Math.PI) / 180);
      sourceContext.drawImage(image, -image.naturalWidth / 2, -image.naturalHeight / 2);
      const sx = box.cropX * rotated.width;
      const sy = box.cropY * rotated.height;
      const sw = Math.max(1, box.cropWidth * rotated.width);
      const sh = Math.max(1, box.cropHeight * rotated.height);
      context.clearRect(0, 0, outputWidth, outputHeight);
      context.drawImage(rotated, sx, sy, sw, sh, 0, 0, outputWidth, outputHeight);
    };
    image.src = url;
    return () => { cancelled = true; };
  }, [url, box.x, box.y, box.width, box.height, box.cropX, box.cropY, box.cropWidth, box.cropHeight, box.rotation]);
  return url ? <canvas ref={canvas} className="support-cropped-preview" role="img" aria-label={label} /> : null;
}

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
  function persist(id: string, next: SupportingPlacement, publish = true) { const updated = saveSupportingPlacement(storageKey, id, sanitize(next)); latestAssets.current = updated; setWorkingAssets(updated); if (publish) onChanged(updated); }
  function edit(values: Partial<SupportingPlacement>, publish = true) { if (!selected || !current) return; persist(selected.id, { ...current, ...values }, publish); }
  function choose(id: string) { if (id !== selectedId) setTool('POSITION'); setSelectedId(id); }
  function beginCrop() { setTool('CROP'); }
  function doneCrop() { setTool('POSITION'); onMessage('Image crop saved for packet position 02.'); }
  function resetCrop() { edit({ cropX: 0, cropY: 0, cropWidth: 1, cropHeight: 1 }); setTool('POSITION'); onMessage('Selected image crop reset.'); }
  function rotate(direction: -90 | 90) {
    if (!current) return;
    const clockwise = direction === 90;
    const rotatedCrop = clockwise
      ? { cropX: 1 - current.cropY - current.cropHeight, cropY: current.cropX, cropWidth: current.cropHeight, cropHeight: current.cropWidth }
      : { cropX: current.cropY, cropY: 1 - current.cropX - current.cropWidth, cropWidth: current.cropHeight, cropHeight: current.cropWidth };
    edit({ ...rotatedCrop, rotation: safeRotation((current.rotation || 0) + direction) });
    onMessage(`Image rotated ${clockwise ? 'right' : 'left'} 90°.`);
  }
  function startImage(event: PointerEvent<HTMLDivElement>, asset: PacketAsset, index: number) {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const isSelected = asset.id === selectedId;
    const mode = isSelected && tool === 'CROP' ? 'PAN' : 'MOVE';
    choose(asset.id);
    setDrag({ id: asset.id, pointerId: event.pointerId, x: event.clientX, y: event.clientY, placement: placement(asset, index, workingAssets.supporting.length), mode });
  }
  function startHandle(event: PointerEvent<HTMLElement>, handle: CropHandle) {
    if (!selected || !current) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    setDrag({ id: selected.id, pointerId: event.pointerId, x: event.clientX, y: event.clientY, placement: current, mode: 'HANDLE', handle });
  }
  function move(event: PointerEvent<HTMLElement>) {
    if (!drag || drag.pointerId !== event.pointerId || !page.current) return;
    const bounds = page.current.getBoundingClientRect();
    const deltaX = (event.clientX - drag.x) / bounds.width;
    const deltaY = (event.clientY - drag.y) / bounds.height;
    if (drag.mode === 'HANDLE' && drag.handle) { persist(drag.id, cropWithHandle(drag.placement, drag.handle, deltaX, deltaY), false); return; }
    if (drag.mode === 'PAN') {
      const frameWidth = Math.max(1, bounds.width * drag.placement.width);
      const frameHeight = Math.max(1, bounds.height * drag.placement.height);
      persist(drag.id, { ...drag.placement, cropX: clamp(drag.placement.cropX - ((event.clientX - drag.x) / frameWidth) * drag.placement.cropWidth, 0, 1 - drag.placement.cropWidth), cropY: clamp(drag.placement.cropY - ((event.clientY - drag.y) / frameHeight) * drag.placement.cropHeight, 0, 1 - drag.placement.cropHeight) }, false);
      return;
    }
    persist(drag.id, { ...drag.placement, x: clamp(drag.placement.x + deltaX, 0, 1 - drag.placement.width), y: clamp(drag.placement.y + deltaY, 0, 1 - drag.placement.height) }, false);
  }
  function finish(event: PointerEvent<HTMLElement>) { if (drag?.pointerId === event.pointerId) { onChanged(latestAssets.current); setDrag(null); if (drag.mode === 'HANDLE') onMessage('Crop boundary saved.'); else if (drag.mode === 'MOVE') onMessage('Evidence position saved for packet position 02.'); } }
  function resetPage() { const updated = resetSupportingPlacements(storageKey); latestAssets.current = updated; setWorkingAssets(updated); onChanged(updated); setTool('POSITION'); onMessage('Evidence page returned to automatic alignment.'); }
  if (!workingAssets.supporting.length) return null;
  const toolbar: ReactNode = <div className="evidence-header-tools"><nav className="support-image-strip" aria-label="Evidence images">{workingAssets.supporting.map((asset, index) => <button type="button" key={asset.id} className={asset.id === selectedId ? 'selected' : ''} onClick={() => choose(asset.id)}><span>{images.get(asset.id) && <img src={images.get(asset.id)} alt="" />}</span><strong>{String(index + 1).padStart(2, '0')}</strong><small>{asset.name}</small></button>)}</nav><span className="evidence-toolbar-separator controls-divider" aria-hidden="true" /><button type="button" className="evidence-auto-align" onClick={resetPage}>Reset page</button></div>;
  return <section className="support-layout-editor professional-evidence-editor word-crop-editor">
    {toolbarTarget ? createPortal(toolbar, toolbarTarget) : toolbarTargetId ? null : <header className="support-layout-header evidence-command-bar"><div className="evidence-heading"><p className="eyebrow">Evidence editor</p><h3>Supporting Documents page</h3><span>Position, crop or rotate the selected image.</span></div><span className="evidence-toolbar-separator" aria-hidden="true" />{toolbar}</header>}
    <div className="support-layout-grid word-crop-grid"><div className="support-page-frame"><div className="support-canvas-caption"><strong>Page preview</strong><span>{tool === 'CROP' ? 'Drag handles to crop or drag image to reposition inside the crop' : 'Drag an image to position it on the page'}</span></div><div ref={page} className={`support-page-canvas tool-${tool.toLowerCase()}`} style={{ aspectRatio: String(PAGE_RATIO) }}>{workingAssets.supporting.map((asset, index) => { const box = placement(asset, index, workingAssets.supporting.length); const selectedItem = asset.id === selectedId; return <div key={asset.id} className={`support-canvas-item ${selectedItem ? 'selected' : ''} ${selectedItem && tool === 'CROP' ? 'cropping word-cropping' : ''}`} style={{ left: pct(box.x), top: pct(box.y), width: pct(box.width), height: pct(box.height) }} onPointerDown={(event) => startImage(event, asset, index)} onPointerMove={move} onPointerUp={finish} onPointerCancel={finish}><PreviewCanvas url={images.get(asset.id)} box={box} label={asset.name} />{selectedItem && tool === 'CROP' && <>{(['top-left', 'top', 'top-right', 'right', 'bottom-right', 'bottom', 'bottom-left', 'left'] as CropHandle[]).map((handle) => <i key={handle} className={`crop-handle ${handle}`} onPointerDown={(event) => startHandle(event, handle)} onPointerMove={move} onPointerUp={finish} onPointerCancel={finish} />)}</>}<span>{index + 1}</span></div>; })}</div></div>{selected && current && <aside className="support-layout-controls word-crop-controls"><header><div><p className="eyebrow">Selected image</p><strong>{selected.name}</strong></div><span>{String(selectedIndex + 1).padStart(2, '0')}</span></header><p className="word-crop-help">{tool === 'CROP' ? 'Drag black crop handles to trim. Drag the picture to reposition it inside the frame.' : 'Crop trims edges; rotate turns the selected picture.'}</p><div className="word-crop-actions">{tool === 'CROP' ? <button type="button" className="action-button" onClick={doneCrop}>Done</button> : <button type="button" className="action-button crop-command" onClick={beginCrop}>Crop</button>}<button type="button" className="secondary-button" onClick={resetCrop}>Reset crop</button></div><div className="word-rotate-actions"><button type="button" onClick={() => rotate(-90)} aria-label="Rotate image left 90 degrees">↶ Rotate left</button><button type="button" onClick={() => rotate(90)} aria-label="Rotate image right 90 degrees">Rotate right ↷</button></div><div className="word-position-actions"><button type="button" onClick={() => persist(selected.id, auto(selectedIndex, workingAssets.supporting.length))}>Fit page slot</button><button type="button" onClick={() => edit({ x: (1 - current.width) / 2 })}>Center</button></div></aside>}</div>
  </section>;
}
