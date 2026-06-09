export type SupportingRotation = 0 | 90 | 180 | 270;

export type SupportingFit = 'contain' | 'cover' | 'stretch';

export type SupportingPlacement = {
  x: number;
  y: number;
  width: number;
  height: number;
  cropX: number;
  cropY: number;
  cropWidth: number;
  cropHeight: number;
  rotation?: SupportingRotation;
  fit?: SupportingFit;
};

export type PacketAsset = { id: string; name: string; type: string; size: number; pages?: number; placement?: SupportingPlacement };
export type PacketAssets = { supporting: PacketAsset[]; legalPdf: PacketAsset | null };

const DB_NAME = 'lettergenerator-private-templates';
const STORE_NAME = 'files';
const META = 'lettergenerator.packet-assets.v1.';
const blank = (): PacketAssets => ({ supporting: [], legalPdf: null });
const assetKey = (round: string, id: string) => `packet/${round}/${id}`;

export function standardSupportingPlacement(index: number, count: number): SupportingPlacement {
  const n = Math.max(1, Math.min(count || 1, 12));
  const safeIndex = Math.max(0, Math.min(index, n - 1));

  /*
    Count-specific evidence slot policy:
    - 1 image: compact centered frame, not a large square container
    - 2 images: readable stacked frames, but no oversized vertical boxes
    - 3 images: keep existing good layout unchanged
    - 4+ images: proportional fallback
  */
  let width: number;
  let height: number;
  let startY: number;

  if (n === 1) {
    width = 0.66;
    height = 0.34;
    startY = 0.33;
  } else if (n === 2) {
    width = 0.68;
    height = 0.315;
    startY = 0.185;
  } else if (n === 3) {
    width = 0.72;
    height = 0.305;
    startY = 0.045;
  } else {
    width = 0.72;
    height = 0.90 / n;
    startY = 0.05;
  }

  const x = (1 - width) / 2;

  return {
    x,
    y: startY + safeIndex * height,
    width,
    height,
    cropX: 0,
    cropY: 0,
    cropWidth: 1,
    cropHeight: 1,
    rotation: 0,
    fit: 'contain'
  };
}

export function normalizeSupportingLayout(value: PacketAssets): PacketAssets {
  return {
    ...value,
    supporting: value.supporting.map((asset, index) => {
      const slot = standardSupportingPlacement(index, value.supporting.length);
      const existing = asset.placement;

      return {
        ...asset,
        placement: {
          ...slot,
          cropX: existing?.cropX ?? 0,
          cropY: existing?.cropY ?? 0,
          cropWidth: existing?.cropWidth ?? 1,
          cropHeight: existing?.cropHeight ?? 1,
          rotation: existing?.rotation ?? 0,
          fit: existing?.fit ?? 'contain'
        }
      };
    })
  };
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
async function storeFile(round: string, id: string, file: File) {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(file, assetKey(round, id));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}
async function deleteFile(round: string, id: string) {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(assetKey(round, id));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}
export async function loadPacketFile(round: string, id: string): Promise<File | null> {
  const db = await openDb();
  const file = await new Promise<File | null>((resolve, reject) => {
    const request = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(assetKey(round, id));
    request.onsuccess = () => resolve((request.result as File) || null);
    request.onerror = () => reject(request.error);
  });
  db.close();
  return file;
}
export function loadPacketAssets(round: string): PacketAssets {
  if (typeof window === 'undefined') return blank();
  try {
    const raw = localStorage.getItem(`${META}${round}`);
    const value = raw ? JSON.parse(raw) as PacketAssets : blank();
    return { supporting: Array.isArray(value.supporting) ? value.supporting : [], legalPdf: value.legalPdf || null };
  } catch { return blank(); }
}
export function savePacketAssets(round: string, value: PacketAssets) { localStorage.setItem(`${META}${round}`, JSON.stringify(value)); }
export async function addSupportingAssets(round: string, files: File[]) {
  const value = loadPacketAssets(round);
  const added: PacketAsset[] = [];
  for (const file of files.filter((item) => /^image\/(png|jpeg|webp)$/i.test(item.type) || /\.(png|jpe?g|webp)$/i.test(item.name))) {
    const id = `support-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    await storeFile(round, id, file);
    added.push({ id, name: file.name, type: file.type || 'image', size: file.size, pages: 1 });
  }
  const next = { ...value, supporting: [...value.supporting, ...added] };
  savePacketAssets(round, next);
  return next;
}
export async function removeSupportingAsset(round: string, id: string) {
  await deleteFile(round, id);
  const value = loadPacketAssets(round);
  const next = { ...value, supporting: value.supporting.filter((asset) => asset.id !== id) };
  savePacketAssets(round, next);
  return next;
}
export function moveSupportingAsset(round: string, id: string, offset: -1 | 1) {
  const value = loadPacketAssets(round);
  const index = value.supporting.findIndex((asset) => asset.id === id);
  const destination = index + offset;
  if (index < 0 || destination < 0 || destination >= value.supporting.length) return value;
  const supporting = [...value.supporting];
  [supporting[index], supporting[destination]] = [supporting[destination], supporting[index]];
  const next = { ...value, supporting };
  savePacketAssets(round, next);
  return next;
}
export function saveSupportingPlacement(round: string, id: string, placement: SupportingPlacement) {
  const value = loadPacketAssets(round);
  const next = { ...value, supporting: value.supporting.map((asset) => asset.id === id ? { ...asset, placement } : asset) };
  savePacketAssets(round, next);
  return next;
}
export function resetSupportingPlacements(round: string) {
  const value = loadPacketAssets(round);
  const next = { ...value, supporting: value.supporting.map(({ placement, ...asset }) => asset) };
  savePacketAssets(round, next);
  return next;
}
export async function saveLegalPdf(round: string, file: File) {
  if (file.type !== 'application/pdf' && !/\.pdf$/i.test(file.name)) throw new Error('FCRA Legal Exhibit accepts PDF files only.');
  const id = 'legal-pdf';
  await storeFile(round, id, file);
  const value = loadPacketAssets(round);
  const next = { ...value, legalPdf: { id, name: file.name, type: file.type || 'application/pdf', size: file.size } };
  savePacketAssets(round, next);
  return next;
}
export async function removeLegalPdf(round: string) {
  await deleteFile(round, 'legal-pdf');
  const value = loadPacketAssets(round);
  const next = { ...value, legalPdf: null };
  savePacketAssets(round, next);
  return next;
}
