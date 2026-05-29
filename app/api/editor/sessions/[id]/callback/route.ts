import { NextRequest, NextResponse } from 'next/server';
import { authenticateOnlyOfficeSession, saveOnlyOfficeDocument, verifiedOnlyOfficePayload } from '../../../../../../lib/onlyoffice-session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ id: string }> };
type Callback = { status?: number; url?: string; token?: string; key?: string };

function origin(value: string | undefined) {
  return value ? new URL(value).origin : '';
}

export async function POST(request: NextRequest, context: Context) {
  try {
    const { id } = await context.params;
    await authenticateOnlyOfficeSession(id, request.nextUrl.searchParams.get('access'));
    const secret = process.env.ONLYOFFICE_JWT_SECRET;
    const incoming = await request.json() as Callback;
    const callback = secret && incoming.token ? (verifiedOnlyOfficePayload<Callback>(incoming.token, secret) || incoming) : incoming;
    if (secret && incoming.token && !verifiedOnlyOfficePayload<Callback>(incoming.token, secret)) {
      return NextResponse.json({ error: 1 }, { status: 401 });
    }
    if ((callback.status !== 2 && callback.status !== 6) || !callback.url) {
      return NextResponse.json({ error: 0 });
    }
    const allowedOrigin = origin(process.env.ONLYOFFICE_INTERNAL_URL || process.env.NEXT_PUBLIC_ONLYOFFICE_URL);
    if (!allowedOrigin || new URL(callback.url).origin !== allowedOrigin) {
      return NextResponse.json({ error: 1 }, { status: 400 });
    }
    const saved = await fetch(callback.url, { cache: 'no-store' });
    if (!saved.ok) return NextResponse.json({ error: 1 }, { status: 502 });
    await saveOnlyOfficeDocument(id, Buffer.from(await saved.arrayBuffer()));
    return NextResponse.json({ error: 0 });
  } catch {
    return NextResponse.json({ error: 1 }, { status: 500 });
  }
}
