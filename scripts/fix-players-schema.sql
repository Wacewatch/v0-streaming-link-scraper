-- Fix the players table to properly support m3u8 and embed URLs
-- The embed_url column was too narrow (varchar(20) truncated URLs)
-- and contained TMDB image URLs instead of actual video links

-- 1. Widen embed_url to TEXT to support full m3u8 URLs
ALTER TABLE players ALTER COLUMN embed_url TYPE TEXT;

-- 2. Delete all existing players that contain TMDB image URLs or other non-video content
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
   OR embed_url LIKE '%.ico%';

-- 3. Update player_type default to be more descriptive
ALTER TABLE players ALTER COLUMN player_type SET DEFAULT 'embed';
