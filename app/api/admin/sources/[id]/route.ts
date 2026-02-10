import { NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { getDb } from "@/lib/db";

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const sourceId = parseInt(id, 10);

  try {
    const body = await request.json();
    const sql = getDb();

    const result = await sql`
      UPDATE sources SET
        name = COALESCE(${body.name || null}, name),
        base_url = COALESCE(${body.base_url || null}, base_url),
        slug = COALESCE(${body.slug || null}, slug),
        enabled = COALESCE(${body.enabled !== undefined ? body.enabled : null}, enabled),
        scraper_type = COALESCE(${body.scraper_type || null}, scraper_type),
        config = COALESCE(${body.config ? JSON.stringify(body.config) : null}::jsonb, config),
        updated_at = NOW()
      WHERE id = ${sourceId}
      RETURNING *
    `;

    if (result.length === 0) {
      return NextResponse.json(
        { error: "Source not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(result[0]);
  } catch (error) {
    console.error("Update source error:", error);
    return NextResponse.json(
      { error: "Failed to update source" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const sourceId = parseInt(id, 10);

  try {
    const sql = getDb();
    await sql`DELETE FROM sources WHERE id = ${sourceId}`;
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete source error:", error);
    return NextResponse.json(
      { error: "Failed to delete source" },
      { status: 500 }
    );
  }
}
