import { NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { scrapeAndStore } from "@/lib/scrapers";

export async function POST(request: Request) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { tmdb_id, title, content_type, season, episode } =
      await request.json();

    if (!tmdb_id || !title || !content_type) {
      return NextResponse.json(
        { error: "tmdb_id, title, and content_type are required" },
        { status: 400 }
      );
    }

    const sql = getDb();

    // Create log entry
    const sources = await sql`SELECT * FROM sources WHERE enabled = true LIMIT 1`;
    const sourceId = sources.length > 0 ? sources[0].id : null;

    if (sourceId) {
      await sql`
        INSERT INTO scrape_logs (source_id, status, message)
        VALUES (${sourceId}, 'running', ${`Scraping ${content_type}: ${title} (TMDB: ${tmdb_id})`})
      `;
    }

    const results = await scrapeAndStore(
      tmdb_id,
      title,
      content_type,
      season,
      episode
    );

    const totalPlayers = results.reduce(
      (sum, r) => sum + r.result.players.length,
      0
    );

    // Update log
    if (sourceId) {
      await sql`
        UPDATE scrape_logs SET 
          status = 'success', 
          items_found = ${totalPlayers},
          finished_at = NOW(),
          message = ${`Found ${totalPlayers} players from ${results.length} sources`}
        WHERE source_id = ${sourceId} AND status = 'running'
        AND id = (SELECT MAX(id) FROM scrape_logs WHERE source_id = ${sourceId} AND status = 'running')
      `;
    }

    return NextResponse.json({
      success: true,
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
