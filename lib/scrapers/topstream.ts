import * as cheerio from "cheerio";
import type { ScrapeResult } from "@/lib/types";

export async function scrapeTopStreamMovie(
  baseUrl: string,
  tmdbId: number,
  title: string
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
      // Try paginated listing
      for (let page = 1; page <= 10; page++) {
        const listUrl =
          page === 1 ? `${baseUrl}${path}` : `${baseUrl}${path}/page/${page}`;

        const res = await fetch(listUrl, {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
            Accept: "text/html,application/xhtml+xml",
            "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.8",
          },
          signal: AbortSignal.timeout(15000),
        });

        if (!res.ok) break;

        const html = await res.text();
        const $ = cheerio.load(html);

        let foundItems = false;
        // Look for content links
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

          // Only capture links that look like content detail pages
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

        // Stop paginating if no items found on this page
        if (!foundItems) break;
      }

      // If we found results with this path, stop trying other paths
      if (results.length > 0) break;
    } catch {
      continue;
    }
  }

  return results;
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

  // Extract iframe sources
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

  // Extract from player buttons/tabs
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

    const onclick = $(el).attr("onclick");
    if (onclick) {
      const urlMatch = onclick.match(/https?:\/\/[^\s'"\\)]+/);
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

  // Extract from script tags
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

  const pageTitle =
    $("h1").first().text().trim() || $("title").text().trim() || title;

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

function isPlayerUrl(url: string): boolean {
  const playerDomains = [
    "doodstream", "dood", "streamtape", "mixdrop", "upstream",
    "vidoza", "voe", "filemoon", "streamvid", "vido", "uqload",
    "netu", "waaw", "wishonly", "myvi", "sibnet", "sendvid",
    "vidmoly", "vidcloud", "embedrise", "guccihide", "listeamed",
    "ahvsh", "playerx", "darkibox",
  ];
  const lowUrl = url.toLowerCase();
  return playerDomains.some((domain) => lowUrl.includes(domain));
}
