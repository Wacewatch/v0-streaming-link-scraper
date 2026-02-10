import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { scrapeAndStore } from "@/lib/scrapers";
import { getTmdbMovieTitle } from "@/lib/tmdb";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const tmdbId = parseInt(id, 10);

  if (isNaN(tmdbId)) {
    return NextResponse.json(
      { error: "Invalid TMDB ID. Must be a number." },
      { status: 400 }
    );
  }

  try {
    const sql = getDb();

    // Check if we have cached data
    const existing = await sql`
      SELECT sc.*, s.name as source_name 
      FROM scraped_content sc 
      JOIN sources s ON sc.source_id = s.id
      WHERE sc.tmdb_id = ${tmdbId} AND sc.content_type = 'movie'
    `;

    if (existing.length > 0) {
      const sources = [];
      for (const content of existing) {
        const players = await sql`
          SELECT * FROM players 
          WHERE content_id = ${content.id} AND is_active = true
          ORDER BY player_name
        `;
        sources.push({
          source_name: content.source_name,
          source_url: content.source_url,
          players: players.map((p) => ({
            name: p.player_name,
            embed_url: p.embed_url,
            quality: p.quality,
            language: p.language,
            type: p.player_type,
          })),
        });
      }

      return NextResponse.json({
        tmdb_id: tmdbId,
        content_type: "movie",
        title: existing[0].title,
        sources,
        cached: true,
      });
    }

    // Scrape live using TMDB title
    const { title, results } = await scrapeAndStore(tmdbId, "movie");

    const sources = results.map(({ source, result }) => ({
      source_name: source.name,
      source_url: result.source_url,
      players: result.players.map((p) => ({
        name: p.player_name,
        embed_url: p.embed_url,
        quality: p.quality || "HD",
        language: p.language || "VF",
        type: p.player_type || "iframe",
      })),
    }));

    return NextResponse.json({
      tmdb_id: tmdbId,
      content_type: "movie",
      title: title || (await getTmdbMovieTitle(tmdbId)),
      sources,
      cached: false,
    });
  } catch (error) {
    console.error("API Error:", error);
    return NextResponse.json(
      { error: "Failed to fetch stream data" },
      { status: 500 }
    );
  }
}
