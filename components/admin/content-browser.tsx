"use client";

import useSWR from "swr";
import { Film, Tv, Trash2, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface ContentItem {
  id: number;
  tmdb_id: number;
  content_type: string;
  title: string;
  source_name: string;
  source_url: string;
  player_count: number;
  updated_at: string;
}

export function ContentBrowser() {
  const { data, mutate } = useSWR<{ items: ContentItem[] }>(
    "/api/admin/content",
    fetcher
  );
  const content = data?.items;

  async function handleDelete(id: number) {
    if (!confirm("Supprimer ce contenu et tous ses lecteurs ?")) return;
    await fetch(`/api/admin/content?id=${id}`, { method: "DELETE" });
    mutate();
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-foreground">
          Contenus scrapes ({content?.length ?? 0})
        </h2>
      </div>

      {content && content.length > 0 ? (
        <div className="flex flex-col gap-3">
          {content.map((item) => (
            <Card key={item.id} className="border-border bg-card">
              <CardContent className="flex items-center justify-between p-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
                    {item.content_type === "movie" ? (
                      <Film className="h-4 w-4 text-primary" />
                    ) : (
                      <Tv className="h-4 w-4 text-primary" />
                    )}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-card-foreground">
                      {item.title}
                    </p>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground font-mono">
                        TMDB: {item.tmdb_id}
                      </span>
                      <Badge variant="secondary" className="text-xs">
                        {item.content_type}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {item.source_name}
                      </span>
                      <Badge className="text-xs">
                        {item.player_count} lecteur(s)
                      </Badge>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <a
                    href={item.source_url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-foreground"
                    >
                      <ExternalLink className="h-4 w-4" />
                    </Button>
                  </a>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleDelete(item.id)}
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="text-center text-muted-foreground text-base font-normal">
              Aucun contenu scrape. Utilisez le panneau Scraping pour ajouter du
              contenu.
            </CardTitle>
          </CardHeader>
        </Card>
      )}
    </div>
  );
}
