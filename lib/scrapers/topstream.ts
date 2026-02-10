import * as cheerio from "cheerio";
import type { ScrapeResult } from "@/lib/types";

// Slugify title for URL construction
function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // Remove accents
    .replace(/[^a-z0-9]+/g, "-") // Replace non-alphanumeric with dashes
    .replace(/^-+|-+$/g, ""); // Remove leading/trailing dashes
}

// Helper to fetch with retry
async function fetchWithRetry(url: string, retries = 3): Promise<string | null> {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7",
          "Accept-Encoding": "gzip, deflate, br",
          Connection: "keep-alive",
          "Upgrade-Insecure-Requests": "1",
        },
        signal: AbortSignal.timeout(20000),
      });
      
      if (res.ok) {
        return await res.text();
      }
    } catch (error) {
      console.log(`[v0] Fetch attempt ${i + 1} failed for ${url}`);
      if (i === retries - 1) throw error;
      await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
    }
  }
  return null;
}

export async function scrapeTopStreamMovie(
  baseUrl: string,
  tmdbId: number,
  title: string
): Promise<ScrapeResult | null> {
  console.log(`[v0] Starting scrape for movie TMDB ${tmdbId}: ${title}`);
  
  try {
    // Try to construct the URL directly from title
    const slug = slugify(title);
    const movieUrl = `${baseUrl}/movie/${slug}`;
    
    console.log(`[v0] Attempting movie URL: ${movieUrl}`);
    
    // Fetch the movie page
    const html = await fetchWithRetry(movieUrl);
    
    if (html) {
      const result = await extractPlayersFromPage(html, movieUrl, title);
      if (result && result.players.length > 0) {
        console.log(`[v0] Found ${result.players.length} players for movie ${title}`);
        return result;
      }
    }
    
    // Fallback to search
    console.log(`[v0] Direct URL failed, trying search...`);
    return await searchAndScrape(baseUrl, title, "movie");
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
  console.log(`[v0] Starting scrape for series TMDB ${tmdbId}: ${title} S${season}E${episode}`);
  
  try {
    // Try to construct the URL directly
    const slug = slugify(title);
    let targetUrl = `${baseUrl}/serie/${slug}`;
    
    if (season !== undefined) {
      targetUrl = `${baseUrl}/serie/${slug}/saison-${season}`;
      if (episode !== undefined) {
        targetUrl = `${baseUrl}/serie/${slug}/saison-${season}/episode-${episode}`;
      }
    }
    
    console.log(`[v0] Attempting series URL: ${targetUrl}`);
    
    // Fetch the series page
    const html = await fetchWithRetry(targetUrl);
    
    if (html) {
      const result = await extractPlayersFromPage(html, targetUrl, title, season, episode);
      if (result && result.players.length > 0) {
        console.log(`[v0] Found ${result.players.length} players for series ${title}`);
        return result;
      }
    }
    
    // Fallback to search
    console.log(`[v0] Direct URL failed, trying search...`);
    return await searchAndScrape(baseUrl, title, "series", season, episode);
  } catch (error) {
    console.error(`[TopStream] Error scraping series ${tmdbId}:`, error);
    return null;
  }
}

// Search and scrape helper
async function searchAndScrape(
  baseUrl: string,
  title: string,
  type: "movie" | "series" | "anime",
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

    let contentUrl: string | null = null;
    const selector = type === "movie" 
      ? "a[href*='/movie/'], a[href*='/film/']"
      : "a[href*='/serie/'], a[href*='/series/'], a[href*='/anime/']";
    
    $search(selector).each((_, el) => {
      const href = $search(el).attr("href");
      if (href && !contentUrl) {
        contentUrl = href.startsWith("http") ? href : `${baseUrl}${href}`;
      }
    });

    if (!contentUrl) return null;

    // Append season/episode to URL if needed
    if (season !== undefined && type !== "movie") {
      contentUrl = `${contentUrl}/saison-${season}`;
      if (episode !== undefined) {
        contentUrl = `${contentUrl}/episode-${episode}`;
      }
    }

    const html = await fetchWithRetry(contentUrl);
    if (html) {
      return await extractPlayersFromPage(html, contentUrl, title, season, episode);
    }
    return null;
  } catch (error) {
    console.error("[TopStream] Search failed:", error);
    return null;
  }
}

