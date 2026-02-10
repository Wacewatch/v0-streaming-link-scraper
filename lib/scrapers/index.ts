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

    if (result && result.links.length > 0) {
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

    if (result && result.links.length > 0) {
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
    // Upsert scraped_content
    const contentRows = await sql`
      INSERT INTO scraped_content (tmdb_id, content_type, title, source_id, source_url)
      VALUES (${tmdbId}, ${contentType}, ${title}, ${source.id}, ${result.source_url})
      ON CONFLICT (tmdb_id, content_type, source_id)
      DO UPDATE SET title = ${title}, source_url = ${result.source_url}, updated_at = NOW()
      RETURNING id
    `;

    const contentId = contentRows[0].id;

    // Insert each m3u8 stream link
    for (const link of result.links) {
      await sql`
        INSERT INTO stream_links (content_id, m3u8_url, quality, language, season, episode, host, headers)
        VALUES (
          ${contentId},
          ${link.m3u8_url},
          ${link.quality || "auto"},
          ${link.language || "VF"},
          ${link.season || null},
          ${link.episode || null},
          ${link.host || "unknown"},
          ${JSON.stringify(link.headers || {})}
        )
        ON CONFLICT (content_id, m3u8_url, season, episode) DO UPDATE SET
          quality = EXCLUDED.quality,
          language = EXCLUDED.language,
          host = EXCLUDED.host,
          headers = EXCLUDED.headers,
          is_active = true,
          last_checked = NOW()
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

      // Look for m3u8 URLs directly in the page
      const m3u8Regex = /https?:\/\/[^\s"'<>\\]+\.m3u8[^\s"'<>\\]*/gi;
      const m3u8Matches = html.match(m3u8Regex) || [];
      const uniqueM3u8 = [...new Set(m3u8Matches)];

      if (uniqueM3u8.length > 0) {
        // Store without TMDB ID (0 = unmatched, users can link later)
        const contentRows = await sql`
          INSERT INTO scraped_content (tmdb_id, content_type, title, source_id, source_url)
          VALUES (0, ${contentType}, ${listing.title}, ${source.id}, ${listing.url})
          ON CONFLICT (tmdb_id, content_type, source_id)
          DO UPDATE SET title = ${listing.title}, source_url = ${listing.url}, updated_at = NOW()
          RETURNING id
        `;
        const contentId = contentRows[0].id;

        for (const m3u8Url of uniqueM3u8) {
          const cleanUrl = m3u8Url.replace(/['"\\);}\]>]+$/, "");
          try {
            new URL(cleanUrl);
            await sql`
              INSERT INTO stream_links (content_id, m3u8_url, quality, language, host)
              VALUES (${contentId}, ${cleanUrl}, 'auto', 'VF', ${new URL(cleanUrl).hostname})
              ON CONFLICT (content_id, m3u8_url, season, episode) DO NOTHING
            `;
          } catch {
            continue;
          }
        }

        stats.success++;
        stats.items.push(`${listing.title} (${uniqueM3u8.length} lien(s) m3u8)`);
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
): Promise<{ title: string; seasons_scraped: number; episodes_scraped: number; links_found: number }> {
  const details = await getTmdbSeriesDetails(tmdbId);
  const title = details.name || details.original_name;

  let totalEpisodes = 0;
  let totalLinks = 0;
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
        const linksCount = results.reduce((s, r) => s + r.result.links.length, 0);
        totalLinks += linksCount;
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
    links_found: totalLinks,
  };
}
