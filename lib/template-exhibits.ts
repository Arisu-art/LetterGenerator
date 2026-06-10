import { inspectTemplateContract, type TemplateContract } from './template-contracts';

export type ExhibitKind = 'FCRA' | 'AFFIDAVIT' | 'ATTACHMENT' | 'FTC';
export type ActiveExhibitKind = ExhibitKind;
export type ExhibitMode = 'STATIC_PDF' | 'GENERATED_DOCX';

export type ExhibitAsset = {
  id: string;
  kind: ExhibitKind;
  mode: ExhibitMode;
  name: string;
  type: string;
  size: number;
  contract?: TemplateContract;
};

export type TemplateExhibits = Record<ExhibitKind, ExhibitAsset | null>;

const DB_NAME = 'lettergenerator-private-templates';
const STORE_NAME = 'files';
const META_PREFIX = 'lettergenerator.template-exhibits.v2.';
const LEGACY_PREFIX = 'lettergenerator.template-exhibits.v1.';

export const exhibitKinds: ExhibitKind[] = ['FCRA', 'AFFIDAVIT', 'ATTACHMENT', 'FTC'];

export const exhibitModes: Record<ExhibitKind, ExhibitMode> = {
  FCRA: 'STATIC_PDF',
  AFFIDAVIT: 'GENERATED_DOCX',
  ATTACHMENT: 'STATIC_PDF',
  FTC: 'GENERATED_DOCX'
};

export const exhibitTitles: Record<ExhibitKind, string> = {
  FCRA: 'FCRA Legal Exhibit',
  AFFIDAVIT: 'Affidavit',
  ATTACHMENT: 'Attachment',
  FTC: 'FTC Identity Theft Report'
};

export const exhibitAccept: Record<ExhibitKind, string> = {
  FCRA: '.pdf,application/pdf',
  AFFIDAVIT: '.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ATTACHMENT: '.pdf,application/pdf',
  FTC: '.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document'
};

function emptyTemplates(): TemplateExhibits {
  return { FCRA: null, AFFIDAVIT: null, ATTACHMENT: null, FTC: null };
}

function fileKey(round: string, kind: ExhibitKind) {
  return `template-exhibit/${round}/${kind}`;
}

function metaKey(round: string) {
  return `${META_PREFIX}${round}`;
}

function legacyMetaKey(round: string) {
  return `${LEGACY_PREFIX}${round}`;
}

function normalizeAsset(kind: ExhibitKind, asset: ExhibitAsset | null | undefined): ExhibitAsset | null {
  if (!asset) return null;
  return { ...asset, kind, mode: exhibitModes[kind] };
}

function saveTemplateMeta(round: string, exhibits: TemplateExhibits) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(metaKey(round), JSON.stringify(exhibits));
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);

    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME);
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export function loadTemplateExhibits(round: string): TemplateExhibits {
  if (typeof window === 'undefined') return emptyTemplates();

  try {
    const raw = localStorage.getItem(metaKey(round)) || localStorage.getItem(legacyMetaKey(round));
    if (!raw) return emptyTemplates();

    const data = JSON.parse(raw) as Partial<TemplateExhibits>;

    return {
      FCRA: normalizeAsset('FCRA', data.FCRA),
      AFFIDAVIT: normalizeAsset('AFFIDAVIT', data.AFFIDAVIT),
      ATTACHMENT: normalizeAsset('ATTACHMENT', data.ATTACHMENT),
      FTC: normalizeAsset('FTC', data.FTC)
    };
  } catch {
    return emptyTemplates();
  }
}

function assertFileType(kind: ExhibitKind, file: File) {
  const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
  const isDocx =
    file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    /\.docx$/i.test(file.name);

  if (exhibitModes[kind] === 'STATIC_PDF' && !isPdf) {
    throw new Error(`${exhibitTitles[kind]} accepts PDF files only.`);
  }

  if (exhibitModes[kind] === 'GENERATED_DOCX' && !isDocx) {
    throw new Error(`${exhibitTitles[kind]} accepts DOCX template files only.`);
  }
}

