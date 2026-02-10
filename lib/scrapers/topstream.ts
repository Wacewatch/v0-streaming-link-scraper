import * as cheerio from "cheerio";
import type { ScrapeResult } from "@/lib/types";

const DEFAULT_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.8",
};

/**
 * Scrape a movie page for m3u8 stream links
 */
export async function scrapeTopStreamMovie(
  baseUrl: string,
  tmdbId: number,
  title: string
): Promise<ScrapeResult | null> {
  try {
    // Step 1: Search for the movie
    const movieUrl = await findContentUrl(baseUrl, title, tmdbId, "movie");
    if (!movieUrl) return null;

    // Step 2: Fetch movie page
    const movieHtml = await fetchPage(movieUrl);
    if (!movieHtml) return null;

    // Step 3: Extract m3u8 links from the page and its embedded players
    const links = await extractM3u8Links(movieHtml, movieUrl, baseUrl);

    const pageTitle = extractPageTitle(movieHtml) || title;

    return {
      title: pageTitle,
      source_url: movieUrl,
      links: links.map((l) => ({
        m3u8_url: l.url,
        quality: l.quality,
        language: l.language,
        host: l.host,
        headers: l.headers,
      })),
    };
  } catch (error) {
    console.error(`[TopStream] Error scraping movie ${tmdbId}:`, error);
    return null;
  }
}

/**
 * Scrape a series episode page for m3u8 stream links
 */
export async function scrapeTopStreamSeries(
  baseUrl: string,
  tmdbId: number,
  title: string,
  season?: number,
  episode?: number
): Promise<ScrapeResult | null> {
  try {
    // Step 1: Search for the series
    const seriesUrl = await findContentUrl(baseUrl, title, tmdbId, "series");
    if (!seriesUrl) return null;

    // Step 2: Build episode-specific URL
    let targetUrl = seriesUrl;
    if (season !== undefined) {
      targetUrl = `${seriesUrl}/saison-${season}`;
      if (episode !== undefined) {
        targetUrl = `${seriesUrl}/saison-${season}/episode-${episode}`;
      }
    }

    // Step 3: Fetch the page
    const pageHtml = await fetchPage(targetUrl);
    if (!pageHtml) return null;

    // Step 4: Extract m3u8 links
    const links = await extractM3u8Links(pageHtml, targetUrl, baseUrl);

    const pageTitle = extractPageTitle(pageHtml) || title;

    return {
      title: pageTitle,
      source_url: targetUrl,
      links: links.map((l) => ({
        m3u8_url: l.url,
        quality: l.quality,
        language: l.language,
        host: l.host,
        headers: l.headers,
        season,
        episode,
      })),
    };
  } catch (error) {
    console.error(`[TopStream] Error scraping series ${tmdbId}:`, error);
    return null;
  }
}

/**
 * Scrape the listing page of a source to get all content links
 */
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

        const html = await fetchPage(listUrl);
        if (!html) break;

        const $ = cheerio.load(html);
        let foundItems = false;

        $("a").each((_, el) => {
          const href = $(el).attr("href");
          const text =
            $(el).attr("title") ||
            $(el).find("h2, h3, .title, .name").first().text().trim() ||
            $(el).text().trim();

          if (!href || !text) return;

          const fullUrl = href.startsWith("http")
            ? href
            : `${baseUrl}${href}`;

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
    } catch {
      continue;
    }
  }

  return results;
}

// ─── Internal helpers ────────────────────────────────────────────────────────

interface ExtractedLink {
  url: string;
  quality: string;
  language: string;
  host: string;
  headers: Record<string, string>;
}

/**
 * The core extraction logic: given a page HTML, find all m3u8 URLs.
 * 1. Scan page HTML directly for .m3u8 references
 * 2. Find iframe/embed URLs and follow them to extract m3u8
 * 3. Scan script tags for m3u8 URLs or API endpoints that return them
 */
