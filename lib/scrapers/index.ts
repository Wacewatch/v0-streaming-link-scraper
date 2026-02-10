import { getDb } from "@/lib/db";
import { getTmdbTitle, getTmdbSeriesDetails, getTmdbSeasonDetails } from "@/lib/tmdb";
import type { Source, ScrapeResult } from "@/lib/types";
import {
  scrapeTopStreamMovie,
  scrapeTopStreamSeries,
  scrapeTopStreamListing,
} from "./topstream";

export async function scrapeMovie(
  tmdbId: number
): Promise<{ source: Source; result: ScrapeResult }[]> {
  const sql = getDb();
  const sources = await sql`SELECT * FROM sources WHERE enabled = true`;
  const title = await getTmdbTitle(tmdbId, "movie");
  const results: { source: Source; result: ScrapeResult }[] = [];

  for (const source of sources as Source[]) {
    let result: ScrapeResult | null = null;

    switch (source.scraper_type) {
      case "topstream":
        result = await scrapeTopStreamMovie(source.base_url, tmdbId, title);
        break;
      default:
        break;
    }

    if (result && result.players.length > 0) {
      results.push({ source, result });
    }
  }

  return results;
}

export async function scrapeSeries(
  tmdbId: number,
  season?: number,
  episode?: number
): Promise<{ source: Source; result: ScrapeResult }[]> {
  const sql = getDb();
  const sources = await sql`SELECT * FROM sources WHERE enabled = true`;
  const title = await getTmdbTitle(tmdbId, "series");
  const results: { source: Source; result: ScrapeResult }[] = [];

  for (const source of sources as Source[]) {
    let result: ScrapeResult | null = null;

    switch (source.scraper_type) {
      case "topstream":
        result = await scrapeTopStreamSeries(
          source.base_url,
          tmdbId,
          title,
          season,
          episode
        );
        break;
      default:
        break;
    }

    if (result && result.players.length > 0) {
      results.push({ source, result });
    }
  }

  return results;
}

export async function scrapeAndStore(
  tmdbId: number,
  contentType: "movie" | "series" | "anime",
  season?: number,
  episode?: number
) {
  const sql = getDb();
  const title = await getTmdbTitle(tmdbId, contentType);

  const results =
    contentType === "movie"
      ? await scrapeMovie(tmdbId)
      : await scrapeSeries(tmdbId, season, episode);

  for (const { source, result } of results) {
    const contentRows = await sql`
      INSERT INTO scraped_content (tmdb_id, content_type, title, source_id, source_url)
      VALUES (${tmdbId}, ${contentType}, ${title}, ${source.id}, ${result.source_url})
      ON CONFLICT (tmdb_id, content_type, source_id)
      DO UPDATE SET title = ${title}, source_url = ${result.source_url}, updated_at = NOW()
      RETURNING id
    `;

    const contentId = contentRows[0].id;

    for (const player of result.players) {
      await sql`
        INSERT INTO players (content_id, player_name, embed_url, quality, language, season, episode, player_type)
        VALUES (
          ${contentId},
          ${player.player_name},
          ${player.embed_url},
          ${player.quality || "HD"},
          ${player.language || "VF"},
          ${player.season || null},
          ${player.episode || null},
          ${player.player_type || "iframe"}
        )
        ON CONFLICT DO NOTHING
      `;
    }
  }

  return { title, results };
}

