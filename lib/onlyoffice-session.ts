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
function signature(value: string, secret: string) { return createHmac('sha256', secret).update(value).digest('base64url'); }
function fixedMatch(left: string, right: string) {
  const first = Buffer.from(left);
  const second = Buffer.from(right);
  return first.length === second.length && timingSafeEqual(first, second);
}

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
  if (!fixedMatch(accessKey || '', session.accessKey)) throw new Error('Unauthorized editing session.');
  return session;
}

export async function readOnlyOfficeDocument(id: string) { return readFile(docxFile(id)); }

export async function saveOnlyOfficeDocument(id: string, bytes: Buffer) {
  const session = await getOnlyOfficeSession(id);
  const updated: OnlyOfficeSession = { ...session, lastSavedAt: Date.now() };
  await Promise.all([
    writeFile(docxFile(id), bytes),
    writeFile(metadataFile(id), JSON.stringify(updated), 'utf8')
  ]);
  return updated;
}

function encode(value: object) { return Buffer.from(JSON.stringify(value)).toString('base64url'); }

export function signOnlyOfficeConfig(config: object, secret: string) {
  const header = encode({ alg: 'HS256', typ: 'JWT' });
  const payload = encode(config);
  return `${header}.${payload}.${signature(`${header}.${payload}`, secret)}`;
}

export function verifiedOnlyOfficePayload<T>(token: string | undefined, secret: string): T | null {
  if (!token) return null;
  const pieces = token.split('.');
  if (pieces.length !== 3 || !fixedMatch(pieces[2], signature(`${pieces[0]}.${pieces[1]}`, secret))) return null;
  try { return JSON.parse(Buffer.from(pieces[1], 'base64url').toString('utf8')) as T; }
  catch { return null; }
}
