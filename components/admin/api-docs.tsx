"use client";

import { Copy, Check } from "lucide-react";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

function CodeBlock({ code, label }: { code: string; label: string }) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">{label}</span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          {copied ? (
            <Check className="h-3.5 w-3.5" />
          ) : (
            <Copy className="h-3.5 w-3.5" />
          )}
          {copied ? "Copie !" : "Copier"}
        </button>
      </div>
      <pre className="overflow-x-auto rounded-lg border border-border bg-secondary p-3 font-mono text-sm text-foreground">
        <code>{code}</code>
      </pre>
    </div>
  );
}

export function ApiDocs() {
  const baseUrl = typeof window !== "undefined" ? window.location.origin : "";

  const endpoints = [
    {
      method: "GET",
      path: "/api/stream/movie/{TMDB_ID}",
      description:
        "Recupere tous les lecteurs disponibles pour un film. Le titre est automatiquement recupere depuis TMDB.",
      params: [],
      example: `${baseUrl}/api/stream/movie/550`,
      response: `{
  "tmdb_id": 550,
  "content_type": "movie",
  "title": "Fight Club",
  "sources": [
    {
      "source_name": "TopStream",
      "source_url": "https://top-stream.space/film/fight-club/",
      "players": [
        {
          "name": "Doodstream",
          "embed_url": "https://doodstream.com/e/...",
          "quality": "HD",
          "language": "VF",
          "type": "iframe"
        }
      ]
    }
  ],
  "cached": false
}`,
    },
    {
      method: "GET",
      path: "/api/stream/series/{TMDB_ID}",
      description:
        "Recupere les lecteurs pour une serie/anime. Le titre est automatiquement recupere depuis TMDB. Filtrage optionnel par saison et episode.",
      params: [
        { name: "season", type: "query", desc: "Numero de saison (optionnel)" },
        {
          name: "episode",
          type: "query",
          desc: "Numero d'episode (optionnel)",
        },
        {
          name: "type",
          type: "query",
          desc: '"series" ou "anime" (defaut: series)',
        },
      ],
      example: `${baseUrl}/api/stream/series/1396?season=1&episode=1`,
      response: `{
  "tmdb_id": 1396,
  "content_type": "series",
  "title": "Breaking Bad",
  "sources": [
    {
      "source_name": "TopStream",
      "source_url": "https://top-stream.space/serie/breaking-bad/...",
      "seasons": [
        {
          "season": 1,
          "episodes": [
            {
              "episode": 1,
              "players": [
                {
                  "name": "Doodstream",
                  "embed_url": "https://...",
                  "quality": "HD",
                  "language": "VF",
                  "type": "iframe"
                }
              ]
            }
          ]
        }
      ]
    }
  ],
  "cached": false
}`,
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-lg font-semibold text-foreground">
          Documentation API
        </h2>
        <p className="text-sm text-muted-foreground">
          Endpoints publics -- seul le TMDB ID est necessaire, le titre est
          automatiquement recupere
        </p>
      </div>

      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="p-4">
          <p className="text-sm text-foreground">
            Aucun parametre{" "}
            <code className="rounded bg-secondary px-1 py-0.5 font-mono text-xs text-primary">
              title
            </code>{" "}
            necessaire ! Le titre est automatiquement recupere depuis l{"'"}API
            TMDB a partir de l{"'"}ID.
          </p>
        </CardContent>
      </Card>

      {endpoints.map((ep, i) => (
        <Card key={i} className="border-border bg-card">
          <CardHeader>
            <div className="flex items-center gap-3">
              <Badge className="border-chart-2/30 bg-chart-2/20 text-chart-2">
                {ep.method}
              </Badge>
              <CardTitle className="font-mono text-base text-card-foreground">
                {ep.path}
              </CardTitle>
            </div>
            <p className="text-sm text-muted-foreground">{ep.description}</p>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {ep.params.length > 0 && (
              <div className="flex flex-col gap-2">
                <span className="text-sm font-medium text-foreground">
                  Parametres
                </span>
                <div className="flex flex-col gap-1">
                  {ep.params.map((p) => (
                    <div key={p.name} className="flex items-center gap-2">
                      <code className="rounded bg-secondary px-1.5 py-0.5 font-mono text-xs text-primary">
                        {p.name}
                      </code>
                      <Badge variant="secondary" className="text-xs">
                        {p.type}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {p.desc}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <CodeBlock code={ep.example} label="Exemple" />
            <CodeBlock code={ep.response} label="Reponse" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
