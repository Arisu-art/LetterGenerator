import { NextRequest, NextResponse } from 'next/server';
import { authenticateOnlyOfficeSession, readOnlyOfficeDocument } from '../../../../../../lib/onlyoffice-session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: Context) {
  try {
    const { id } = await context.params;
    const session = await authenticateOnlyOfficeSession(id, request.nextUrl.searchParams.get('access'));
    const bytes = await readOnlyOfficeDocument(id);
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename="${session.title}"`,
        'Cache-Control': 'private, no-store, max-age=0',
        'X-Editor-Last-Saved': String(session.lastSavedAt || '')
      }
    });
  } catch {
    return NextResponse.json({ error: 'Saved editor document is unavailable.' }, { status: 404 });
  }
}
