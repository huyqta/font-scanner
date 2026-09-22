import { NextRequest, NextResponse } from 'next/server';
import * as cheerio from 'cheerio';
import { parseStringPromise } from 'xml2js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface FontFile {
  url: string;
  filename: string;
  format: string;
  foundOnPages: string[];
}

// ─── CSS Helpers ──────────────────────────────────────────────────────────────

function extractCssVariables(text: string): Record<string, string> {
  const variables: Record<string, string> = {};
  const regex = /(--[a-zA-Z0-9_-]+)\s*:\s*([^;!}]+)/gi;
  let match;
  while ((match = regex.exec(text)) !== null) {
    variables[match[1].trim()] = match[2].trim();
  }
  return variables;
}

function resolveVariable(value: string, variables: Record<string, string>, depth = 0): string {
  if (depth > 5) return value;
  const varRegex = /var\(\s*(--[a-zA-Z0-9_-]+)\s*(?:,\s*([^)]+))?\)/gi;
  const result = value.replace(varRegex, (match, varName, fallback) => {
    const resolved = variables[varName] || fallback || match;
    return resolved;
  });
  if (result.includes('var(') && result !== value) {
    return resolveVariable(result, variables, depth + 1);
  }
  return result;
}

function extractFonts(text: string, variables: Record<string, string> = {}): string[] {
  const fonts = new Set<string>();
  const regex = /font-family\s*:\s*([^;!}]+)/gi;
  let match;
  while ((match = regex.exec(text)) !== null) {
    let rawValue = match[1].trim();
    const resolvedValue = rawValue.includes('var(') ? resolveVariable(rawValue, variables) : rawValue;
    const families = resolvedValue.split(',');
    families.forEach(f => {
      const trimmed = f.trim().replace(/['"]/g, '');
      if (
        trimmed &&
        !['inherit', 'initial', 'unset', 'none', 'serif', 'sans-serif', 'monospace', 'cursive', 'fantasy', 'system-ui'].includes(trimmed.toLowerCase()) &&
        !trimmed.startsWith('var(') &&
        !trimmed.startsWith('--')
      ) {
        fonts.add(trimmed);
      }
    });
  }
  return Array.from(fonts);
}

// ─── Font File Discovery ──────────────────────────────────────────────────────

const FONT_EXTENSIONS = ['.woff2', '.woff', '.ttf', '.otf', '.eot'];

function extractFontUrls(cssText: string, baseUrl: string): { url: string; filename: string; format: string }[] {
  const results: { url: string; filename: string; format: string }[] = [];
  const seen = new Set<string>();

  // Match @font-face blocks
  const fontFaceRegex = /@font-face\s*\{([^}]+)\}/gi;
  let faceMatch;
  while ((faceMatch = fontFaceRegex.exec(cssText)) !== null) {
    const block = faceMatch[1];
    // Match url(...) inside src:
    const urlRegex = /url\(\s*['"]?([^'")]+\.(?:woff2?|ttf|otf|eot)[^'")]*?)['"]?\s*\)/gi;
    let urlMatch;
    while ((urlMatch = urlRegex.exec(block)) !== null) {
      let rawUrl = urlMatch[1].trim().split('?')[0].split('#')[0];
      let absUrl: string;
      try {
        absUrl = new URL(rawUrl, baseUrl).href;
      } catch {
        continue;
      }
      if (seen.has(absUrl)) continue;
      seen.add(absUrl);

      const filename = absUrl.split('/').pop() || rawUrl;
      const ext = filename.match(/\.(woff2?|ttf|otf|eot)$/i)?.[1]?.toLowerCase() || 'unknown';
      const formatMap: Record<string, string> = {
        woff2: 'WOFF2', woff: 'WOFF', ttf: 'TTF', otf: 'OTF', eot: 'EOT'
      };

      results.push({ url: absUrl, filename, format: formatMap[ext] || ext.toUpperCase() });
    }
  }

  // Also match preload links / plain url() references to font files outside @font-face
  const plainUrlRegex = /url\(\s*['"]?([^'")]+\.(?:woff2?|ttf|otf|eot)[^'")]*?)['"]?\s*\)/gi;
  let plainMatch;
  while ((plainMatch = plainUrlRegex.exec(cssText)) !== null) {
    let rawUrl = plainMatch[1].trim().split('?')[0].split('#')[0];
    let absUrl: string;
    try {
      absUrl = new URL(rawUrl, baseUrl).href;
    } catch {
      continue;
    }
    if (seen.has(absUrl)) continue;
    seen.add(absUrl);
    const filename = absUrl.split('/').pop() || rawUrl;
    const ext = filename.match(/\.(woff2?|ttf|otf|eot)$/i)?.[1]?.toLowerCase() || 'unknown';
    const formatMap: Record<string, string> = {
      woff2: 'WOFF2', woff: 'WOFF', ttf: 'TTF', otf: 'OTF', eot: 'EOT'
    };
    results.push({ url: absUrl, filename, format: formatMap[ext] || ext.toUpperCase() });
  }

  return results;
}