// Main extraction function - extracts all embed/player URLs from HTML
async function extractPlayersFromPage(
  html: string,
  sourceUrl: string,
  title: string,
  season?: number,
  episode?: number
): Promise<ScrapeResult | null> {
  try {
    console.log(`[v0] Extracting players from page...`);
    
    const $ = cheerio.load(html);
    const players: ScrapeResult["players"] = [];
    
    // Method 1: Look for /embed/ URLs in the HTML
    const embedRegex = /https?:\/\/[^"'\s]+\/embed\/\d+/gi;
    const embedMatches = html.match(embedRegex);
    
    if (embedMatches) {
      console.log(`[v0] Found ${embedMatches.length} /embed/ URLs in HTML`);
      for (const embedUrl of embedMatches) {
        if (!players.find(p => p.embed_url === embedUrl)) {
          console.log(`[v0] Processing embed URL: ${embedUrl}`);
          
          // Scrape the embed page to get actual player
          const embeddedPlayers = await scrapeEmbedPage(embedUrl);
          for (const player of embeddedPlayers) {
            if (!players.find(p => p.embed_url === player.embed_url)) {
              players.push({
                ...player,
                season,
                episode
              });
            }
          }
        }
      }
    }
    
    // Method 2: Extract direct iframes
    $("iframe").each((_, el) => {
      const src = $(el).attr("src") || $(el).attr("data-src");
      if (src && src.startsWith("http") && isPlayerUrl(src)) {
        if (!players.find(p => p.embed_url === src)) {
          console.log(`[v0] Found iframe: ${src}`);
          players.push({
            player_name: extractPlayerName(src),
            embed_url: src,
            quality: "HD",
            language: "VF",
            season,
            episode,
            player_type: "iframe",
          });
        }
      }
    });
    
    // Method 3: Extract from data attributes
    $("[data-url], [data-src], [data-link], [data-embed]").each((_, el) => {
      const url =
        $(el).attr("data-url") ||
        $(el).attr("data-src") ||
        $(el).attr("data-link") ||
        $(el).attr("data-embed");
      
      if (url && url.startsWith("http") && isPlayerUrl(url)) {
        if (!players.find(p => p.embed_url === url)) {
          console.log(`[v0] Found data attribute URL: ${url}`);
          players.push({
            player_name: $(el).text().trim() || extractPlayerName(url),
            embed_url: url,
            quality: extractQuality($(el).text()),
            language: extractLanguage($(el).text()),
            season,
            episode,
            player_type: "iframe",
          });
        }
      }
    });
    
    // Method 4: Extract from script tags
    $("script").each((_, el) => {
      const scriptContent = $(el).html();
      if (scriptContent) {
        // Look for player URLs in scripts
        const urlMatches = scriptContent.match(/https?:\/\/[^\s"'\\)]+/g);
        if (urlMatches) {
          for (const url of urlMatches) {
            if (isPlayerUrl(url) && !players.find(p => p.embed_url === url)) {
              console.log(`[v0] Found URL in script: ${url}`);
              players.push({
                player_name: extractPlayerName(url),
                embed_url: url,
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
    
    console.log(`[v0] Total players found: ${players.length}`);
    
    const pageTitle = $("h1").first().text().trim() || $("title").text().trim() || title;
    
    return {
      title: pageTitle,
      source_url: sourceUrl,
      players,
    };
  } catch (error) {
    console.error("[TopStream] Page extraction failed:", error);
    return null;
  }
}

// Scrape the /embed/ page to get actual player URLs
async function scrapeEmbedPage(embedUrl: string): Promise<Array<{player_name: string, embed_url: string, quality: string, language: string, player_type: string}>> {
  const players: Array<{player_name: string, embed_url: string, quality: string, language: string, player_type: string}> = [];
  
  try {
    console.log(`[v0] Scraping embed page: ${embedUrl}`);
    
    const res = await fetch(embedUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml",
        Referer: embedUrl.split("/embed/")[0],
      },
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) return players;

    const html = await res.text();
    const $ = cheerio.load(html);

    // Extract iframes
    $("iframe").each((_, el) => {
      const src = $(el).attr("src") || $(el).attr("data-src");
      if (src && src.startsWith("http") && isPlayerUrl(src)) {
        console.log(`[v0] Found player in embed: ${src}`);
        players.push({
          player_name: extractPlayerName(src),
          embed_url: src,
          quality: "HD",
          language: "VF",
          player_type: "iframe",
        });
      }
    });

    // Extract from script tags
    $("script").each((_, el) => {
      const scriptContent = $(el).html();
      if (scriptContent) {
        const embedMatches = scriptContent.match(
          /(?:src|url|file|source)\s*[:=]\s*['"](https?:\/\/[^'"]+)['"]/gi
        );
        if (embedMatches) {
          for (const match of embedMatches) {
            const urlMatch = match.match(/https?:\/\/[^'"]+/);
            if (
              urlMatch &&
              isPlayerUrl(urlMatch[0]) &&
              !players.find((p) => p.embed_url === urlMatch[0])
            ) {
              console.log(`[v0] Found player in script: ${urlMatch[0]}`);
              players.push({
                player_name: extractPlayerName(urlMatch[0]),
                embed_url: urlMatch[0],
                quality: "HD",
                language: "VF",
                player_type: "iframe",
              });
            }
          }
        }
      }
    });
  } catch (error) {
    console.error("[TopStream] Embed scrape failed:", error);
  }

  return players;
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
