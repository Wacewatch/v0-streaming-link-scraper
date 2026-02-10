"use client";

import { useState } from "react";
import { Search, Loader2, CheckCircle, XCircle } from "lucide-react";
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

interface ScrapeResultData {
  success: boolean;
  sources_scraped: number;
  players_found: number;
  results: { source: string; title: string; players: number }[];
}

export function ScrapePanel() {
  const [tmdbId, setTmdbId] = useState("");
  const [title, setTitle] = useState("");
  const [contentType, setContentType] = useState<string>("movie");
  const [season, setSeason] = useState("");
  const [episode, setEpisode] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ScrapeResultData | null>(null);
  const [error, setError] = useState("");

  async function handleScrape() {
    if (!tmdbId || !title) return;
    setLoading(true);
    setResult(null);
    setError("");

    try {
      const body: Record<string, unknown> = {
        tmdb_id: parseInt(tmdbId),
        title,
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

  return (
    <div className="flex flex-col gap-6">
      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-card-foreground">
            <Search className="h-5 w-5 text-primary" />
            Lancer un scraping
          </CardTitle>
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
                <Label className="text-muted-foreground">Titre</Label>
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Fight Club"
                  className="border-border bg-secondary text-foreground"
                />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
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
              {contentType !== "movie" && (
                <>
                  <div className="flex flex-col gap-2">
                    <Label className="text-muted-foreground">Saison</Label>
                    <Input
                      value={season}
                      onChange={(e) => setSeason(e.target.value)}
                      placeholder="1"
                      type="number"
                      className="border-border bg-secondary text-foreground"
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label className="text-muted-foreground">Episode</Label>
                    <Input
                      value={episode}
                      onChange={(e) => setEpisode(e.target.value)}
                      placeholder="1"
                      type="number"
                      className="border-border bg-secondary text-foreground"
                    />
                  </div>
                </>
              )}
            </div>
            <Button
              onClick={handleScrape}
              disabled={loading || !tmdbId || !title}
              className="w-full md:w-auto md:self-end"
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Scraping en cours...
                </>
              ) : (
                <>
                  <Search className="mr-2 h-4 w-4" />
                  Lancer le scraping
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {error && (
        <Card className="border-destructive/50 bg-destructive/10">
          <CardContent className="flex items-center gap-3 p-4">
            <XCircle className="h-5 w-5 text-destructive" />
            <span className="text-sm text-destructive">{error}</span>
          </CardContent>
        </Card>
      )}

      {result && (
        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-card-foreground">
              <CheckCircle className="h-5 w-5 text-chart-2" />
              Resultats
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex gap-4">
              <Badge variant="secondary" className="text-sm">
                {result.sources_scraped} source(s)
              </Badge>
              <Badge variant="secondary" className="text-sm">
                {result.players_found} lecteur(s)
              </Badge>
            </div>
            {result.results.map((r, i) => (
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
          </CardContent>
        </Card>
      )}
    </div>
  );
}