async function readStoredExhibit(round: string, kind: ExhibitKind): Promise<File | null> {
  const db = await openDb();

  const file = await new Promise<File | null>((resolve, reject) => {
    const request = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(fileKey(round, kind));
    request.onsuccess = () => resolve((request.result as File | undefined) || null);
    request.onerror = () => reject(request.error);
  });

  db.close();
  return file;
}

async function assetFromStoredFile(round: string, kind: ExhibitKind, file: File, existing?: ExhibitAsset | null): Promise<ExhibitAsset> {
  const contract = existing?.contract || (exhibitModes[kind] === 'GENERATED_DOCX'
    ? await inspectTemplateContract(file, kind as any).catch(() => existing?.contract)
    : existing?.contract);

  return {
    id: fileKey(round, kind),
    kind,
    mode: exhibitModes[kind],
    name: existing?.name || file.name,
    type: existing?.type || file.type || 'application/octet-stream',
    size: existing?.size || file.size,
    contract
  };
}

export async function recoverTemplateExhibitsFromFiles(round: string, values: TemplateExhibits = loadTemplateExhibits(round)) {
  if (typeof window === 'undefined') return emptyTemplates();

  const recovered = { ...emptyTemplates(), ...values } as TemplateExhibits;
  let changed = false;

  for (const kind of exhibitKinds) {
    const file = await readStoredExhibit(round, kind).catch(() => null);

    if (!file) {
      if (recovered[kind]) {
        recovered[kind] = null;
        changed = true;
      }
      continue;
    }

    if (!recovered[kind] || recovered[kind]?.name !== file.name || recovered[kind]?.size !== file.size) {
      recovered[kind] = await assetFromStoredFile(round, kind, file, recovered[kind]);
      changed = true;
    }
  }

  if (changed) saveTemplateMeta(round, recovered);
  return recovered;
}

export async function recoverAllTemplateExhibitsFromFiles(rounds: string[]) {
  const entries = await Promise.all(rounds.map(async (round) => [round, await recoverTemplateExhibitsFromFiles(round)] as const));
  return Object.fromEntries(entries) as Record<string, TemplateExhibits>;
}

export async function saveTemplateExhibit(round: string, kind: ExhibitKind, file: File) {
  assertFileType(kind, file);

  const contract = await inspectTemplateContract(file, kind as any);
  const id = fileKey(round, kind);
  const db = await openDb();

  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(file, id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });

  db.close();

  const next = loadTemplateExhibits(round);
  next[kind] = {
    id,
    kind,
    mode: exhibitModes[kind],
    name: file.name,
    type: file.type || 'application/octet-stream',
    size: file.size,
    contract
  };

  saveTemplateMeta(round, next);
  return next;
}

export async function removeTemplateExhibit(round: string, kind: ExhibitKind) {
  const db = await openDb();

  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(fileKey(round, kind));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });

  db.close();

  const next = loadTemplateExhibits(round);
  next[kind] = null;
  saveTemplateMeta(round, next);

  return next;
}

export async function readTemplateExhibit(round: string, kind: ExhibitKind): Promise<File | null> {
  return readStoredExhibit(round, kind);
}

export function configuredExhibits(exhibits: TemplateExhibits) {
  return exhibitKinds.filter((kind) => Boolean(exhibits[kind]));
}

export function generatedExhibits(exhibits: TemplateExhibits) {
  return exhibitKinds.filter((kind) => exhibitModes[kind] === 'GENERATED_DOCX' && Boolean(exhibits[kind]));
}

export function staticPdfExhibits(exhibits: TemplateExhibits) {
  return exhibitKinds.filter((kind) => exhibitModes[kind] === 'STATIC_PDF' && Boolean(exhibits[kind]));
}
