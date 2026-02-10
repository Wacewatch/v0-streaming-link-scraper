-- Drop old tables if they exist
DROP TABLE IF EXISTS scrape_logs CASCADE;
DROP TABLE IF EXISTS players CASCADE;
DROP TABLE IF EXISTS scraped_content CASCADE;
DROP TABLE IF EXISTS sources CASCADE;

-- Sources: streaming sites to scrape from
CREATE TABLE sources (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  base_url TEXT NOT NULL,
  slug VARCHAR(50) UNIQUE NOT NULL,
  enabled BOOLEAN DEFAULT true,
  scraper_type VARCHAR(50) DEFAULT 'topstream',
  config JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Scraped content: a movie or series episode linked to a TMDB ID
CREATE TABLE scraped_content (
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

-- Stream links: actual m3u8/video stream URLs found for each content
CREATE TABLE stream_links (
  id SERIAL PRIMARY KEY,
  content_id INTEGER REFERENCES scraped_content(id) ON DELETE CASCADE,
  m3u8_url TEXT NOT NULL,
  quality VARCHAR(20) DEFAULT 'auto',
  language VARCHAR(20) DEFAULT 'VF',
  season INTEGER,
  episode INTEGER,
  host VARCHAR(200),
  headers JSONB DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  last_checked TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(content_id, m3u8_url, season, episode)
);

-- Scrape logs for monitoring
CREATE TABLE scrape_logs (
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
  '{"search_path": "/recherche/", "movie_path": "/film/", "series_path": "/serie/"}'
) ON CONFLICT (slug) DO NOTHING;

-- Indexes
CREATE INDEX idx_scraped_content_tmdb ON scraped_content(tmdb_id, content_type);
CREATE INDEX idx_stream_links_content ON stream_links(content_id);
CREATE INDEX idx_stream_links_season_episode ON stream_links(content_id, season, episode);
CREATE INDEX idx_stream_links_active ON stream_links(content_id, is_active);
CREATE INDEX idx_scrape_logs_source ON scrape_logs(source_id, started_at DESC);
