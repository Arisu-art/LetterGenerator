'use client';

import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import { loadPacketFile, saveSupportingPlacement, resetSupportingPlacements, type PacketAsset, type PacketAssets, type SupportingPlacement } from '../lib/packet-assets';

type Props = {
  storageKey: string;
  assets: PacketAssets;
  onChanged: (assets: PacketAssets) => void;
  onMessage: (message: string) => void;
};

type Preview = { id: string; url: string };
type Drag = { id: string; pointerId: number; startX: number; startY: number; initial: SupportingPlacement } | null;

const PAGE_RATIO = 8.5 / 11;
const minSize = 0.08;
function clamp(value: number, low: number, high: number) { return Math.max(low, Math.min(high, value)); }
function automaticPlacement(index: number, count: number): SupportingPlacement {
  const safe = Math.max(1, count);
  const gap = 0.018;
  const marginX = 0.09;
  const marginY = 0.038;
  const height = (1 - marginY * 2 - gap * (safe - 1)) / safe;
  return { x: marginX, y: marginY + index * (height + gap), width: 1 - marginX * 2, height, cropX: 0, cropY: 0, cropWidth: 1, cropHeight: 1 };
}
function layoutOf(asset: PacketAsset, index: number, count: number) { return asset.placement || automaticPlacement(index, count); }
function percent(value: number) { return `${Math.round(value * 100)}%`; }

