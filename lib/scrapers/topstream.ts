import * as cheerio from "cheerio";
import type { ScrapeResult } from "@/lib/types";

export async function scrapeTopStreamMovie(
  baseUrl: string,
  tmdbId: number,
  title: string
): Promise<ScrapeResult | null> {
  try {
    // TopStream uses slug-based URLs, search by TMDB ID or title
    const searchUrl = `${baseUrl}/recherche/${encodeURIComponent(title)}`;

    const searchRes = await fetch(searchUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.8",
      },
      signal: AbortSignal.timeout(15000),
    });

    if (!searchRes.ok) return null;

    const searchHtml = await searchRes.text();
    const $search = cheerio.load(searchHtml);

    // Find the movie link from search results
    let movieUrl: string | null = null;
    $search("a[href*='/film/'], a[href*='/movie/']").each((_, el) => {
      const href = $search(el).attr("href");
      if (href && !movieUrl) {
        movieUrl = href.startsWith("http") ? href : `${baseUrl}${href}`;
      }
    });

    // Also try direct TMDB-based URL patterns
    if (!movieUrl) {
      // Try common patterns
      const directUrls = [
        `${baseUrl}/film/${tmdbId}`,
        `${baseUrl}/movie/${tmdbId}`,
      ];
      for (const url of directUrls) {
        try {
          const res = await fetch(url, {
            headers: {
              "User-Agent":
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            },
            redirect: "follow",
            signal: AbortSignal.timeout(10000),
          });
          if (res.ok) {
            movieUrl = url;
            break;
          }
        } catch {
          continue;
        }
      }
    }

    if (!movieUrl) return null;

    // Fetch the movie page
    const movieRes = await fetch(movieUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.8",
      },
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
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.8",
      },
      signal: AbortSignal.timeout(15000),
    });

    if (!searchRes.ok) return null;

    const searchHtml = await searchRes.text();
    const $search = cheerio.load(searchHtml);

    let seriesUrl: string | null = null;
    $search(
      "a[href*='/serie/'], a[href*='/series/'], a[href*='/anime/']"
    ).each((_, el) => {
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
            headers: {
              "User-Agent":
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            },
            redirect: "follow",
            signal: AbortSignal.timeout(10000),
          });
          if (res.ok) {
            seriesUrl = url;
            break;
          }
        } catch {
          continue;
        }
      }
    }

    if (!seriesUrl) return null;

    // If specific season/episode requested, try to build the URL
    let targetUrl = seriesUrl;
    if (season !== undefined) {
      targetUrl = `${seriesUrl}/saison-${season}`;
      if (episode !== undefined) {
        targetUrl = `${seriesUrl}/saison-${season}/episode-${episode}`;
      }
    }

    const pageRes = await fetch(targetUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.8",
      },
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

function extractPlayers(
  html: string,
  sourceUrl: string,
  title: string,
  season?: number,
  episode?: number
): ScrapeResult {
  const $ = cheerio.load(html);
  const players: ScrapeResult["players"] = [];

  // Extract iframe sources (most common player embed method)
  $("iframe").each((_, el) => {
    const src = $(el).attr("src") || $(el).attr("data-src");
    if (src && src.startsWith("http")) {
      const playerName = extractPlayerName(src);
      players.push({
        player_name: playerName,
        embed_url: src,
        quality: "HD",
        language: "VF",
        season,
        episode,
        player_type: "iframe",
      });
    }
  });

  // Extract from player buttons/tabs (sites often have multiple player options)
  $(
    '[data-url], [data-src], [data-link], [data-embed], .player-btn, .player-tab, [onclick*="http"]'
  ).each((_, el) => {
    const url =
      $(el).attr("data-url") ||
      $(el).attr("data-src") ||
      $(el).attr("data-link") ||
      $(el).attr("data-embed");

    if (url && url.startsWith("http")) {
      const name =
        $(el).text().trim() || $(el).attr("title") || extractPlayerName(url);
      if (!players.find((p) => p.embed_url === url)) {
        players.push({
          player_name: name,
          embed_url: url,
          quality: extractQuality($(el).text()),
          language: extractLanguage($(el).text()),
          season,
          episode,
          player_type: "iframe",
        });
      }
    }

    // Check onclick attributes
    const onclick = $(el).attr("onclick");
    if (onclick) {
      const urlMatch = onclick.match(
        /https?:\/\/[^\s'"\\)]+/
      );
      if (urlMatch && !players.find((p) => p.embed_url === urlMatch[0])) {
        players.push({
          player_name: $(el).text().trim() || extractPlayerName(urlMatch[0]),
          embed_url: urlMatch[0],
          quality: "HD",
          language: "VF",
          season,
          episode,
          player_type: "iframe",
        });
      }
    }
  });

  // Extract from script tags (some sites inject players via JS)
  $("script").each((_, el) => {
    const scriptContent = $(el).html();
    if (scriptContent) {
      const embedMatches = scriptContent.match(
        /(?:src|url|link|embed)\s*[:=]\s*['"](https?:\/\/[^'"]+)['"]/gi
      );
      if (embedMatches) {
        for (const match of embedMatches) {
          const urlMatch = match.match(/https?:\/\/[^'"]+/);
          if (
            urlMatch &&
            isPlayerUrl(urlMatch[0]) &&
            !players.find((p) => p.embed_url === urlMatch[0])
          ) {
            players.push({
              player_name: extractPlayerName(urlMatch[0]),
              embed_url: urlMatch[0],
              quality: "HD",
              language: "VF",
              season,
              episode,
              player_type: "iframe",
            });
          }
        }
      }
    }
  });

  // Extract the actual page title
  const pageTitle = $("h1").first().text().trim() || $("title").text().trim() || title;

  return {
    title: pageTitle,
    source_url: sourceUrl,
    players,
  };
}

function extractPlayerName(url: string): string {
  try {
    const hostname = new URL(url).hostname;
    const parts = hostname.split(".");
    // Get the main domain name (e.g., "doodstream" from "doodstream.com")
    if (parts.length >= 2) {
      return parts[parts.length - 2].charAt(0).toUpperCase() + parts[parts.length - 2].slice(1);
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

function isPlayerUrl(url: string): boolean {
  const playerDomains = [
    "doodstream",
    "dood",
    "streamtape",
    "mixdrop",
    "upstream",
    "vidoza",
    "voe",
    "filemoon",
    "streamvid",
    "vido",
    "uqload",
    "netu",
    "waaw",
    "wishonly",
    "myvi",
    "sibnet",
    "sendvid",
    "vidmoly",
    "vidcloud",
    "embedrise",
    "guccihide",
    "listeamed",
    "ahvsh",
    "playerx",
    "darkibox",
  ];
  const lowUrl = url.toLowerCase();
  return playerDomains.some((domain) => lowUrl.includes(domain));
}
