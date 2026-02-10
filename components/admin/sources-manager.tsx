"use client";

import { useState } from "react";
import useSWR from "swr";
import {
  Globe,
  Plus,
  Pencil,
  Trash2,
  Power,
  PowerOff,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface Source {
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

export function SourcesManager() {
  const { data: sources, mutate } = useSWR<Source[]>(
    "/api/admin/sources",
    fetcher
  );
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingSource, setEditingSource] = useState<Source | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    base_url: "",
    slug: "",
    scraper_type: "generic",
  });

  function openNewDialog() {
    setEditingSource(null);
    setFormData({ name: "", base_url: "", slug: "", scraper_type: "generic" });
    setDialogOpen(true);
  }

  function openEditDialog(source: Source) {
    setEditingSource(source);
    setFormData({
      name: source.name,
      base_url: source.base_url,
      slug: source.slug,
      scraper_type: source.scraper_type,
    });
    setDialogOpen(true);
  }

  async function handleSave() {
    if (editingSource) {
      await fetch(`/api/admin/sources/${editingSource.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
    } else {
      await fetch("/api/admin/sources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
    }
    setDialogOpen(false);
    mutate();
  }

  async function toggleEnabled(source: Source) {
    await fetch(`/api/admin/sources/${source.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: !source.enabled }),
    });
    mutate();
  }

  async function deleteSource(id: number) {
    if (!confirm("Supprimer cette source ?")) return;
    await fetch(`/api/admin/sources/${id}`, { method: "DELETE" });
    mutate();
  }

  async function updateUrl(source: Source, newUrl: string) {
    await fetch(`/api/admin/sources/${source.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ base_url: newUrl }),
    });
    mutate();
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-foreground">
          Sources de scraping
        </h2>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={openNewDialog} size="sm">
              <Plus className="mr-1.5 h-4 w-4" />
              Ajouter
            </Button>
          </DialogTrigger>
          <DialogContent className="border-border bg-card text-card-foreground">
            <DialogHeader>
              <DialogTitle>
                {editingSource ? "Modifier la source" : "Nouvelle source"}
              </DialogTitle>
            </DialogHeader>
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <Label className="text-muted-foreground">Nom</Label>
                <Input
                  value={formData.name}
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value })
                  }
                  placeholder="TopStream"
                  className="border-border bg-secondary text-foreground"
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label className="text-muted-foreground">URL de base</Label>
                <Input
                  value={formData.base_url}
                  onChange={(e) =>
                    setFormData({ ...formData, base_url: e.target.value })
                  }
                  placeholder="https://top-stream.space"
                  className="border-border bg-secondary text-foreground"
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label className="text-muted-foreground">Slug</Label>
                <Input
                  value={formData.slug}
                  onChange={(e) =>
                    setFormData({ ...formData, slug: e.target.value })
                  }
                  placeholder="topstream"
                  className="border-border bg-secondary text-foreground"
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label className="text-muted-foreground">
                  Type de scraper
                </Label>
                <Input
                  value={formData.scraper_type}
                  onChange={(e) =>
                    setFormData({ ...formData, scraper_type: e.target.value })
                  }
                  placeholder="topstream"
                  className="border-border bg-secondary text-foreground"
                />
              </div>
              <Button onClick={handleSave}>
                {editingSource ? "Mettre a jour" : "Creer"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex flex-col gap-4">
        {sources?.map((source) => (
          <SourceCard
            key={source.id}
            source={source}
            onEdit={openEditDialog}
            onToggle={toggleEnabled}
            onDelete={deleteSource}
            onUpdateUrl={updateUrl}
          />
        ))}
        {(!sources || sources.length === 0) && (
          <Card className="border-border bg-card">
            <CardContent className="p-8 text-center">
              <Globe className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
              <p className="text-muted-foreground">
                Aucune source configuree
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

function SourceCard({
  source,
  onEdit,
  onToggle,
  onDelete,
  onUpdateUrl,
}: {
  source: Source;
  onEdit: (s: Source) => void;
  onToggle: (s: Source) => void;
  onDelete: (id: number) => void;
  onUpdateUrl: (s: Source, url: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [newUrl, setNewUrl] = useState(source.base_url);

  return (
    <Card className="border-border bg-card">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
              <Globe className="h-4 w-4 text-primary" />
            </div>
            <div>
              <CardTitle className="text-base text-card-foreground">
                {source.name}
              </CardTitle>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground font-mono">
                  {source.slug}
                </span>
                <Badge
                  variant={source.enabled ? "default" : "secondary"}
                  className="text-xs"
                >
                  {source.enabled ? "Actif" : "Inactif"}
                </Badge>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onToggle(source)}
              title={source.enabled ? "Desactiver" : "Activer"}
              className="h-8 w-8 text-muted-foreground hover:text-foreground"
            >
              {source.enabled ? (
                <Power className="h-4 w-4" />
              ) : (
                <PowerOff className="h-4 w-4" />
              )}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onEdit(source)}
              className="h-8 w-8 text-muted-foreground hover:text-foreground"
            >
              <Pencil className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onDelete(source.id)}
              className="h-8 w-8 text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            {editing ? (
              <div className="flex flex-1 items-center gap-2">
                <Input
                  value={newUrl}
                  onChange={(e) => setNewUrl(e.target.value)}
                  className="flex-1 border-border bg-secondary text-foreground font-mono text-sm"
                />
                <Button
                  size="sm"
                  onClick={() => {
                    onUpdateUrl(source, newUrl);
                    setEditing(false);
                  }}
                >
                  Sauver
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setNewUrl(source.base_url);
                    setEditing(false);
                  }}
                  className="text-muted-foreground"
                >
                  Annuler
                </Button>
              </div>
            ) : (
              <div className="flex flex-1 items-center gap-2">
                <code className="flex-1 rounded-md bg-secondary px-3 py-1.5 text-sm text-foreground">
                  {source.base_url}
                </code>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setEditing(true)}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <Pencil className="mr-1 h-3 w-3" />
                  Changer URL
                </Button>
                <a
                  href={source.base_url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <ExternalLink className="h-3 w-3" />
                  </Button>
                </a>
              </div>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Type: {source.scraper_type} | Mis a jour:{" "}
            {new Date(source.updated_at).toLocaleString("fr-FR")}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
