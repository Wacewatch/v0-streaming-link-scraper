import * as cheerio from "cheerio";
import type { ScrapeResult } from "@/lib/types";

const FETCH_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.8",
  Referer: "https://www.google.com/",
};

// ── Known embed/player domains ──────────────────────────────────────────────
const PLAYER_DOMAINS = [
  "doodstream", "dood", "streamtape", "mixdrop", "upstream",
  "vidoza", "voe", "filemoon", "streamvid", "vido", "uqload",
  "netu", "waaw", "wishonly", "myvi", "sibnet", "sendvid",
  "vidmoly", "vidcloud", "embedrise", "guccihide", "listeamed",
  "ahvsh", "playerx", "darkibox", "streamsb", "fembed", "supervideo",
  "evoload", "mp4upload", "vidlox", "streamhub", "streamz",
  "uptostream", "uptobox", "rapidrame", "cloudemb", "embedsito",
  "vidsrc", "2embed", "autoembed", "multiembed", "membed",
  "playtaku", "embtaku", "anime1", "gogoanime",
];

// ── Domains / patterns to REJECT (images, APIs, trackers, CDNs) ────────────
const REJECT_PATTERNS = [
  "image.tmdb.org", "tmdb.org/t/p/", "themoviedb.org",
  "gravatar.com", "googleapis.com/", "gstatic.com",
  "facebook.com", "twitter.com", "instagram.com", "tiktok.com",
  "google-analytics.com", "googletagmanager.com", "doubleclick.net",
  "amazon-adsystem.com", "adsafeprotected.com",
  ".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp", ".ico", ".bmp",
  ".css", ".woff", ".woff2", ".ttf", ".eot",
];

export async function scrapeTopStreamMovie(
  baseUrl: string,
  tmdbId: number,
  title: string
): Promise<ScrapeResult | null> {
  try {
    const searchUrl = `${baseUrl}/recherche/${encodeURIComponent(title)}`;
    const searchRes = await fetch(searchUrl, {
      headers: FETCH_HEADERS,
      signal: AbortSignal.timeout(15000),
    });
    if (!searchRes.ok) return null;

    const searchHtml = await searchRes.text();
    const $search = cheerio.load(searchHtml);

    let movieUrl: string | null = null;
    $search("a[href*='/film/'], a[href*='/movie/']").each((_, el) => {
      const href = $search(el).attr("href");
      if (href && !movieUrl) {
        movieUrl = href.startsWith("http") ? href : `${baseUrl}${href}`;
      }
    });

    if (!movieUrl) {
      const directUrls = [
        `${baseUrl}/film/${tmdbId}`,
        `${baseUrl}/movie/${tmdbId}`,
      ];
      for (const url of directUrls) {
        try {
          const res = await fetch(url, {
            headers: FETCH_HEADERS,
            redirect: "follow",
            signal: AbortSignal.timeout(10000),
          });
          if (res.ok) { movieUrl = url; break; }
        } catch { continue; }
      }
    }

    if (!movieUrl) return null;

    const movieRes = await fetch(movieUrl, {
      headers: FETCH_HEADERS,
      signal: AbortSignal.timeout(15000),
    });
    if (!movieRes.ok) return null;

    const movieHtml = await movieRes.text();
    return extractPlayers(movieHtml, movieUrl, title);
  } catch (error) {
    console.error(`[TopStream] Error scraping movie ${tmdbId}:`, error);
    return null;
  }
}

export async function scrapeTopStreamSeries(
  baseUrl: string,
  tmdbId: number,
  title: string,
  season?: number,
  episode?: number
): Promise<ScrapeResult | null> {
  try {
    const searchUrl = `${baseUrl}/recherche/${encodeURIComponent(title)}`;
    const searchRes = await fetch(searchUrl, {
      headers: FETCH_HEADERS,
      signal: AbortSignal.timeout(15000),
    });
    if (!searchRes.ok) return null;

    const searchHtml = await searchRes.text();
    const $search = cheerio.load(searchHtml);

    let seriesUrl: string | null = null;
    $search("a[href*='/serie/'], a[href*='/series/'], a[href*='/anime/']").each((_, el) => {
      const href = $search(el).attr("href");
      if (href && !seriesUrl) {
        seriesUrl = href.startsWith("http") ? href : `${baseUrl}${href}`;
      }
    });

    if (!seriesUrl) {
      const directUrls = [
        `${baseUrl}/serie/${tmdbId}`,
        `${baseUrl}/series/${tmdbId}`,
        `${baseUrl}/anime/${tmdbId}`,
      ];
      for (const url of directUrls) {
        try {
          const res = await fetch(url, {
            headers: FETCH_HEADERS,
            redirect: "follow",
            signal: AbortSignal.timeout(10000),
          });
          if (res.ok) { seriesUrl = url; break; }
        } catch { continue; }
      }
    }

    if (!seriesUrl) return null;

    let targetUrl = seriesUrl;
    if (season !== undefined) {
      targetUrl = `${seriesUrl}/saison-${season}`;
      if (episode !== undefined) {
        targetUrl = `${seriesUrl}/saison-${season}/episode-${episode}`;
      }
    }

    const pageRes = await fetch(targetUrl, {
      headers: FETCH_HEADERS,
      signal: AbortSignal.timeout(15000),
    });
    if (!pageRes.ok) return null;

    const pageHtml = await pageRes.text();
    return extractPlayers(pageHtml, targetUrl, title, season, episode);
  } catch (error) {
    console.error(`[TopStream] Error scraping series ${tmdbId}:`, error);
    return null;
  }
}

