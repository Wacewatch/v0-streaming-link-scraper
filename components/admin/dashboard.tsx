"use client";

import React from "react"

import useSWR from "swr";
import {
  Database,
  Film,
  Tv,
  PlayCircle,
  Globe,
  Activity,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

function StatCard({
  title,
  value,
  icon: Icon,
}: {
  title: string;
  value: number | string;
  icon: React.ElementType;
}) {
  return (
    <Card className="border-border bg-card">
      <CardContent className="flex items-center gap-4 p-5">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-primary/10">
          <Icon className="h-5 w-5 text-primary" />
        </div>
        <div>
          <p className="text-sm text-muted-foreground">{title}</p>
          <p className="text-2xl font-semibold text-card-foreground">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

export function Dashboard() {
  const { data, isLoading } = useSWR("/api/admin/stats", fetcher, {
    refreshInterval: 10000,
  });

  if (isLoading) {
    return (
      <div className="flex flex-col gap-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Card key={i} className="border-border bg-card">
              <CardContent className="p-5">
                <div className="h-16 animate-pulse rounded-lg bg-secondary" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard title="Sources" value={data?.sources ?? 0} icon={Globe} />
        <StatCard title="Contenus" value={data?.content ?? 0} icon={Database} />
        <StatCard title="Films" value={data?.movies ?? 0} icon={Film} />
        <StatCard title="Series" value={data?.series ?? 0} icon={Tv} />
        <StatCard title="Lecteurs" value={data?.players ?? 0} icon={PlayCircle} />
      </div>

      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-card-foreground">
            <Activity className="h-5 w-5 text-primary" />
            Logs recents
          </CardTitle>
        </CardHeader>
        <CardContent>
          {data?.recent_logs?.length > 0 ? (
            <div className="flex flex-col gap-3">
              {data.recent_logs.map(
                (log: {
                  id: number;
                  source_name: string;
                  status: string;
                  message: string;
                  items_found: number;
                  started_at: string;
                }) => (
                  <div
                    key={log.id}
                    className="flex items-center justify-between rounded-lg border border-border bg-secondary/50 p-3"
                  >
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-foreground">
                          {log.source_name}
                        </span>
                        <Badge
                          variant={
                            log.status === "success"
                              ? "default"
                              : log.status === "error"
                                ? "destructive"
                                : "secondary"
                          }
                          className="text-xs"
                        >
                          {log.status}
                        </Badge>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {log.message}
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="text-sm font-medium text-foreground">
                        {log.items_found}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {new Date(log.started_at).toLocaleString("fr-FR")}
                      </span>
                    </div>
                  </div>
                )
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Aucun log disponible
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