/** Bulk scrape all movies or series from a source's listing pages */
export async function bulkScrapeSource(
  sourceId: number,
  contentType: "movie" | "series" | "anime"
): Promise<{ total: number; success: number; failed: number; items: string[] }> {
  const sql = getDb();
  const sourceRows = await sql`SELECT * FROM sources WHERE id = ${sourceId} AND enabled = true`;
  if (sourceRows.length === 0) throw new Error("Source not found or disabled");

  const source = sourceRows[0] as Source;
  let listings: { title: string; url: string }[] = [];

  switch (source.scraper_type) {
    case "topstream":
      listings = await scrapeTopStreamListing(source.base_url, contentType);
      break;
    default:
      break;
  }

  const stats = { total: listings.length, success: 0, failed: 0, items: [] as string[] };

  for (const listing of listings) {
    try {
      // For each found content, try to scrape its page for players
      const res = await fetch(listing.url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
          Accept: "text/html,application/xhtml+xml",
          "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.8",
        },
        signal: AbortSignal.timeout(15000),
      });

      if (!res.ok) {
        stats.failed++;
        continue;
      }

      const html = await res.text();
      const cheerio = await import("cheerio");
      const $ = cheerio.load(html);

      // Extract players from the page
      const players: ScrapeResult["players"] = [];

      $("iframe").each((_, el) => {
        const src = $(el).attr("src") || $(el).attr("data-src");
        if (src && src.startsWith("http")) {
          players.push({
            player_name: extractPlayerNameFromUrl(src),
            embed_url: src,
            quality: "HD",
            language: "VF",
            player_type: "iframe",
          });
        }
      });

      $('[data-url], [data-src], [data-link], [data-embed]').each((_, el) => {
        const url =
          $(el).attr("data-url") ||
          $(el).attr("data-src") ||
          $(el).attr("data-link") ||
          $(el).attr("data-embed");
        if (url && url.startsWith("http") && !players.find((p) => p.embed_url === url)) {
          players.push({
            player_name: $(el).text().trim() || extractPlayerNameFromUrl(url),
            embed_url: url,
            quality: "HD",
            language: "VF",
            player_type: "iframe",
          });
        }
      });

      if (players.length > 0) {
        // Store without TMDB ID (we store 0 for bulk scrapes, users can link later)
        const contentRows = await sql`
          INSERT INTO scraped_content (tmdb_id, content_type, title, source_id, source_url)
          VALUES (0, ${contentType}, ${listing.title}, ${source.id}, ${listing.url})
          ON CONFLICT (tmdb_id, content_type, source_id)
          DO UPDATE SET title = ${listing.title}, source_url = ${listing.url}, updated_at = NOW()
          RETURNING id
        `;
        const contentId = contentRows[0].id;

        for (const player of players) {
          await sql`
            INSERT INTO players (content_id, player_name, embed_url, quality, language, season, episode, player_type)
            VALUES (${contentId}, ${player.player_name}, ${player.embed_url}, ${player.quality || "HD"}, ${player.language || "VF"}, ${player.season || null}, ${player.episode || null}, ${player.player_type || "iframe"})
            ON CONFLICT DO NOTHING
          `;
        }

        stats.success++;
        stats.items.push(`${listing.title} (${players.length} lecteurs)`);
      } else {
        stats.failed++;
      }
    } catch {
      stats.failed++;
    }
  }

  return stats;
}

/** Bulk scrape all seasons/episodes of a series */
export async function bulkScrapeSeriesEpisodes(
  tmdbId: number,
  contentType: "series" | "anime"
): Promise<{ title: string; seasons_scraped: number; episodes_scraped: number; players_found: number }> {
  const details = await getTmdbSeriesDetails(tmdbId);
  const title = details.name || details.original_name;

  let totalEpisodes = 0;
  let totalPlayers = 0;
  let seasonsScraped = 0;

  for (const season of details.seasons) {
    if (season.season_number === 0) continue; // Skip specials

    const seasonDetails = await getTmdbSeasonDetails(tmdbId, season.season_number);
    seasonsScraped++;

    for (const ep of seasonDetails.episodes) {
      try {
        const { results } = await scrapeAndStore(
          tmdbId,
          contentType,
          season.season_number,
          ep.episode_number
        );
        const playersCount = results.reduce((s, r) => s + r.result.players.length, 0);
        totalPlayers += playersCount;
        totalEpisodes++;
      } catch {
        // Continue with next episode
      }
      // Small delay to avoid rate limiting
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  return {
    title,
    seasons_scraped: seasonsScraped,
    episodes_scraped: totalEpisodes,
    players_found: totalPlayers,
  };
}

function extractPlayerNameFromUrl(url: string): string {
  try {
    const hostname = new URL(url).hostname;
    const parts = hostname.split(".");
    if (parts.length >= 2) {
      return parts[parts.length - 2].charAt(0).toUpperCase() + parts[parts.length - 2].slice(1);
    }
    return hostname;
  } catch {
    return "Unknown";
  }
}