/** Scrape the listing page of a source to get all content links */
export async function scrapeTopStreamListing(
  baseUrl: string,
  contentType: "movie" | "series" | "anime"
): Promise<{ title: string; url: string }[]> {
  const results: { title: string; url: string }[] = [];
  const pathMap: Record<string, string[]> = {
    movie: ["/films", "/film", "/movies"],
    series: ["/series", "/serie"],
    anime: ["/animes", "/anime"],
  };

  const paths = pathMap[contentType] || ["/films"];

  for (const path of paths) {
    try {
      for (let page = 1; page <= 10; page++) {
        const listUrl =
          page === 1 ? `${baseUrl}${path}` : `${baseUrl}${path}/page/${page}`;

        const res = await fetch(listUrl, {
          headers: FETCH_HEADERS,
          signal: AbortSignal.timeout(15000),
        });
        if (!res.ok) break;

        const html = await res.text();
        const $ = cheerio.load(html);

        let foundItems = false;
        $("a").each((_, el) => {
          const href = $(el).attr("href");
          const text =
            $(el).attr("title") ||
            $(el).find("h2, h3, .title, .name").first().text().trim() ||
            $(el).text().trim();

          if (!href || !text) return;

          const fullUrl = href.startsWith("http") ? href : `${baseUrl}${href}`;
          const isContentLink =
            (contentType === "movie" &&
              (href.includes("/film/") || href.includes("/movie/"))) ||
            (contentType === "series" &&
              (href.includes("/serie/") || href.includes("/series/"))) ||
            (contentType === "anime" && href.includes("/anime/"));

          if (isContentLink && text.length > 1 && text.length < 200) {
            if (!results.find((r) => r.url === fullUrl)) {
              results.push({ title: text, url: fullUrl });
              foundItems = true;
            }
          }
        });

        if (!foundItems) break;
      }
      if (results.length > 0) break;
    } catch { continue; }
  }

  return results;
}

