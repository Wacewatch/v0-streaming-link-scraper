import { NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { getDb } from "@/lib/db";

export async function GET() {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sql = getDb();
  const logs = await sql`
    SELECT sl.*, s.name as source_name
    FROM scrape_logs sl
    JOIN sources s ON sl.source_id = s.id
    ORDER BY sl.started_at DESC
    LIMIT 50
  `;

  return NextResponse.json({ logs: Array.from(logs) });
}
