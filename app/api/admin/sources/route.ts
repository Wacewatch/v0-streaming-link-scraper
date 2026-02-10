import { NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { getDb } from "@/lib/db";

export async function GET() {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sql = getDb();
  const sources = await sql`SELECT * FROM sources ORDER BY created_at DESC`;
  return NextResponse.json(sources);
}

export async function POST(request: Request) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { name, base_url, slug, scraper_type, config } =
      await request.json();

    if (!name || !base_url || !slug) {
      return NextResponse.json(
        { error: "Name, base_url, and slug are required" },
        { status: 400 }
      );
    }

    const sql = getDb();
    const result = await sql`
      INSERT INTO sources (name, base_url, slug, scraper_type, config)
      VALUES (${name}, ${base_url}, ${slug}, ${scraper_type || "generic"}, ${JSON.stringify(config || {})})
      RETURNING *
    `;

    return NextResponse.json(result[0], { status: 201 });
  } catch (error) {
    console.error("Create source error:", error);
    return NextResponse.json(
      { error: "Failed to create source" },
      { status: 500 }
    );
  }
}
