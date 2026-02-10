const TMDB_API_KEY = process.env.TMDB_API_KEY;
const TMDB_BASE = "https://api.themoviedb.org/3";

interface TmdbMovieDetails {
  id: number;
  title: string;
  original_title: string;
  release_date: string;
  poster_path: string | null;
}

interface TmdbSeriesDetails {
  id: number;
  name: string;
  original_name: string;
  first_air_date: string;
  poster_path: string | null;
  number_of_seasons: number;
  seasons: {
    season_number: number;
    episode_count: number;
    name: string;
  }[];
}

interface TmdbSeasonDetails {
  season_number: number;
  episodes: {
    episode_number: number;
    name: string;
  }[];
}

export async function getTmdbMovieTitle(tmdbId: number): Promise<string> {
  if (!TMDB_API_KEY) throw new Error("TMDB_API_KEY is not configured");
  const res = await fetch(
    `${TMDB_BASE}/movie/${tmdbId}?api_key=${TMDB_API_KEY}&language=fr-FR`,
    { signal: AbortSignal.timeout(10000) }
  );
  if (!res.ok) {
    // Fallback to English
    const resEn = await fetch(
      `${TMDB_BASE}/movie/${tmdbId}?api_key=${TMDB_API_KEY}&language=en-US`,
      { signal: AbortSignal.timeout(10000) }
    );
    if (!resEn.ok) throw new Error(`TMDB movie ${tmdbId} not found`);
    const data: TmdbMovieDetails = await resEn.json();
    return data.title || data.original_title;
  }
  const data: TmdbMovieDetails = await res.json();
  return data.title || data.original_title;
}

export async function getTmdbSeriesTitle(tmdbId: number): Promise<string> {
  if (!TMDB_API_KEY) throw new Error("TMDB_API_KEY is not configured");
  const res = await fetch(
    `${TMDB_BASE}/tv/${tmdbId}?api_key=${TMDB_API_KEY}&language=fr-FR`,
    { signal: AbortSignal.timeout(10000) }
  );
  if (!res.ok) {
    const resEn = await fetch(
      `${TMDB_BASE}/tv/${tmdbId}?api_key=${TMDB_API_KEY}&language=en-US`,
      { signal: AbortSignal.timeout(10000) }
    );
    if (!resEn.ok) throw new Error(`TMDB series ${tmdbId} not found`);
    const data: TmdbSeriesDetails = await resEn.json();
    return data.name || data.original_name;
  }
  const data: TmdbSeriesDetails = await res.json();
  return data.name || data.original_name;
}

export async function getTmdbSeriesDetails(
  tmdbId: number
): Promise<TmdbSeriesDetails> {
  if (!TMDB_API_KEY) throw new Error("TMDB_API_KEY is not configured");
  const res = await fetch(
    `${TMDB_BASE}/tv/${tmdbId}?api_key=${TMDB_API_KEY}&language=fr-FR`,
    { signal: AbortSignal.timeout(10000) }
  );
  if (!res.ok) {
    const resEn = await fetch(
      `${TMDB_BASE}/tv/${tmdbId}?api_key=${TMDB_API_KEY}&language=en-US`,
      { signal: AbortSignal.timeout(10000) }
    );
    if (!resEn.ok) throw new Error(`TMDB series ${tmdbId} not found`);
    return resEn.json();
  }
  return res.json();
}

export async function getTmdbSeasonDetails(
  tmdbId: number,
  seasonNumber: number
): Promise<TmdbSeasonDetails> {
  if (!TMDB_API_KEY) throw new Error("TMDB_API_KEY is not configured");
  const res = await fetch(
    `${TMDB_BASE}/tv/${tmdbId}/season/${seasonNumber}?api_key=${TMDB_API_KEY}&language=fr-FR`,
    { signal: AbortSignal.timeout(10000) }
  );
  if (!res.ok) {
    const resEn = await fetch(
      `${TMDB_BASE}/tv/${tmdbId}/season/${seasonNumber}?api_key=${TMDB_API_KEY}&language=en-US`,
      { signal: AbortSignal.timeout(10000) }
    );
    if (!resEn.ok)
      throw new Error(`TMDB season ${seasonNumber} for ${tmdbId} not found`);
    return resEn.json();
  }
  return res.json();
}

export async function getTmdbTitle(
  tmdbId: number,
  contentType: "movie" | "series" | "anime"
): Promise<string> {
  if (contentType === "movie") {
    return getTmdbMovieTitle(tmdbId);
  }
  return getTmdbSeriesTitle(tmdbId);
}
