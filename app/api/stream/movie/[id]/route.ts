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
        const streams = await sql`
          SELECT * FROM stream_links 
          WHERE content_id = ${content.id} AND is_active = true
          ORDER BY quality, host
        `;
        sources.push({
          source_name: content.source_name,
          source_url: content.source_url,
          streams: streams.map((s) => ({
            m3u8_url: s.m3u8_url,
            quality: s.quality,
            language: s.language,
            host: s.host,
            headers: s.headers,
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
      streams: result.links.map((l) => ({
        m3u8_url: l.m3u8_url,
        quality: l.quality || "auto",
        language: l.language || "VF",
        host: l.host || "unknown",
        headers: l.headers || {},
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
