import { NextRequest, NextResponse } from 'next/server';

const ALLOWED_EXTENSIONS = ['.woff2', '.woff', '.ttf', '.otf', '.eot'];

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const encodedUrl = searchParams.get('url');

    if (!encodedUrl) {
      return NextResponse.json({ error: 'Missing url parameter' }, { status: 400 });
    }

    let fontUrl: string;
    try {
      fontUrl = decodeURIComponent(Buffer.from(encodedUrl, 'base64').toString('utf-8'));
    } catch {
      return NextResponse.json({ error: 'Invalid url encoding' }, { status: 400 });
    }

    // Validate it's a proper URL
    let parsed: URL;
    try {
      parsed = new URL(fontUrl);
    } catch {
      return NextResponse.json({ error: 'Invalid URL' }, { status: 400 });
    }

    // Only allow http/https
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return NextResponse.json({ error: 'Only HTTP(S) URLs are allowed' }, { status: 400 });
    }

    // Validate font extension
    const pathname = parsed.pathname.toLowerCase();
    const isFont = ALLOWED_EXTENSIONS.some(ext => pathname.endsWith(ext));
    if (!isFont) {
      return NextResponse.json({ error: 'URL does not point to a font file' }, { status: 400 });
    }

    const upstream = await fetch(fontUrl, {
      signal: AbortSignal.timeout(15000),
      headers: {
        'User-Agent': 'WP-Font-Scanner/1.0 (Font Downloader)',
        'Accept': '*/*',
      },
    });

    if (!upstream.ok) {
      return NextResponse.json(
        { error: `Upstream returned ${upstream.status}` },
        { status: upstream.status }
      );
    }

    const buffer = await upstream.arrayBuffer();
    const filename = pathname.split('/').pop() || 'font';

    const contentTypeMap: Record<string, string> = {
      '.woff2': 'font/woff2',
      '.woff': 'font/woff',
      '.ttf': 'font/ttf',
      '.otf': 'font/otf',
      '.eot': 'application/vnd.ms-fontobject',
    };
    const ext = ALLOWED_EXTENSIONS.find(e => pathname.endsWith(e)) || '.woff2';
    const contentType = contentTypeMap[ext] || 'application/octet-stream';

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'public, max-age=86400',
      },
    });
  } catch (error: any) {
    if (error.name === 'TimeoutError') {
      return NextResponse.json({ error: 'Download timed out' }, { status: 504 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
