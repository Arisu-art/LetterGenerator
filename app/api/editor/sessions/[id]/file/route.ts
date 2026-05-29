import { NextRequest, NextResponse } from 'next/server';
import { authenticateOnlyOfficeSession, readOnlyOfficeDocument } from '../../../../../lib/onlyoffice-session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: Context) {
  try {
    const { id } = await context.params;
    const session = await authenticateOnlyOfficeSession(id, request.nextUrl.searchParams.get('access'));
    const document = await readOnlyOfficeDocument(id);
    return new NextResponse(new Uint8Array(document), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `inline; filename="${session.title}"`,
        'Cache-Control': 'private, no-store, max-age=0'
      }
    });
  } catch {
    return NextResponse.json({ error: 'Document editing session was not found or is unauthorized.' }, { status: 404 });
  }
}
