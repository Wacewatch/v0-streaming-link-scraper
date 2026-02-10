import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL);

console.log("[v0] Starting players table migration...");

// 1. Widen embed_url to TEXT to support full m3u8 URLs
await sql`ALTER TABLE players ALTER COLUMN embed_url TYPE TEXT`;
console.log("[v0] Widened embed_url column to TEXT");

// 2. Delete all existing players that contain TMDB image URLs or other non-video content
const deleted = await sql`
  DELETE FROM players
  WHERE embed_url LIKE '%image.tmdb.org%'
     OR embed_url LIKE '%tmdb.org/t/p/%'
     OR embed_url LIKE '%themoviedb.org%'
     OR embed_url LIKE '%.png%'
     OR embed_url LIKE '%.jpg%'
     OR embed_url LIKE '%.jpeg%'
     OR embed_url LIKE '%.gif%'
     OR embed_url LIKE '%.svg%'
     OR embed_url LIKE '%.webp%'
     OR embed_url LIKE '%.ico%'
`;
console.log("[v0] Deleted non-video player rows:", deleted.length ?? "done");

// 3. Update player_type default to 'embed'
await sql`ALTER TABLE players ALTER COLUMN player_type SET DEFAULT 'embed'`;
console.log("[v0] Updated player_type default to 'embed'");

console.log("[v0] Migration complete!");
