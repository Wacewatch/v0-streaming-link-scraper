export interface Source {
  id: number;
  name: string;
  base_url: string;
  slug: string;
  enabled: boolean;
  scraper_type: string;
  config: Record<string, string>;
  created_at: string;
  updated_at: string;
}

export interface ScrapedContent {
  id: number;
  tmdb_id: number;
  content_type: "movie" | "series" | "anime";
  title: string;
  source_id: number;
  source_url: string;
  created_at: string;
  updated_at: string;
}

export interface StreamLink {
  id: number;
  content_id: number;
  m3u8_url: string;
  quality: string;
  language: string;
  season: number | null;
  episode: number | null;
  host: string;
  headers: Record<string, string>;
  is_active: boolean;
  last_checked: string;
  created_at: string;
}

export interface ScrapeLog {
  id: number;
  source_id: number;
  status: "running" | "success" | "error";
  message: string;
  items_found: number;
  started_at: string;
  finished_at: string | null;
}

export interface ScrapeResult {
  title: string;
  source_url: string;
  links: {
    m3u8_url: string;
    quality?: string;
    language?: string;
    season?: number;
    episode?: number;
    host?: string;
    headers?: Record<string, string>;
  }[];
}

export interface ApiMovieResponse {
  tmdb_id: number;
  content_type: string;
  title: string;
  sources: {
    source_name: string;
    source_url: string;
    streams: {
      m3u8_url: string;
      quality: string;
      language: string;
      host: string;
    }[];
  }[];
}

export interface ApiSeriesResponse {
  tmdb_id: number;
  content_type: string;
  title: string;
  sources: {
    source_name: string;
    source_url: string;
    seasons: {
      season: number;
      episodes: {
        episode: number;
        streams: {
          m3u8_url: string;
          quality: string;
          language: string;
          host: string;
        }[];
      }[];
    }[];
  }[];
}
