import { NextRequest, NextResponse } from "next/server";

export type OgPreviewResult = {
  title: string | null;
  description: string | null;
  imageUrl: string | null;
  favicon: string | null;
};

const memoryCache = new Map<string, { data: OgPreviewResult; expiresAt: number }>();
const CACHE_TTL_MS = 3600 * 1000;
const FETCH_TIMEOUT_MS = 5000;

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/gi, "'");
}

function extractMetaContent(
  html: string,
  attr: "property" | "name",
  key: string,
): string | null {
  const patterns = [
    new RegExp(
      `<meta[^>]+${attr}=["']${key}["'][^>]+content=["']([^"']+)["']`,
      "i",
    ),
    new RegExp(
      `<meta[^>]+content=["']([^"']+)["'][^>]+${attr}=["']${key}["']`,
      "i",
    ),
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) {
      const decoded = decodeHtmlEntities(match[1].trim());
      if (decoded) return decoded;
    }
  }
  return null;
}

function extractFavicon(html: string, pageUrl: URL): string {
  const iconMatch =
    html.match(
      /<link[^>]+rel=["'](?:shortcut icon|icon|apple-touch-icon)["'][^>]+href=["']([^"']+)["']/i,
    ) ??
    html.match(
      /<link[^>]+href=["']([^"']+)["'][^>]+rel=["'](?:shortcut icon|icon|apple-touch-icon)["']/i,
    );

  if (iconMatch?.[1]) {
    try {
      return new URL(iconMatch[1], pageUrl.origin).toString();
    } catch {
      /* fall through */
    }
  }

  return `https://${pageUrl.hostname}/favicon.ico`;
}

function emptyResult(favicon: string | null = null): OgPreviewResult {
  return { title: null, description: null, imageUrl: null, favicon };
}

async function fetchOgPreview(targetUrl: string): Promise<OgPreviewResult> {
  const cached = memoryCache.get(targetUrl);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  let parsed: URL;
  try {
    parsed = new URL(targetUrl);
  } catch {
    return emptyResult();
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    return emptyResult();
  }

  const fallbackFavicon = `https://${parsed.hostname}/favicon.ico`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    const response = await fetch(parsed.toString(), {
      signal: controller.signal,
      headers: {
        "User-Agent": "DesignTraceBot/1.0 (+https://designtrace.app)",
        Accept: "text/html,application/xhtml+xml",
      },
      next: { revalidate: 3600 },
    });

    clearTimeout(timeout);

    if (!response.ok) {
      const data = emptyResult(fallbackFavicon);
      memoryCache.set(targetUrl, { data, expiresAt: Date.now() + CACHE_TTL_MS });
      return data;
    }

    const html = await response.text();
    const title =
      extractMetaContent(html, "property", "og:title") ??
      extractMetaContent(html, "name", "twitter:title") ??
      extractMetaContent(html, "name", "title");
    const description =
      extractMetaContent(html, "property", "og:description") ??
      extractMetaContent(html, "name", "twitter:description") ??
      extractMetaContent(html, "name", "description");
    const imageRaw =
      extractMetaContent(html, "property", "og:image") ??
      extractMetaContent(html, "name", "twitter:image");

    let imageUrl: string | null = null;
    if (imageRaw) {
      try {
        imageUrl = new URL(imageRaw, parsed.origin).toString();
      } catch {
        imageUrl = imageRaw;
      }
    }

    const favicon = extractFavicon(html, parsed);
    const data: OgPreviewResult = { title, description, imageUrl, favicon };
    memoryCache.set(targetUrl, { data, expiresAt: Date.now() + CACHE_TTL_MS });
    return data;
  } catch {
    const data = emptyResult(fallbackFavicon);
    memoryCache.set(targetUrl, { data, expiresAt: Date.now() + CACHE_TTL_MS });
    return data;
  }
}

export async function GET(request: NextRequest) {
  const rawUrl = request.nextUrl.searchParams.get("url")?.trim() ?? "";
  if (!rawUrl) {
    return NextResponse.json(emptyResult());
  }

  const data = await fetchOgPreview(rawUrl);
  return NextResponse.json(data);
}
