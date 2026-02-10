"use client";

import { useState } from "react";
import useSWR from "swr";
import {
  Search,
  Loader2,
  CheckCircle,
  XCircle,
  Film,
  Tv,
  Sparkles,
  Database,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface ScrapeResultData {
  success: boolean;
  title?: string;
  sources_scraped?: number;
  players_found?: number;
  results?: { source: string; title: string; players: number }[];
  // Bulk source
  total?: number;
  success_count?: number;
  failed?: number;
  items?: string[];
  // Bulk series
  seasons_scraped?: number;
  episodes_scraped?: number;
}

interface Source {
  id: number;
  name: string;
  base_url: string;
  enabled: boolean;
}

export function ScrapePanel() {
  const { data: sourcesData } = useSWR<{ sources: Source[] }>(
    "/api/admin/sources",
    fetcher
  );
  const sources = sourcesData?.sources?.filter((s) => s.enabled) || [];

  const [tmdbId, setTmdbId] = useState("");
  const [contentType, setContentType] = useState<string>("movie");
  const [season, setSeason] = useState("");
  const [episode, setEpisode] = useState("");
  const [loading, setLoading] = useState(false);
  const [bulkLoading, setBulkLoading] = useState<string | null>(null);
  const [result, setResult] = useState<ScrapeResultData | null>(null);
  const [error, setError] = useState("");

  async function handleScrape() {
    if (!tmdbId) return;
    setLoading(true);
    setResult(null);
    setError("");

    try {
      const body: Record<string, unknown> = {
        tmdb_id: parseInt(tmdbId),
        content_type: contentType,
      };
      if (season) body.season = parseInt(season);
      if (episode) body.episode = parseInt(episode);

      const res = await fetch("/api/admin/scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (res.ok) {
        setResult(data);
      } else {
        setError(data.error || "Echec du scraping");
      }
    } catch {
      setError("Erreur de connexion");
    } finally {
      setLoading(false);
    }
  }

  async function handleBulkSource(sourceId: number, type: string) {
    setBulkLoading(`source-${sourceId}-${type}`);
    setResult(null);
    setError("");

    try {
      const res = await fetch("/api/admin/scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "bulk_source",
          source_id: sourceId,
          content_type: type,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        setResult({
          success: true,
          total: data.total,
          success_count: data.success,
          failed: data.failed,
          items: data.items,
        });
      } else {
        setError(data.error || "Echec du bulk scraping");
      }
    } catch {
      setError("Erreur de connexion");
    } finally {
      setBulkLoading(null);
    }
  }

  async function handleBulkSeries() {
    if (!tmdbId) return;
    setBulkLoading("series-all");
    setResult(null);
    setError("");

    try {
      const res = await fetch("/api/admin/scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "bulk_series",
          tmdb_id: parseInt(tmdbId),
          content_type: contentType === "movie" ? "series" : contentType,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        setResult({
          success: true,
          title: data.title,
          seasons_scraped: data.seasons_scraped,
          episodes_scraped: data.episodes_scraped,
          players_found: data.players_found,
        });
      } else {
        setError(data.error || "Echec du bulk scraping");
      }
    } catch {
      setError("Erreur de connexion");
    } finally {
      setBulkLoading(null);
    }
  }

  const isBulkLoading = bulkLoading !== null;

  return (
    <div className="flex flex-col gap-6">
      {/* Single scrape by TMDB ID */}
      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-card-foreground">
            <Search className="h-5 w-5 text-primary" />
            Scraper par TMDB ID
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Le titre est automatiquement recupere depuis TMDB
          </p>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="flex flex-col gap-2">
                <Label className="text-muted-foreground">TMDB ID</Label>
                <Input
                  value={tmdbId}
                  onChange={(e) => setTmdbId(e.target.value)}
                  placeholder="550"
                  type="number"
                  className="border-border bg-secondary text-foreground"
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label className="text-muted-foreground">Type</Label>
                <Select value={contentType} onValueChange={setContentType}>
                  <SelectTrigger className="border-border bg-secondary text-foreground">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="border-border bg-card text-card-foreground">
                    <SelectItem value="movie">Film</SelectItem>
                    <SelectItem value="series">Serie</SelectItem>
                    <SelectItem value="anime">Anime</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            {contentType !== "movie" && (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="flex flex-col gap-2">
                  <Label className="text-muted-foreground">
                    Saison (optionnel)
                  </Label>
                  <Input
                    value={season}
                    onChange={(e) => setSeason(e.target.value)}
                    placeholder="1"
                    type="number"
                    className="border-border bg-secondary text-foreground"
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label className="text-muted-foreground">
                    Episode (optionnel)
                  </Label>
                  <Input
                    value={episode}
                    onChange={(e) => setEpisode(e.target.value)}
                    placeholder="1"
                    type="number"
                    className="border-border bg-secondary text-foreground"
                  />
                </div>
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={handleScrape}
                disabled={loading || isBulkLoading || !tmdbId}
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Scraping en cours...
                  </>
                ) : (
                  <>
                    <Search className="mr-2 h-4 w-4" />
                    Scraper
                  </>
                )}
              </Button>
              {contentType !== "movie" && tmdbId && (
                <Button
                  variant="secondary"
                  onClick={handleBulkSeries}
                  disabled={loading || isBulkLoading || !tmdbId}
                >
                  {bulkLoading === "series-all" ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Scraping toutes les saisons...
                    </>
                  ) : (
                    <>
                      <Tv className="mr-2 h-4 w-4" />
                      Scraper toutes les saisons/episodes
                    </>
                  )}
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Bulk scrape from source */}
      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-card-foreground">
            <Database className="h-5 w-5 text-primary" />
            Scraping en masse par source
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Scraper tous les contenus listés sur une source
          </p>
        </CardHeader>
        <CardContent>
          {sources.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Aucune source active
            </p>
          ) : (
            <div className="flex flex-col gap-4">
              {sources.map((source) => (
                <div
                  key={source.id}
                  className="flex flex-col gap-3 rounded-lg border border-border bg-secondary/30 p-4"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-foreground">
                      {source.name}
                    </span>
                    <span className="font-mono text-xs text-muted-foreground">
                      {source.base_url}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => handleBulkSource(source.id, "movie")}
                      disabled={loading || isBulkLoading}
                    >
                      {bulkLoading === `source-${source.id}-movie` ? (
                        <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Film className="mr-1.5 h-3.5 w-3.5" />
                      )}
                      Tous les films
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => handleBulkSource(source.id, "series")}
                      disabled={loading || isBulkLoading}
                    >
                      {bulkLoading === `source-${source.id}-series` ? (
                        <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Tv className="mr-1.5 h-3.5 w-3.5" />
                      )}
                      Toutes les series
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => handleBulkSource(source.id, "anime")}
                      disabled={loading || isBulkLoading}
                    >
                      {bulkLoading === `source-${source.id}-anime` ? (
                        <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                      )}
                      Tous les animes
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Error display */}
      {error && (
        <Card className="border-destructive/50 bg-destructive/10">
          <CardContent className="flex items-center gap-3 p-4">
            <XCircle className="h-5 w-5 shrink-0 text-destructive" />
            <span className="text-sm text-destructive">{error}</span>
          </CardContent>
        </Card>
      )}

      {/* Results display */}
      {result && (
        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-card-foreground">
              <CheckCircle className="h-5 w-5 text-chart-2" />
              Resultats
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {/* Single scrape result */}
            {result.title && (
              <p className="text-sm font-medium text-foreground">
                Titre TMDB : {result.title}
              </p>
            )}

            <div className="flex flex-wrap gap-2">
              {result.sources_scraped !== undefined && (
                <Badge variant="secondary">{result.sources_scraped} source(s)</Badge>
              )}
              {result.players_found !== undefined && (
                <Badge variant="secondary">{result.players_found} lecteur(s)</Badge>
              )}
              {result.total !== undefined && (
                <Badge variant="secondary">{result.total} contenu(s) trouves</Badge>
              )}
              {result.success_count !== undefined && (
                <Badge className="bg-chart-2/20 text-chart-2 border-chart-2/30">
                  {result.success_count} reussi(s)
                </Badge>
              )}
              {result.failed !== undefined && result.failed > 0 && (
                <Badge variant="destructive">{result.failed} echoue(s)</Badge>
              )}
              {result.seasons_scraped !== undefined && (
                <Badge variant="secondary">{result.seasons_scraped} saison(s)</Badge>
              )}
              {result.episodes_scraped !== undefined && (
                <Badge variant="secondary">{result.episodes_scraped} episode(s)</Badge>
              )}
            </div>

            {/* Single results list */}
            {result.results?.map((r, i) => (
              <div
                key={i}
                className="flex items-center justify-between rounded-lg border border-border bg-secondary/50 p-3"
              >
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {r.source}
                  </p>
                  <p className="text-xs text-muted-foreground">{r.title}</p>
                </div>
                <Badge>{r.players} lecteur(s)</Badge>
              </div>
            ))}

            {/* Bulk items list */}
            {result.items && result.items.length > 0 && (
              <div className="flex max-h-60 flex-col gap-1 overflow-y-auto rounded-lg border border-border bg-secondary/30 p-3">
                {result.items.map((item, i) => (
                  <p key={i} className="text-xs text-muted-foreground">
                    {item}
                  </p>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
