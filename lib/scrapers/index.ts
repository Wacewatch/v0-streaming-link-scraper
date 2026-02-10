import { getDb } from "@/lib/db";
import type { Source, ScrapeResult } from "@/lib/types";
import {
  scrapeTopStreamMovie,
  scrapeTopStreamSeries,
} from "./topstream";

export async function scrapeMovie(
  tmdbId: number,
  title: string
): Promise<{ source: Source; result: ScrapeResult }[]> {
  const sql = getDb();
  const sources = await sql`SELECT * FROM sources WHERE enabled = true`;
  const results: { source: Source; result: ScrapeResult }[] = [];

  for (const source of sources as Source[]) {
    let result: ScrapeResult | null = null;

    switch (source.scraper_type) {
      case "topstream":
        result = await scrapeTopStreamMovie(source.base_url, tmdbId, title);
        break;
      default:
        // Generic scraper can be added here for future sources
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
  title: string,
  season?: number,
  episode?: number
): Promise<{ source: Source; result: ScrapeResult }[]> {
  const sql = getDb();
  const sources = await sql`SELECT * FROM sources WHERE enabled = true`;
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
  title: string,
  contentType: "movie" | "series" | "anime",
  season?: number,
  episode?: number
) {
  const sql = getDb();

  const scrapeFn = contentType === "movie" ? scrapeMovie : scrapeSeries;
  const results =
    contentType === "movie"
      ? await scrapeFn(tmdbId, title)
      : await (scrapeFn as typeof scrapeSeries)(tmdbId, title, season, episode);

  for (const { source, result } of results) {
    // Upsert scraped content
    const contentRows = await sql`
      INSERT INTO scraped_content (tmdb_id, content_type, title, source_id, source_url)
      VALUES (${tmdbId}, ${contentType}, ${result.title}, ${source.id}, ${result.source_url})
      ON CONFLICT (tmdb_id, content_type, source_id)
      DO UPDATE SET title = ${result.title}, source_url = ${result.source_url}, updated_at = NOW()
      RETURNING id
    `;

    const contentId = contentRows[0].id;

    // Insert players
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

  return results;
}