// ── Core extraction – public so index.ts can reuse it ─────────────────────
export function extractPlayers(
  html: string,
  sourceUrl: string,
  title: string,
  season?: number,
  episode?: number
): ScrapeResult {
  const $ = cheerio.load(html);
  const players: ScrapeResult["players"] = [];
  const seen = new Set<string>();

  function addPlayer(url: string, name: string, contextText?: string) {
    const clean = url.trim();
    if (!clean || seen.has(clean)) return;
    if (!isVideoUrl(clean)) return;

    seen.add(clean);
    players.push({
      player_name: name || extractPlayerName(clean),
      embed_url: clean,
      quality: extractQuality(contextText || name || ""),
      language: extractLanguage(contextText || name || ""),
      season,
      episode,
      player_type: isM3u8Url(clean) ? "m3u8" : "embed",
    });
  }

  // ── 1. Direct m3u8 links anywhere in the raw HTML ─────────────────────
  const m3u8Regex = /https?:\/\/[^\s"'<>\\]+\.m3u8[^\s"'<>\\]*/gi;
  const m3u8Matches = html.match(m3u8Regex);
  if (m3u8Matches) {
    for (const m of m3u8Matches) {
      addPlayer(m, "m3u8");
    }
  }

  // ── 2. iframe src/data-src – only if they point to player/embed sites ─
  $("iframe").each((_, el) => {
    const src = $(el).attr("src") || $(el).attr("data-src");
    if (src && src.startsWith("http")) {
      addPlayer(src, extractPlayerName(src));
    }
  });

  // ── 3. Player buttons / tabs with data-url, data-embed, etc. ─────────
  $(
    '[data-url], [data-src], [data-link], [data-embed], .player-btn, .player-tab, [onclick*="http"]'
  ).each((_, el) => {
    const url =
      $(el).attr("data-url") ||
      $(el).attr("data-src") ||
      $(el).attr("data-link") ||
      $(el).attr("data-embed");

    const contextText = $(el).text().trim();

    if (url && url.startsWith("http")) {
      addPlayer(url, contextText || extractPlayerName(url), contextText);
    }

    const onclick = $(el).attr("onclick");
    if (onclick) {
      const urlMatch = onclick.match(/https?:\/\/[^\s'"\\)]+/);
      if (urlMatch) {
        addPlayer(urlMatch[0], contextText || extractPlayerName(urlMatch[0]), contextText);
      }
    }
  });

  // ── 4. Script tags – look for m3u8, embed URLs, player configs ────────
  $("script").each((_, el) => {
    const scriptContent = $(el).html();
    if (!scriptContent) return;

    // m3u8 links in scripts
    const scriptM3u8 = scriptContent.match(m3u8Regex);
    if (scriptM3u8) {
      for (const m of scriptM3u8) {
        addPlayer(m, "m3u8");
      }
    }

    // file/source/src URLs in JS (common patterns in video players)
    const fileRegex = /(?:file|source|src|url|video_url|video|stream|link|embed)\s*[:=]\s*['"](https?:\/\/[^'"]+)['"]/gi;
    let match: RegExpExecArray | null;
    while ((match = fileRegex.exec(scriptContent)) !== null) {
      addPlayer(match[1], extractPlayerName(match[1]));
    }

    // JSON-encoded player configs {"url":"..."}
    const jsonUrlRegex = /"(?:url|file|src|source|embed|link|stream)"\s*:\s*"(https?:\/\/[^"]+)"/gi;
    while ((match = jsonUrlRegex.exec(scriptContent)) !== null) {
      addPlayer(match[1], extractPlayerName(match[1]));
    }
  });

  // ── 5. <video> / <source> tags ────────────────────────────────────────
  $("video source, video").each((_, el) => {
    const src = $(el).attr("src");
    if (src && src.startsWith("http")) {
      addPlayer(src, "video");
    }
  });

  // ── 6. <a> links pointing to known embed/player domains ──────────────
  $("a[href]").each((_, el) => {
    const href = $(el).attr("href");
    if (href && href.startsWith("http") && isPlayerUrl(href)) {
      addPlayer(href, $(el).text().trim() || extractPlayerName(href), $(el).text().trim());
    }
  });

  const pageTitle =
    $("h1").first().text().trim() || $("title").text().trim() || title;

  return {
    title: pageTitle,
    source_url: sourceUrl,
    players,
  };
}

/**
 * Follow an embed URL to try to resolve the actual m3u8 link inside it.
 * Useful for known player domains that host an intermediate HTML page.
 */
export async function resolveEmbedToM3u8(embedUrl: string): Promise<string | null> {
  try {
    const res = await fetch(embedUrl, {
      headers: {
        ...FETCH_HEADERS,
        Referer: embedUrl,
      },
      redirect: "follow",
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) return null;

    const html = await res.text();
    // Direct m3u8 match
    const m3u8Match = html.match(/https?:\/\/[^\s"'<>\\]+\.m3u8[^\s"'<>\\]*/i);
    if (m3u8Match) return m3u8Match[0];

    // file:"..." or source:"..." patterns
    const fileMatch = html.match(/(?:file|source|src|video_url)\s*[:=]\s*['"](https?:\/\/[^'"]+\.m3u8[^'"]*)['"]/i);
    if (fileMatch) return fileMatch[1];

    return null;
  } catch {
    return null;
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function isM3u8Url(url: string): boolean {
  return /\.m3u8/i.test(url);
}

/** Returns true if the URL looks like a video/embed URL (not an image/tracker/etc.) */
function isVideoUrl(url: string): boolean {
  const low = url.toLowerCase();

  // Reject known non-video patterns
  for (const pattern of REJECT_PATTERNS) {
    if (low.includes(pattern)) return false;
  }

  // Always accept m3u8 links
  if (isM3u8Url(url)) return true;

  // Accept known player/embed domains
  if (isPlayerUrl(url)) return true;

  // Accept URLs with embed/player in the path
  if (/\/(embed|player|e|v|watch|video|stream|play)\//i.test(url)) return true;

  // Accept common video file extensions
  if (/\.(mp4|webm|mkv|avi|flv|ts|m3u8)/i.test(url)) return true;

  // Reject everything else – this is the key filter that prevents
  // random page URLs (TMDB images, CDN assets, etc.) from leaking through
  return false;
}

function isPlayerUrl(url: string): boolean {
  const lowUrl = url.toLowerCase();
  return PLAYER_DOMAINS.some((domain) => lowUrl.includes(domain));
}

function extractPlayerName(url: string): string {
  try {
    const hostname = new URL(url).hostname;
    const parts = hostname.split(".");
    if (parts.length >= 2) {
      return (
        parts[parts.length - 2].charAt(0).toUpperCase() +
        parts[parts.length - 2].slice(1)
      );
    }
    return hostname;
  } catch {
    return "Unknown";
  }
}

function extractQuality(text: string): string {
  const t = text.toUpperCase();
  if (t.includes("4K") || t.includes("2160")) return "4K";
  if (t.includes("1080")) return "1080p";
  if (t.includes("720")) return "720p";
  if (t.includes("CAM")) return "CAM";
  return "HD";
}

function extractLanguage(text: string): string {
  const t = text.toUpperCase();
  if (t.includes("VOSTFR")) return "VOSTFR";
  if (t.includes("VF")) return "VF";
  if (t.includes("VO")) return "VO";
  if (t.includes("MULTI")) return "MULTI";
  return "VF";
}
