import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { scrapeAndStore } from "@/lib/scrapers";
import { getTmdbSeriesTitle } from "@/lib/tmdb";

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
  const contentType =
    (url.searchParams.get("type") as "series" | "anime") || "series";

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
        let streamsQuery;
        if (season && episode) {
          streamsQuery = await sql`
            SELECT * FROM stream_links 
            WHERE content_id = ${content.id} AND is_active = true
            AND season = ${parseInt(season)} AND episode = ${parseInt(episode)}
            ORDER BY quality, host
          `;
        } else if (season) {
          streamsQuery = await sql`
            SELECT * FROM stream_links 
            WHERE content_id = ${content.id} AND is_active = true
            AND season = ${parseInt(season)}
            ORDER BY episode, quality, host
          `;
        } else {
          streamsQuery = await sql`
            SELECT * FROM stream_links 
            WHERE content_id = ${content.id} AND is_active = true
            ORDER BY season, episode, quality, host
          `;
        }

        const seasonsMap: Record<
          number,
          Record<number, typeof streamsQuery>
        > = {};
        for (const s of streamsQuery) {
          const sn = s.season || 1;
          const ep = s.episode || 1;
          if (!seasonsMap[sn]) seasonsMap[sn] = {};
          if (!seasonsMap[sn][ep]) seasonsMap[sn][ep] = [];
          seasonsMap[sn][ep].push(s);
        }

        const seasons = Object.entries(seasonsMap).map(([s, episodes]) => ({
          season: parseInt(s),
          episodes: Object.entries(episodes).map(([e, streams]) => ({
            episode: parseInt(e),
            streams: streams.map((st: Record<string, unknown>) => ({
              m3u8_url: st.m3u8_url,
              quality: st.quality,
              language: st.language,
              host: st.host,
              headers: st.headers,
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

    // Scrape live using TMDB title
    const { title, results } = await scrapeAndStore(
      tmdbId,
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
              streams: result.links.map((l) => ({
                m3u8_url: l.m3u8_url,
                quality: l.quality || "auto",
                language: l.language || "VF",
                host: l.host || "unknown",
                headers: l.headers || {},
              })),
            },
          ],
        },
      ],
    }));

    return NextResponse.json({
      tmdb_id: tmdbId,
      content_type: contentType,
      title: title || (await getTmdbSeriesTitle(tmdbId)),
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