export default function SupportingDocumentsLayoutEditor({ storageKey, assets, onChanged, onMessage }: Props) {
  const [previews, setPreviews] = useState<Preview[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(assets.supporting[0]?.id || null);
  const [drag, setDrag] = useState<Drag>(null);
  const page = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    const urls: string[] = [];
    void Promise.all(assets.supporting.map(async (asset) => {
      const file = await loadPacketFile(storageKey, asset.id);
      if (!file) return null;
      const url = URL.createObjectURL(file);
      urls.push(url);
      return { id: asset.id, url };
    })).then((value) => { if (active) setPreviews(value.filter(Boolean) as Preview[]); });
    return () => { active = false; urls.forEach((url) => URL.revokeObjectURL(url)); };
  }, [storageKey, assets.supporting]);
  useEffect(() => {
    if (!assets.supporting.some((asset) => asset.id === selectedId)) setSelectedId(assets.supporting[0]?.id || null);
  }, [assets.supporting, selectedId]);

  const selectedIndex = assets.supporting.findIndex((asset) => asset.id === selectedId);
  const selected = selectedIndex >= 0 ? assets.supporting[selectedIndex] : null;
  const selectedLayout = selected ? layoutOf(selected, selectedIndex, assets.supporting.length) : null;
  const previewMap = useMemo(() => new Map(previews.map((item) => [item.id, item.url])), [previews]);

  function save(id: string, placement: SupportingPlacement) {
    const next = saveSupportingPlacement(storageKey, id, placement);
    onChanged(next);
  }
  function patch(values: Partial<SupportingPlacement>) {
    if (!selected || !selectedLayout) return;
    const next = { ...selectedLayout, ...values };
    next.width = clamp(next.width, minSize, 1 - next.x);
    next.height = clamp(next.height, minSize, 1 - next.y);
    next.x = clamp(next.x, 0, 1 - next.width);
    next.y = clamp(next.y, 0, 1 - next.height);
    next.cropWidth = clamp(next.cropWidth, 0.1, 1 - next.cropX);
    next.cropHeight = clamp(next.cropHeight, 0.1, 1 - next.cropY);
    next.cropX = clamp(next.cropX, 0, 1 - next.cropWidth);
    next.cropY = clamp(next.cropY, 0, 1 - next.cropHeight);
    save(selected.id, next);
  }
  function pointerDown(event: PointerEvent<HTMLDivElement>, asset: PacketAsset, index: number) {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    setSelectedId(asset.id);
    setDrag({ id: asset.id, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, initial: layoutOf(asset, index, assets.supporting.length) });
  }
  function pointerMove(event: PointerEvent<HTMLDivElement>) {
    if (!drag || event.pointerId !== drag.pointerId || !page.current) return;
    const bounds = page.current.getBoundingClientRect();
    const next = { ...drag.initial, x: clamp(drag.initial.x + (event.clientX - drag.startX) / bounds.width, 0, 1 - drag.initial.width), y: clamp(drag.initial.y + (event.clientY - drag.startY) / bounds.height, 0, 1 - drag.initial.height) };
    save(drag.id, next);
  }
  function pointerUp(event: PointerEvent<HTMLDivElement>) {
    if (drag && drag.pointerId === event.pointerId) { setDrag(null); onMessage('Supporting document layout saved for final packet position 02.'); }
  }
  function reset() {
    const next = resetSupportingPlacements(storageKey);
    onChanged(next);
    onMessage('Supporting documents returned to clean automatic one-page alignment.');
  }

  if (!assets.supporting.length) return null;
  return <section className="support-layout-editor" aria-label="Supporting document page editor">
    <header className="support-layout-header"><div><p className="eyebrow">One-page composition</p><h3>Crop and arrange supporting documents</h3><span>Drag images on the page. Select an image to crop, resize, or restore clean alignment.</span></div><button type="button" onClick={reset}>Auto-align all</button></header>
    <div className="support-layout-grid">
      <div className="support-page-frame"><div ref={page} className="support-page-canvas" style={{ aspectRatio: String(PAGE_RATIO) }}>
        {assets.supporting.map((asset, index) => {
          const placement = layoutOf(asset, index, assets.supporting.length);
          const url = previewMap.get(asset.id);
          return <div key={asset.id} className={`support-canvas-item ${selectedId === asset.id ? 'selected' : ''}`} style={{ left: percent(placement.x), top: percent(placement.y), width: percent(placement.width), height: percent(placement.height) }} onPointerDown={(event) => pointerDown(event, asset, index)} onPointerMove={pointerMove} onPointerUp={pointerUp}>
            {url && <img draggable={false} src={url} alt={asset.name} style={{ width: `${100 / placement.cropWidth}%`, height: `${100 / placement.cropHeight}%`, left: `${-(placement.cropX / placement.cropWidth) * 100}%`, top: `${-(placement.cropY / placement.cropHeight) * 100}%` }} />}
            <span>{index + 1}</span>
          </div>;
        })}
      </div></div>
      {selected && selectedLayout && <aside className="support-layout-controls"><strong>{selected.name}</strong><label>Width <input type="range" min="8" max="100" value={Math.round(selectedLayout.width * 100)} onChange={(event) => patch({ width: Number(event.target.value) / 100 })} /></label><label>Height <input type="range" min="8" max="100" value={Math.round(selectedLayout.height * 100)} onChange={(event) => patch({ height: Number(event.target.value) / 100 })} /></label><label>Crop left <input type="range" min="0" max={Math.round((1 - selectedLayout.cropWidth) * 100)} value={Math.round(selectedLayout.cropX * 100)} onChange={(event) => patch({ cropX: Number(event.target.value) / 100 })} /></label><label>Crop top <input type="range" min="0" max={Math.round((1 - selectedLayout.cropHeight) * 100)} value={Math.round(selectedLayout.cropY * 100)} onChange={(event) => patch({ cropY: Number(event.target.value) / 100 })} /></label><label>Crop width <input type="range" min="10" max={Math.round((1 - selectedLayout.cropX) * 100)} value={Math.round(selectedLayout.cropWidth * 100)} onChange={(event) => patch({ cropWidth: Number(event.target.value) / 100 })} /></label><label>Crop height <input type="range" min="10" max={Math.round((1 - selectedLayout.cropY) * 100)} value={Math.round(selectedLayout.cropHeight * 100)} onChange={(event) => patch({ cropHeight: Number(event.target.value) / 100 })} /></label><button type="button" onClick={() => save(selected.id, automaticPlacement(selectedIndex, assets.supporting.length))}>Reset selected</button></aside>}
    </div>
  </section>;
}
