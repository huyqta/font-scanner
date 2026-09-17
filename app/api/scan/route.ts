import { NextRequest, NextResponse } from 'next/server';
import * as cheerio from 'cheerio';
import { parseStringPromise } from 'xml2js';

// Helper to extract CSS variables from text
function extractCssVariables(text: string): Record<string, string> {
  const variables: Record<string, string> = {};
  // Match --variable-name: value;
  const regex = /(--[a-zA-Z0-9_-]+)\s*:\s*([^;!}]+)/gi;
  let match;
  while ((match = regex.exec(text)) !== null) {
    variables[match[1].trim()] = match[2].trim();
  }
  return variables;
}

// Helper to resolve CSS variable chains
function resolveVariable(value: string, variables: Record<string, string>, depth = 0): string {
  if (depth > 5) return value; // Prevent infinite recursion
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

// Helper to extract fonts from text (HTML or CSS)
function extractFonts(text: string, variables: Record<string, string> = {}): string[] {
  const fonts = new Set<string>();
  // Match font-family: "Font Name", serif; or font-family: FontName;
  const regex = /font-family\s*:\s*([^;!}]+)/gi;
  let match;
  while ((match = regex.exec(text)) !== null) {
    let rawValue = match[1].trim();
    
    // Resolve variables if present
    const resolvedValue = rawValue.includes('var(') ? resolveVariable(rawValue, variables) : rawValue;

    const families = resolvedValue.split(',');
    families.forEach(f => {
      const trimmed = f.trim().replace(/['"]/g, '');
      // Filter out generic keywords and unresolved variables
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

async function fetchSitemapUrls(baseUrl: string): Promise<string[]> {
  const sitemapPaths = ['/wp-sitemap.xml', '/sitemap_index.xml'];
  const allPageUrls = new Set<string>();
  const sitemapUrlsToProcess: string[] = [];

  for (const path of sitemapPaths) {
    try {
      const url = new URL(path, baseUrl).href;
      const res = await fetch(url);
      if (!res.ok) continue;
      
      const xml = await res.text();
      const parsed = await parseStringPromise(xml);
      
      // WordPress Sitemap Index
      if (parsed.sitemapindex && parsed.sitemapindex.sitemap) {
        parsed.sitemapindex.sitemap.forEach((s: any) => {
          if (s.loc && s.loc[0]) sitemapUrlsToProcess.push(s.loc[0]);
        });
      } 
      // Simple Sitemap
      else if (parsed.urlset && parsed.urlset.url) {
        parsed.urlset.url.forEach((u: any) => {
          if (u.loc && u.loc[0]) allPageUrls.add(u.loc[0]);
        });
      }
    } catch (e) {
      console.error(`Error fetching sitemap ${path}:`, e);
    }
  }

  // Process nested sitemaps
  for (const sitemapUrl of sitemapUrlsToProcess) {
    try {
      const res = await fetch(sitemapUrl);
      if (!res.ok) continue;
      const xml = await res.text();
      const parsed = await parseStringPromise(xml);
      
      if (parsed.urlset && parsed.urlset.url) {
        parsed.urlset.url.forEach((u: any) => {
          if (u.loc && u.loc[0]) allPageUrls.add(u.loc[0]);
        });
      }
    } catch (e) {
      console.error(`Error processing nested sitemap ${sitemapUrl}:`, e);
    }
  }

  return Array.from(allPageUrls);
}

export async function POST(req: NextRequest) {
  try {
    const { url } = await req.json();
    if (!url) {
      return NextResponse.json({ error: 'URL is required' }, { status: 400 });
    }

    const baseUrl = url.startsWith('http') ? url : `https://${url}`;
    const pageUrls = await fetchSitemapUrls(baseUrl);

    if (pageUrls.length === 0) {
      return NextResponse.json({ error: 'No pages found in sitemaps' }, { status: 404 });
    }

    const results: any[] = [];
    const allFonts = new Set<string>();

    for (const pageUrl of pageUrls) {
      try {
        const res = await fetch(pageUrl);
        if (!res.ok) continue;
        const html = await res.text();
        const $ = cheerio.load(html);

        const pageFonts = new Set<string>();
        let combinedCss = '';
        const variables: Record<string, string> = {};

        // 1. Collect all CSS content for variable extraction
        // From <style> tags
        $('style').each((_, el) => {
          combinedCss += $(el).text() + '\n';
        });

        // From external stylesheets (first 5 for speed)
        const stylesheets: string[] = [];
        $('link[rel="stylesheet"]').each((_, el) => {
          const href = $(el).attr('href');
          if (href) stylesheets.push(new URL(href, pageUrl).href);
        });

        for (const ssUrl of stylesheets.slice(0, 5)) {
          try {
            const ssRes = await fetch(ssUrl);
            if (ssRes.ok) {
              combinedCss += await ssRes.text() + '\n';
            }
          } catch (e) {}
        }

        // 2. Extract variables from combined CSS
        const extractedVars = extractCssVariables(combinedCss);
        Object.assign(variables, extractedVars);

        // 3. Extract fonts using resolved variables
        extractFonts(combinedCss, variables).forEach(f => pageFonts.add(f));

        // 4. Extract from inline style attributes
        $('[style*="font-family"]').each((_, el) => {
          extractFonts($(el).attr('style') || '', variables).forEach(f => pageFonts.add(f));
        });

        const fontList = Array.from(pageFonts);
        results.push({
          url: pageUrl,
          fonts: fontList
        });

        fontList.forEach(f => allFonts.add(f));
      } catch (e) {
        console.error(`Error scanning page ${pageUrl}:`, e);
      }
    }

    return NextResponse.json({
      summary: Array.from(allFonts),
      details: results,
      totalScanned: results.length,
      totalFound: pageUrls.length
    });

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
