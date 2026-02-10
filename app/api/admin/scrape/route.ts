import { NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { scrapeAndStore, bulkScrapeSource, bulkScrapeSeriesEpisodes } from "@/lib/scrapers";
import { getTmdbTitle } from "@/lib/tmdb";

export async function POST(request: Request) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { action } = body;

    const sql = getDb();

    // Bulk scrape a source listing
    if (action === "bulk_source") {
      const { source_id, content_type } = body;
      if (!source_id || !content_type) {
        return NextResponse.json(
          { error: "source_id and content_type are required" },
          { status: 400 }
        );
      }

      await sql`
        INSERT INTO scrape_logs (source_id, status, message)
        VALUES (${source_id}, 'running', ${`Bulk scraping ${content_type} from source ${source_id}`})
      `;

      const stats = await bulkScrapeSource(source_id, content_type);

      await sql`
        UPDATE scrape_logs SET 
          status = 'success', 
          items_found = ${stats.success},
          finished_at = NOW(),
          message = ${`Bulk scrape: ${stats.success}/${stats.total} reussis, ${stats.failed} echoues`}
        WHERE source_id = ${source_id} AND status = 'running'
        AND id = (SELECT MAX(id) FROM scrape_logs WHERE source_id = ${source_id} AND status = 'running')
      `;

      return NextResponse.json({
        success: true,
        action: "bulk_source",
        ...stats,
      });
    }

    // Bulk scrape all episodes of a series
    if (action === "bulk_series") {
      const { tmdb_id, content_type } = body;
      if (!tmdb_id) {
        return NextResponse.json(
          { error: "tmdb_id is required" },
          { status: 400 }
        );
      }

      const sources = await sql`SELECT * FROM sources WHERE enabled = true LIMIT 1`;
      const sourceId = sources.length > 0 ? sources[0].id : null;

      if (sourceId) {
        await sql`
          INSERT INTO scrape_logs (source_id, status, message)
          VALUES (${sourceId}, 'running', ${`Bulk scraping all episodes for TMDB ${tmdb_id}`})
        `;
      }

      const stats = await bulkScrapeSeriesEpisodes(tmdb_id, content_type || "series");

      if (sourceId) {
        await sql`
          UPDATE scrape_logs SET 
            status = 'success', 
            items_found = ${stats.players_found},
            finished_at = NOW(),
            message = ${`${stats.title}: ${stats.seasons_scraped} saisons, ${stats.episodes_scraped} episodes, ${stats.players_found} lecteurs`}
          WHERE source_id = ${sourceId} AND status = 'running'
          AND id = (SELECT MAX(id) FROM scrape_logs WHERE source_id = ${sourceId} AND status = 'running')
        `;
      }

      return NextResponse.json({
        success: true,
        action: "bulk_series",
        ...stats,
      });
    }

    // Single scrape by TMDB ID only
    const { tmdb_id, content_type, season, episode } = body;

    if (!tmdb_id || !content_type) {
      return NextResponse.json(
        { error: "tmdb_id and content_type are required" },
        { status: 400 }
      );
    }

    const title = await getTmdbTitle(tmdb_id, content_type);

    const sources = await sql`SELECT * FROM sources WHERE enabled = true LIMIT 1`;
    const sourceId = sources.length > 0 ? sources[0].id : null;

    if (sourceId) {
      await sql`
        INSERT INTO scrape_logs (source_id, status, message)
        VALUES (${sourceId}, 'running', ${`Scraping ${content_type}: ${title} (TMDB: ${tmdb_id})`})
      `;
    }

    const { results } = await scrapeAndStore(
      tmdb_id,
      content_type,
      season,
      episode
    );

    const totalPlayers = results.reduce(
      (sum, r) => sum + r.result.players.length,
      0
    );

    if (sourceId) {
      await sql`
        UPDATE scrape_logs SET 
          status = 'success', 
          items_found = ${totalPlayers},
          finished_at = NOW(),
          message = ${`Found ${totalPlayers} players from ${results.length} sources for "${title}"`}
        WHERE source_id = ${sourceId} AND status = 'running'
        AND id = (SELECT MAX(id) FROM scrape_logs WHERE source_id = ${sourceId} AND status = 'running')
      `;
    }

    return NextResponse.json({
      success: true,
      title,
      sources_scraped: results.length,
      players_found: totalPlayers,
      results: results.map(({ source, result }) => ({
        source: source.name,
        title: result.title,
        players: result.players.length,
      })),
    });
  } catch (error) {
    console.error("Scrape error:", error);
    return NextResponse.json(
      { error: "Scraping failed", details: String(error) },
      { status: 500 }
    );
  }
}
