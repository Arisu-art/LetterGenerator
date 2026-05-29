import { NextRequest, NextResponse } from 'next/server';
import { createOnlyOfficeSession, signOnlyOfficeConfig } from '../../../../lib/onlyoffice-session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function required(name: string) {
  const value = process.env[name]?.replace(/\/$/, '');
  if (!value) throw new Error(`${name} is required for live DOCX editing.`);
  return value;
}

export async function POST(request: NextRequest) {
  try {
    const data = await request.formData();
    const document = data.get('file');
    if (!(document instanceof File) || !/\.docx$/i.test(document.name)) {
      return NextResponse.json({ error: 'A generated DOCX file is required.' }, { status: 400 });
    }
    if (document.size > 25 * 1024 * 1024) {
      return NextResponse.json({ error: 'DOCX exceeds the 25 MB editing limit.' }, { status: 413 });
    }
    const appUrl = required('LETTERGENERATOR_PUBLIC_URL');
    const editorUrl = required('NEXT_PUBLIC_ONLYOFFICE_URL');
    const secret = required('ONLYOFFICE_JWT_SECRET');
    const title = String(data.get('title') || document.name);
    const session = await createOnlyOfficeSession(Buffer.from(await document.arrayBuffer()), title);
    const fileUrl = `${appUrl}/api/editor/sessions/${session.id}/file?access=${session.accessKey}`;
    const callbackUrl = `${appUrl}/api/editor/sessions/${session.id}/callback?access=${session.accessKey}`;
    const config: Record<string, unknown> = {
      document: {
        fileType: 'docx',
        key: session.key,
        title: session.title,
        url: fileUrl,
        permissions: { edit: true, download: false, print: true, review: true, comment: true }
      },
      documentType: 'word',
      editorConfig: {
        callbackUrl,
        mode: 'edit',
        lang: 'en',
        user: { id: 'lettergenerator-user', name: 'Document Reviewer' },
        customization: { autosave: true, forcesave: true, help: false, compactHeader: false, toolbarNoTabs: false }
      },
      height: '100%',
      width: '100%'
    };
    config.token = signOnlyOfficeConfig(config, secret);
    return NextResponse.json({
      id: session.id,
      editorScriptUrl: `${editorUrl}/web-apps/apps/api/documents/api.js`,
      config
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to start the DOCX editor.' }, { status: 500 });
  }
}
