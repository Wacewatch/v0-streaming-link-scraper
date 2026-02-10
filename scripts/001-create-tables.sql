-- Sources table: stores scraper site configurations
CREATE TABLE IF NOT EXISTS sources (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  base_url TEXT NOT NULL,
  slug VARCHAR(50) UNIQUE NOT NULL,
  enabled BOOLEAN DEFAULT true,
  scraper_type VARCHAR(50) DEFAULT 'generic',
  config JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Scraped content: links between TMDB IDs and streaming sources
CREATE TABLE IF NOT EXISTS scraped_content (
  id SERIAL PRIMARY KEY,
  tmdb_id INTEGER NOT NULL,
  content_type VARCHAR(20) NOT NULL CHECK (content_type IN ('movie', 'series', 'anime')),
  title VARCHAR(500),
  source_id INTEGER REFERENCES sources(id) ON DELETE CASCADE,
  source_url TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(tmdb_id, content_type, source_id)
);

-- Players/embeds found for each content
CREATE TABLE IF NOT EXISTS players (
  id SERIAL PRIMARY KEY,
  content_id INTEGER REFERENCES scraped_content(id) ON DELETE CASCADE,
  player_name VARCHAR(200),
  embed_url TEXT NOT NULL,
  quality VARCHAR(20),
  language VARCHAR(20),
  season INTEGER,
  episode INTEGER,
  player_type VARCHAR(50) DEFAULT 'iframe',
  is_active BOOLEAN DEFAULT true,
  last_checked TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Scrape logs for monitoring
CREATE TABLE IF NOT EXISTS scrape_logs (
  id SERIAL PRIMARY KEY,
  source_id INTEGER REFERENCES sources(id) ON DELETE CASCADE,
  status VARCHAR(20) NOT NULL CHECK (status IN ('running', 'success', 'error')),
  message TEXT,
  items_found INTEGER DEFAULT 0,
  started_at TIMESTAMP DEFAULT NOW(),
  finished_at TIMESTAMP
);

-- Insert default source
INSERT INTO sources (name, base_url, slug, enabled, scraper_type, config)
VALUES (
  'TopStream',
  'https://top-stream.space',
  'topstream',
  true,
  'topstream',
  '{"search_path": "/recherche/", "movie_path": "/film/", "series_path": "/serie/", "anime_path": "/anime/"}'
) ON CONFLICT (slug) DO NOTHING;

-- Create indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_scraped_content_tmdb ON scraped_content(tmdb_id, content_type);
CREATE INDEX IF NOT EXISTS idx_players_content ON players(content_id);
CREATE INDEX IF NOT EXISTS idx_players_season_episode ON players(content_id, season, episode);
CREATE INDEX IF NOT EXISTS idx_scrape_logs_source ON scrape_logs(source_id, started_at DESC);
