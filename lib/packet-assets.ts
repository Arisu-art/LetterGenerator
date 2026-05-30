export type PacketAsset = { id: string; name: string; type: string; size: number; pages?: number };
export type PacketAssets = { supporting: PacketAsset[]; legalPdf: PacketAsset | null };

const DB_NAME = 'lettergenerator-private-templates';
const STORE_NAME = 'files';
const META = 'lettergenerator.packet-assets.v1.';
const blank = (): PacketAssets => ({ supporting: [], legalPdf: null });
const assetKey = (round: string, id: string) => `packet/${round}/${id}`;

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
function savePacketAssets(round: string, value: PacketAssets) {
  localStorage.setItem(`${META}${round}`, JSON.stringify(value));
}
export async function addSupportingAssets(round: string, files: File[]) {
  const value = loadPacketAssets(round);
  const added: PacketAsset[] = [];
  for (const file of files.filter((item) => /^image\/(png|jpeg|webp)$/i.test(item.type) || /\.(png|jpe?g|webp)$/i.test(item.name))) {
    const id = `support-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    await storeFile(round, id, file);
    added.push({ id, name: file.name, type: file.type, size: file.size, pages: 1 });
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
export async function saveLegalPdf(round: string, file: File, pages: number) {
  const id = 'legal-pdf';
  await storeFile(round, id, file);
  const value = loadPacketAssets(round);
  const next = { ...value, legalPdf: { id, name: file.name, type: file.type, size: file.size, pages } };
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