// ─── URL Discovery ────────────────────────────────────────────────────────────

async function fetchSitemapUrls(sitemapUrl: string): Promise<string[]> {
  const allPageUrls = new Set<string>();
  const sitemapUrlsToProcess: string[] = [];

  try {
    const res = await fetch(sitemapUrl, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return [];
    const xml = await res.text();
    const parsed = await parseStringPromise(xml);

    if (parsed.sitemapindex?.sitemap) {
      parsed.sitemapindex.sitemap.forEach((s: any) => {
        if (s.loc?.[0]) sitemapUrlsToProcess.push(s.loc[0]);
      });
    } else if (parsed.urlset?.url) {
      parsed.urlset.url.forEach((u: any) => {
        if (u.loc?.[0]) allPageUrls.add(u.loc[0]);
      });
    }
  } catch {
    return [];
  }

  for (const nested of sitemapUrlsToProcess) {
    try {
      const res = await fetch(nested, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) continue;
      const xml = await res.text();
      const parsed = await parseStringPromise(xml);
      if (parsed.urlset?.url) {
        parsed.urlset.url.forEach((u: any) => {
          if (u.loc?.[0]) allPageUrls.add(u.loc[0]);
        });
      }
    } catch {
      continue;
    }
  }

  return Array.from(allPageUrls);
}

async function discoverPageUrls(baseUrl: string): Promise<{ urls: string[]; method: string }> {
  const origin = new URL(baseUrl).origin;

  // 1. Standard sitemap paths
  const sitemapPaths = [
    '/wp-sitemap.xml',
    '/sitemap_index.xml',
    '/sitemap.xml',
    '/page-sitemap.xml',
    '/post-sitemap.xml',
  ];

  for (const path of sitemapPaths) {
    const urls = await fetchSitemapUrls(new URL(path, baseUrl).href);
    if (urls.length > 0) {
      return { urls, method: 'sitemap' };
    }
  }

  // 2. robots.txt — look for Sitemap: directive
  try {
    const robotsRes = await fetch(new URL('/robots.txt', baseUrl).href, { signal: AbortSignal.timeout(5000) });
    if (robotsRes.ok) {
      const robotsText = await robotsRes.text();
      const sitemapMatches = [...robotsText.matchAll(/^Sitemap:\s*(.+)$/gim)];
      for (const m of sitemapMatches) {
        const sitemapUrl = m[1].trim();
        const urls = await fetchSitemapUrls(sitemapUrl);
        if (urls.length > 0) {
          return { urls, method: 'robots-txt' };
        }
      }
    }
  } catch {
    // ignore
  }

  // 3. Crawl homepage for internal links
  try {
    const homeRes = await fetch(baseUrl, { signal: AbortSignal.timeout(8000) });
    if (homeRes.ok) {
      const html = await homeRes.text();
      const $ = cheerio.load(html);
      const urls = new Set<string>([baseUrl]);

      $('a[href]').each((_, el) => {
        const href = $(el).attr('href') || '';
        try {
          const abs = new URL(href, baseUrl).href;
          // Only same-origin, no anchors/query-only, no assets
          if (
            abs.startsWith(origin) &&
            !abs.includes('#') &&
            !FONT_EXTENSIONS.some(ext => abs.endsWith(ext)) &&
            !abs.match(/\.(jpg|jpeg|png|gif|svg|webp|pdf|zip|js|css)$/i)
          ) {
            urls.add(abs);
          }
        } catch {
          // ignore
        }
      });

      const urlList = Array.from(urls).slice(0, 50);
      if (urlList.length > 1) {
        return { urls: urlList, method: 'crawl' };
      }
    }
  } catch {
    // ignore
  }

  // 4. Fallback: just scan the homepage
  return { urls: [baseUrl], method: 'homepage' };
}

// ─── Route Handler ────────────────────────────────────────────────────────────

const CONCURRENCY  = 3;      // pages scanned simultaneously (reduced for slow sites)
const PAGE_TIMEOUT = 60_000; // 60s — some sites are very slow
const CSS_TIMEOUT  = 20_000;
const MAX_PAGES    = 200;    // safety cap

/** Scan one page: returns fonts found and font file URLs. */
async function scanPage(
  pageUrl: string,
  cssCache: Map<string, string>,
): Promise<{ fonts: string[]; fontFileEntries: { url: string; filename: string; format: string }[] } | null> {
  try {
    const res = await fetch(pageUrl, {
      signal: AbortSignal.timeout(PAGE_TIMEOUT),
      headers: { 'User-Agent': 'WP-Font-Scanner/1.0' },
    });
    if (!res.ok) return null;

    const html = await res.text();
    const $ = cheerio.load(html);

    const pageFonts = new Set<string>();
    const variables: Record<string, string> = {};
    let combinedCss = '';
    const fontFileEntries: { url: string; filename: string; format: string }[] = [];

    // 1. Inline <style> tags
    $('style').each((_, el) => { combinedCss += $(el).text() + '\n'; });

    // 2. External stylesheets — fetch in parallel, deduplicated via cssCache
    const stylesheetUrls: string[] = [];
    $('link[rel="stylesheet"]').each((_, el) => {
      const href = $(el).attr('href');
      if (!href) return;
      try { stylesheetUrls.push(new URL(href, pageUrl).href); } catch {}
    });

    const cssTexts = await Promise.all(
      stylesheetUrls.slice(0, 8).map(async (ssUrl) => {
        if (cssCache.has(ssUrl)) return { url: ssUrl, css: cssCache.get(ssUrl)! };
        try {
          const r = await fetch(ssUrl, { signal: AbortSignal.timeout(CSS_TIMEOUT) });
          if (!r.ok) return { url: ssUrl, css: '' };
          const css = await r.text();
          cssCache.set(ssUrl, css);
          return { url: ssUrl, css };
        } catch { return { url: ssUrl, css: '' }; }
      })
    );

    for (const { url: ssUrl, css } of cssTexts) {
      combinedCss += css + '\n';
      extractFontUrls(css, ssUrl).forEach(ff => fontFileEntries.push(ff));
    }

    // 3. <link rel="preload" as="font">
    $('link[rel="preload"][as="font"]').each((_, el) => {
      const href = $(el).attr('href');
      if (!href) return;
      try {
        const absUrl = new URL(href, pageUrl).href;
        const cleanUrl = absUrl.split('?')[0].split('#')[0];
        const filename = cleanUrl.split('/').pop() || href;
        const ext = filename.match(/\.(woff2?|ttf|otf|eot)$/i)?.[1]?.toLowerCase();
        if (ext) {
          const fmtMap: Record<string, string> = { woff2: 'WOFF2', woff: 'WOFF', ttf: 'TTF', otf: 'OTF', eot: 'EOT' };
          fontFileEntries.push({ url: cleanUrl, filename, format: fmtMap[ext] || ext.toUpperCase() });
        }
      } catch {}
    });

    // 4. Font files from inline CSS
    extractFontUrls(combinedCss, pageUrl).forEach(ff => fontFileEntries.push(ff));

    // 5. Font-family names
    const extractedVars = extractCssVariables(combinedCss);
    Object.assign(variables, extractedVars);
    extractFonts(combinedCss, variables).forEach(f => pageFonts.add(f));
    $('[style*="font-family"]').each((_, el) => {
      extractFonts($(el).attr('style') || '', variables).forEach(f => pageFonts.add(f));
    });

    return { fonts: Array.from(pageFonts), fontFileEntries };
  } catch (e: any) {
    const reason = e?.name === 'TimeoutError' ? 'timeout' : (e?.message ?? 'unknown');
    console.warn(`[scan] skipped ${pageUrl} — ${reason}`);
    return null;
  }
}

export async function POST(req: NextRequest) {
  try {
    const { url } = await req.json();
    if (!url) {
      return NextResponse.json({ error: 'URL is required' }, { status: 400 });
    }

    const baseUrl = url.startsWith('http') ? url : `https://${url}`;
    const { urls: allPageUrls, method: discoveryMethod } = await discoverPageUrls(baseUrl);

    const pageUrls = allPageUrls.length > 0
      ? allPageUrls.slice(0, MAX_PAGES)
      : [baseUrl]; // always scan at least the homepage

    const results: { url: string; fonts: string[] }[] = [];
    const allFonts    = new Set<string>();
    const fontFileMap = new Map<string, { url: string; filename: string; format: string; foundOnPages: string[] }>();
    const cssCache    = new Map<string, string>();  // shared stylesheet cache across pages

    // Process pages in concurrent batches
    for (let i = 0; i < pageUrls.length; i += CONCURRENCY) {
      const batch = pageUrls.slice(i, i + CONCURRENCY);
      const batchResults = await Promise.all(
        batch.map(pageUrl => scanPage(pageUrl, cssCache).then(r => ({ pageUrl, r })))
      );

      for (const { pageUrl, r } of batchResults) {
        if (!r) continue;

        results.push({ url: pageUrl, fonts: r.fonts });
        r.fonts.forEach(f => allFonts.add(f));

        for (const ff of r.fontFileEntries) {
          if (!fontFileMap.has(ff.url)) {
            fontFileMap.set(ff.url, { ...ff, foundOnPages: [] });
          }
          const entry = fontFileMap.get(ff.url)!;
          if (!entry.foundOnPages.includes(pageUrl)) {
            entry.foundOnPages.push(pageUrl);
          }
        }
      }
    }

    const fontFiles = Array.from(fontFileMap.values())
      .sort((a, b) => b.foundOnPages.length - a.foundOnPages.length);

    return NextResponse.json({
      summary: Array.from(allFonts),
      details: results,
      totalScanned: results.length,
      totalFound: allPageUrls.length,
      fontFiles,
      discoveryMethod,
    });

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

