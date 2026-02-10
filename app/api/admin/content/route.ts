import { NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { getDb } from "@/lib/db";

export async function GET() {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sql = getDb();

  const content = await sql`
    SELECT 
      sc.*,
      s.name as source_name,
      (SELECT COUNT(*) FROM stream_links sl WHERE sl.content_id = sc.id AND sl.is_active = true) as link_count
    FROM scraped_content sc
    JOIN sources s ON sc.source_id = s.id
    ORDER BY sc.updated_at DESC
    LIMIT 100
  `;

  return NextResponse.json({ items: Array.from(content) });
}

export async function DELETE(request: Request) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const contentId = url.searchParams.get("id");

  if (!contentId) {
    return NextResponse.json({ error: "Content ID required" }, { status: 400 });
  }

  const sql = getDb();
  await sql`DELETE FROM scraped_content WHERE id = ${parseInt(contentId)}`;
  return NextResponse.json({ success: true });
}
