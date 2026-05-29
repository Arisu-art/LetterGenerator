import { createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export type OnlyOfficeSession = {
  id: string;
  key: string;
  title: string;
  accessKey: string;
  createdAt: number;
  lastSavedAt?: number;
};

const root = process.env.LETTERGENERATOR_EDITOR_STORAGE || join(tmpdir(), 'lettergenerator-docx-editing');

function safeId(value: string) {
  if (!/^[0-9a-f-]{36}$/i.test(value)) throw new Error('Invalid editing session.');
  return value;
}
function metadataFile(id: string) { return join(root, `${safeId(id)}.json`); }
function docxFile(id: string) { return join(root, `${safeId(id)}.docx`); }

export async function createOnlyOfficeSession(bytes: Buffer, filename: string) {
  await mkdir(root, { recursive: true });
  const id = randomUUID();
  const title = filename.replace(/[\\/:*?"<>|]/g, '').trim().slice(0, 160) || 'Generated Letter.docx';
  const session: OnlyOfficeSession = {
    id,
    key: `${id.replaceAll('-', '')}-${Date.now()}`,
    title,
    accessKey: randomBytes(24).toString('hex'),
    createdAt: Date.now()
  };
  await Promise.all([
    writeFile(docxFile(id), bytes),
    writeFile(metadataFile(id), JSON.stringify(session), 'utf8')
  ]);
  return session;
}

export async function getOnlyOfficeSession(id: string) {
  return JSON.parse(await readFile(metadataFile(id), 'utf8')) as OnlyOfficeSession;
}

export async function authenticateOnlyOfficeSession(id: string, accessKey: string | null) {
  const session = await getOnlyOfficeSession(id);
  const provided = Buffer.from(accessKey || '');
  const expected = Buffer.from(session.accessKey);
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) throw new Error('Unauthorized editing session.');
  return session;
}

export async function readOnlyOfficeDocument(id: string) {
  return readFile(docxFile(id));
}

export async function saveOnlyOfficeDocument(id: string, bytes: Buffer) {
  const session = await getOnlyOfficeSession(id);
  const updated: OnlyOfficeSession = { ...session, lastSavedAt: Date.now() };
  await Promise.all([
    writeFile(docxFile(id), bytes),
    writeFile(metadataFile(id), JSON.stringify(updated), 'utf8')
  ]);
  return updated;
}

function encode(value: object) {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

export function signOnlyOfficeConfig(config: object, secret: string) {
  const header = encode({ alg: 'HS256', typ: 'JWT' });
  const payload = encode(config);
  const signature = createHmac('sha256', secret).update(`${header}.${payload}`).digest('base64url');
  return `${header}.${payload}.${signature}`;
}
