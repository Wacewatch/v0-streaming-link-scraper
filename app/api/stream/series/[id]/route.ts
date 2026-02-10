import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { scrapeAndStore } from "@/lib/scrapers";

export async function GET(
  request: Request,
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

  const url = new URL(request.url);
  const season = url.searchParams.get("season");
  const episode = url.searchParams.get("episode");
  const title = url.searchParams.get("title") || `${tmdbId}`;
  const contentType = (url.searchParams.get("type") as "series" | "anime") || "series";

  try {
    const sql = getDb();

    // Check for cached data
    const existing = await sql`
      SELECT sc.*, s.name as source_name 
      FROM scraped_content sc 
      JOIN sources s ON sc.source_id = s.id
      WHERE sc.tmdb_id = ${tmdbId} AND sc.content_type IN ('series', 'anime')
    `;

    if (existing.length > 0) {
      const sources = [];
      for (const content of existing) {
        let playersQuery;
        if (season && episode) {
          playersQuery = await sql`
            SELECT * FROM players 
            WHERE content_id = ${content.id} AND is_active = true
            AND season = ${parseInt(season)} AND episode = ${parseInt(episode)}
            ORDER BY player_name
          `;
        } else if (season) {
          playersQuery = await sql`
            SELECT * FROM players 
            WHERE content_id = ${content.id} AND is_active = true
            AND season = ${parseInt(season)}
            ORDER BY episode, player_name
          `;
        } else {
          playersQuery = await sql`
            SELECT * FROM players 
            WHERE content_id = ${content.id} AND is_active = true
            ORDER BY season, episode, player_name
          `;
        }

        // Group players by season/episode
        const seasonsMap: Record<number, Record<number, typeof playersQuery>> = {};
        for (const p of playersQuery) {
          const s = p.season || 1;
          const e = p.episode || 1;
          if (!seasonsMap[s]) seasonsMap[s] = {};
          if (!seasonsMap[s][e]) seasonsMap[s][e] = [];
          seasonsMap[s][e].push(p);
        }

        const seasons = Object.entries(seasonsMap).map(([s, episodes]) => ({
          season: parseInt(s),
          episodes: Object.entries(episodes).map(([e, players]) => ({
            episode: parseInt(e),
            players: players.map((p: Record<string, string>) => ({
              name: p.player_name,
              embed_url: p.embed_url,
              quality: p.quality,
              language: p.language,
              type: p.player_type,
            })),
          })),
        }));

        sources.push({
          source_name: content.source_name,
          source_url: content.source_url,
          seasons,
        });
      }

      return NextResponse.json({
        tmdb_id: tmdbId,
        content_type: contentType,
        title: existing[0].title,
        sources,
        cached: true,
      });
    }

    // Scrape live
    const results = await scrapeAndStore(
      tmdbId,
      title,
      contentType,
      season ? parseInt(season) : undefined,
      episode ? parseInt(episode) : undefined
    );

    const sources = results.map(({ source, result }) => ({
      source_name: source.name,
      source_url: result.source_url,
      seasons: [
        {
          season: season ? parseInt(season) : 1,
          episodes: [
            {
              episode: episode ? parseInt(episode) : 1,
              players: result.players.map((p) => ({
                name: p.player_name,
                embed_url: p.embed_url,
                quality: p.quality || "HD",
                language: p.language || "VF",
                type: p.player_type || "iframe",
              })),
            },
          ],
        },
      ],
    }));

    return NextResponse.json({
      tmdb_id: tmdbId,
      content_type: contentType,
      title: results[0]?.result.title || title,
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
