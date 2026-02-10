import { NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { getDb } from "@/lib/db";

export async function GET() {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sql = getDb();

  const [sourcesCount] = await sql`SELECT COUNT(*) as count FROM sources`;
  const [contentCount] = await sql`SELECT COUNT(*) as count FROM scraped_content`;
  const [linksCount] = await sql`SELECT COUNT(*) as count FROM stream_links WHERE is_active = true`;
  const [moviesCount] = await sql`SELECT COUNT(DISTINCT tmdb_id) as count FROM scraped_content WHERE content_type = 'movie'`;
  const [seriesCount] = await sql`SELECT COUNT(DISTINCT tmdb_id) as count FROM scraped_content WHERE content_type IN ('series', 'anime')`;
  const recentLogs = await sql`
    SELECT sl.*, s.name as source_name
    FROM scrape_logs sl 
    JOIN sources s ON sl.source_id = s.id
    ORDER BY sl.started_at DESC LIMIT 5
  `;

  return NextResponse.json({
    sources: parseInt(sourcesCount.count),
    content: parseInt(contentCount.count),
    stream_links: parseInt(linksCount.count),
    movies: parseInt(moviesCount.count),
    series: parseInt(seriesCount.count),
    recent_logs: Array.from(recentLogs),
  });
}
