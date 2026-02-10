import * as cheerio from "cheerio";
import puppeteer from "puppeteer";
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
    
    // Use Puppeteer to handle the unlock flow
    const result = await scrapeWithBrowser(movieUrl, title);
    
    if (result && result.players.length > 0) {
      console.log(`[v0] Found ${result.players.length} players for movie ${title}`);
      return result;
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
    
    const result = await scrapeWithBrowser(targetUrl, title, season, episode);
    
    if (result && result.players.length > 0) {
      console.log(`[v0] Found ${result.players.length} players for series ${title}`);
      return result;
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

    return await scrapeWithBrowser(contentUrl, title, season, episode);
  } catch (error) {
    console.error("[TopStream] Search failed:", error);
    return null;
  }
}

// Main browser automation function
async function scrapeWithBrowser(
  url: string,
  title: string,
  season?: number,
  episode?: number
): Promise<ScrapeResult | null> {
  let browser;
  
  try {
    console.log(`[v0] Launching browser for URL: ${url}`);
    
    browser = await puppeteer.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
      ],
    });

    const page = await browser.newPage();
    
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
    );
    
    await page.setViewport({ width: 1920, height: 1080 });

    console.log(`[v0] Navigating to ${url}`);
    await page.goto(url, { 
      waitUntil: "networkidle2", 
      timeout: 30000 
    });

    // Wait a bit for the page to load
    await page.waitForTimeout(2000);

    // Look for the "Continuer" button and click it multiple times to unlock
    let clickCount = 0;
    const maxClicks = 5;
    
    console.log(`[v0] Looking for unlock buttons...`);
    
    while (clickCount < maxClicks) {
      try {
        // Look for various button selectors that might be the unlock button
        const buttonSelectors = [
          'button:has-text("Continuer")',
          'button:has-text("Continue")',
          'a:has-text("Continuer")',
          'a:has-text("Continue")',
          '.unlock-button',
          '[class*="continue"]',
          '[class*="unlock"]',
        ];

        let buttonFound = false;
        
        for (const selector of buttonSelectors) {
          try {
            const button = await page.$(selector);
            if (button) {
              console.log(`[v0] Clicking unlock button (click ${clickCount + 1})`);
              await button.click();
              buttonFound = true;
              clickCount++;
              await page.waitForTimeout(1500); // Wait between clicks
              break;
            }
          } catch {
            continue;
          }
        }

        if (!buttonFound) break;
      } catch (e) {
        console.log(`[v0] No more unlock buttons found`);
        break;
      }
    }

    // Wait for the embed to appear
    await page.waitForTimeout(3000);

    // Extract embed URLs
    const players: ScrapeResult["players"] = [];

    // Method 1: Look for iframe with /embed/ URLs
    console.log(`[v0] Extracting iframes...`);
    const iframes = await page.$$eval("iframe", (frames) =>
      frames
        .map((f) => f.src || f.getAttribute("data-src"))
        .filter((src) => src && src.includes("/embed/"))
    );

    for (const src of iframes) {
      if (src && !players.find((p) => p.embed_url === src)) {
        console.log(`[v0] Found embed iframe: ${src}`);
        
        // If it's a /embed/ URL, scrape it to get the actual player
        if (src.includes("/embed/")) {
          const embeddedPlayers = await scrapeEmbedPage(src);
          players.push(...embeddedPlayers.map(p => ({
            ...p,
            season,
            episode
          })));
        } else {
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
    }

    // Method 2: Check for data attributes
    const dataUrls = await page.$$eval(
      "[data-url], [data-src], [data-link], [data-embed]",
      (elements) =>
        elements
          .map(
            (el) =>
              el.getAttribute("data-url") ||
              el.getAttribute("data-src") ||
              el.getAttribute("data-link") ||
              el.getAttribute("data-embed")
          )
          .filter((url) => url && url.startsWith("http"))
    );

    for (const url of dataUrls) {
      if (url && !players.find((p) => p.embed_url === url)) {
        console.log(`[v0] Found data-url: ${url}`);
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

    // Method 3: Parse page HTML for more players
    const html = await page.content();
    const additionalPlayers = extractPlayers(html, url, title, season, episode);
    
    for (const player of additionalPlayers.players) {
      if (!players.find(p => p.embed_url === player.embed_url)) {
        players.push(player);
      }
    }

    console.log(`[v0] Total players found: ${players.length}`);

    return {
      title: additionalPlayers.title || title,
      source_url: url,
      players,
    };
  } catch (error) {
    console.error("[TopStream] Browser scraping failed:", error);
    return null;
  } finally {
    if (browser) {
      await browser.close();
    }
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