async function extractM3u8Links(
  html: string,
  pageUrl: string,
  baseUrl: string
): Promise<ExtractedLink[]> {
  const links: ExtractedLink[] = [];
  const seen = new Set<string>();

  const $ = cheerio.load(html);

  // ── Pass 1: Direct m3u8 URLs in the HTML source ─────────────────────────
  const m3u8Regex = /https?:\/\/[^\s"'<>\\]+\.m3u8[^\s"'<>\\]*/gi;
  const directMatches = html.match(m3u8Regex);
  if (directMatches) {
    for (const url of directMatches) {
      const clean = cleanUrl(url);
      if (clean && !seen.has(clean)) {
        seen.add(clean);
        links.push({
          url: clean,
          quality: guessQuality(clean),
          language: "VF",
          host: extractHost(clean),
          headers: {},
        });
      }
    }
  }

  // ── Pass 2: Follow iframe/embed sources to find m3u8 ───────────────────
  const embedUrls: string[] = [];

  // Collect iframe sources
  $("iframe").each((_, el) => {
    const src = $(el).attr("src") || $(el).attr("data-src") || $(el).attr("data-lazy-src");
    if (src && src.startsWith("http")) {
      embedUrls.push(src);
    }
  });

  // Collect data-attribute URLs (player buttons, tabs, etc.)
  $(
    "[data-url], [data-src], [data-link], [data-embed], [data-player]"
  ).each((_, el) => {
    const url =
      $(el).attr("data-url") ||
      $(el).attr("data-src") ||
      $(el).attr("data-link") ||
      $(el).attr("data-embed") ||
      $(el).attr("data-player");
    if (url && url.startsWith("http")) {
      embedUrls.push(url);
    }
  });

  // Extract URLs from onclick handlers
  $("[onclick]").each((_, el) => {
    const onclick = $(el).attr("onclick") || "";
    const urlMatch = onclick.match(/https?:\/\/[^\s'"\\)]+/);
    if (urlMatch) {
      embedUrls.push(urlMatch[0]);
    }
  });

  // Extract URLs from script tags (API calls, player config, etc.)
  $("script").each((_, el) => {
    const scriptContent = $(el).html();
    if (!scriptContent) return;

    // Look for embed/player URLs in JS code
    const urlMatches = scriptContent.match(
      /(?:src|url|link|embed|file|source|stream|video)\s*[:=]\s*['"](https?:\/\/[^'"]+)['"]/gi
    );
    if (urlMatches) {
      for (const match of urlMatches) {
        const extracted = match.match(/https?:\/\/[^'"]+/);
        if (extracted) {
          // If it's directly an m3u8 URL, add it
          if (extracted[0].includes(".m3u8")) {
            const clean = cleanUrl(extracted[0]);
            if (clean && !seen.has(clean)) {
              seen.add(clean);
              links.push({
                url: clean,
                quality: guessQuality(clean),
                language: "VF",
                host: extractHost(clean),
                headers: {},
              });
            }
          } else if (isPlayerUrl(extracted[0])) {
            embedUrls.push(extracted[0]);
          }
        }
      }
    }
  });

  // ── Pass 3: Follow each embed URL and extract m3u8 from response ───────
  const uniqueEmbeds = [...new Set(embedUrls)];
  for (const embedUrl of uniqueEmbeds.slice(0, 10)) {
    // Limit to 10
    try {
      const embedLinks = await extractM3u8FromEmbed(embedUrl, pageUrl);
      for (const link of embedLinks) {
        if (!seen.has(link.url)) {
          seen.add(link.url);
          links.push(link);
        }
      }
    } catch {
      // Continue with next embed
    }
  }

  return links;
}

/**
 * Follow an embed/player URL, fetch its page, and extract m3u8 URLs from it.
 * Handles common player patterns (JWPlayer, Video.js, Plyr, custom players).
 */
async function extractM3u8FromEmbed(
  embedUrl: string,
  referer: string
): Promise<ExtractedLink[]> {
  const links: ExtractedLink[] = [];

  try {
    const res = await fetch(embedUrl, {
      headers: {
        ...DEFAULT_HEADERS,
        Referer: referer,
      },
      redirect: "follow",
      signal: AbortSignal.timeout(12000),
    });

    if (!res.ok) return links;

    const contentType = res.headers.get("content-type") || "";

    // If the response is directly an m3u8 playlist
    if (
      contentType.includes("mpegurl") ||
      contentType.includes("m3u8") ||
      embedUrl.includes(".m3u8")
    ) {
      links.push({
        url: embedUrl,
        quality: guessQuality(embedUrl),
        language: "VF",
        host: extractHost(embedUrl),
        headers: { Referer: referer },
      });
      return links;
    }

    // If JSON response (some APIs return m3u8 in JSON)
    if (contentType.includes("json")) {
      const text = await res.text();
      const m3u8Matches = text.match(
        /https?:\/\/[^\s"'<>\\]+\.m3u8[^\s"'<>\\]*/gi
      );
      if (m3u8Matches) {
        for (const url of m3u8Matches) {
          const clean = cleanUrl(url);
          if (clean) {
            links.push({
              url: clean,
              quality: guessQuality(clean),
              language: "VF",
              host: extractHost(clean),
              headers: { Referer: embedUrl },
            });
          }
        }
      }
      return links;
    }

    // HTML response: parse and look for m3u8
    const html = await res.text();

    // Direct m3u8 URLs in the embed page
    const m3u8Regex = /https?:\/\/[^\s"'<>\\]+\.m3u8[^\s"'<>\\]*/gi;
    const matches = html.match(m3u8Regex);
    if (matches) {
      for (const url of matches) {
        const clean = cleanUrl(url);
        if (clean) {
          links.push({
            url: clean,
            quality: guessQuality(clean),
            language: "VF",
            host: extractHost(clean),
            headers: { Referer: embedUrl },
          });
        }
      }
    }

    // Look for packed/obfuscated JS that might contain m3u8
    const packedRegex =
      /eval\(function\(p,a,c,k,e,[dr]\).*?\{.*?\}\(.*?\)\)/gs;
    const packedMatches = html.match(packedRegex);
    if (packedMatches) {
      for (const packed of packedMatches) {
        // Try to find m3u8 in the packed code arguments
        const argsMatch = packed.match(
          /https?:\/\/[^\s"'<>\\|]+\.m3u8[^\s"'<>\\|]*/gi
        );
        if (argsMatch) {
          for (const url of argsMatch) {
            const clean = cleanUrl(url);
            if (clean) {
              links.push({
                url: clean,
                quality: guessQuality(clean),
                language: "VF",
                host: extractHost(clean),
                headers: { Referer: embedUrl },
              });
            }
          }
        }
      }
    }

    // Look for API endpoints that might return m3u8 (e.g., /api/source, /ajax/embed)
    const $ = cheerio.load(html);
    const apiPatterns = [
      /(?:api|ajax|source|embed)[^\s"']*\?[^\s"']*/gi,
      /\/(?:get|load|fetch)[_-]?(?:source|stream|video|link)[^\s"']*/gi,
    ];

    $("script").each((_, el) => {
      const scriptContent = $(el).html();
      if (!scriptContent) return;

      for (const pattern of apiPatterns) {
        const apiMatches = scriptContent.match(pattern);
        if (apiMatches) {
          for (const apiPath of apiMatches) {
            // Construct full URL for relative paths
            if (apiPath.startsWith("/")) {
              try {
                const base = new URL(embedUrl);
                const fullApiUrl = `${base.origin}${apiPath}`;
                // We'd need to fetch this too, but to avoid too many requests
                // just note the pattern for now
                console.log(
                  `[TopStream] Found potential API endpoint: ${fullApiUrl}`
                );
              } catch {
                // ignore
              }
            }
          }
        }
      }
    });
  } catch {
    // Timeout or network error
  }

  return links;
}

/** Search the source for a content URL matching the title */
async function findContentUrl(
  baseUrl: string,
  title: string,
  tmdbId: number,
  type: "movie" | "series"
): Promise<string | null> {
  // Try search first
  try {
    const searchUrl = `${baseUrl}/recherche/${encodeURIComponent(title)}`;
    const html = await fetchPage(searchUrl);
    if (html) {
      const $ = cheerio.load(html);
      const selectors =
        type === "movie"
          ? "a[href*='/film/'], a[href*='/movie/']"
          : "a[href*='/serie/'], a[href*='/series/'], a[href*='/anime/']";

      let foundUrl: string | null = null;
      $(selectors).each((_, el) => {
        const href = $(el).attr("href");
        if (href && !foundUrl) {
          foundUrl = href.startsWith("http") ? href : `${baseUrl}${href}`;
        }
      });
      if (foundUrl) return foundUrl;
    }
  } catch {
    // Continue to direct URL attempts
  }

  // Try direct URLs by TMDB ID
  const pathOptions =
    type === "movie"
      ? [`/film/${tmdbId}`, `/movie/${tmdbId}`]
      : [`/serie/${tmdbId}`, `/series/${tmdbId}`, `/anime/${tmdbId}`];

  for (const path of pathOptions) {
    try {
      const url = `${baseUrl}${path}`;
      const res = await fetch(url, {
        headers: DEFAULT_HEADERS,
        redirect: "follow",
        signal: AbortSignal.timeout(10000),
      });
      if (res.ok) return url;
    } catch {
      continue;
    }
  }

  return null;
}

/** Fetch a page and return its HTML text */
async function fetchPage(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: DEFAULT_HEADERS,
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return null;
    return res.text();
  } catch {
    return null;
  }
}

/** Clean a raw m3u8 URL (remove trailing garbage) */
function cleanUrl(url: string): string | null {
  try {
    // Remove trailing quotes, parentheses, backslashes, etc.
    let cleaned = url.replace(/['"\\);}\]>]+$/, "");
    // Validate it's a real URL
    new URL(cleaned);
    return cleaned;
  } catch {
    return null;
  }
}

/** Extract page title from HTML */
function extractPageTitle(html: string): string | null {
  const $ = cheerio.load(html);
  return (
    $("h1").first().text().trim() || $("title").text().trim() || null
  );
}

/** Guess video quality from URL */
function guessQuality(url: string): string {
  const lower = url.toLowerCase();
  if (lower.includes("4k") || lower.includes("2160")) return "4K";
  if (lower.includes("1080")) return "1080p";
  if (lower.includes("720")) return "720p";
  if (lower.includes("480")) return "480p";
  if (lower.includes("360")) return "360p";
  return "auto";
}

/** Extract hostname from URL */
function extractHost(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "unknown";
  }
}

/** Check if a URL looks like a known streaming player */
function isPlayerUrl(url: string): boolean {
  const playerDomains = [
    "doodstream", "dood", "streamtape", "mixdrop", "upstream",
    "vidoza", "voe", "filemoon", "streamvid", "vido", "uqload",
    "netu", "waaw", "wishonly", "myvi", "sibnet", "sendvid",
    "vidmoly", "vidcloud", "embedrise", "guccihide", "listeamed",
    "ahvsh", "playerx", "darkibox", "vidsrc", "vidguard",
    "streamsb", "supervideo", "mp4upload", "evoload", "febbox",
  ];
  const lowUrl = url.toLowerCase();
  return playerDomains.some((domain) => lowUrl.includes(domain));
}
