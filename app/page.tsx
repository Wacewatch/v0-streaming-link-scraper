"use client";

import React from "react"

import { useState, useCallback } from "react";
import {
  LayoutDashboard,
  Globe,
  Search,
  Database,
  FileText,
  LogOut,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { LoginForm } from "@/components/admin/login-form";
import { Dashboard } from "@/components/admin/dashboard";
import { SourcesManager } from "@/components/admin/sources-manager";
import { ScrapePanel } from "@/components/admin/scrape-panel";
import { ContentBrowser } from "@/components/admin/content-browser";
import { ApiDocs } from "@/components/admin/api-docs";

type Tab = "dashboard" | "sources" | "scrape" | "content" | "api";

const navItems: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "sources", label: "Sources", icon: Globe },
  { id: "scrape", label: "Scraping", icon: Search },
  { id: "content", label: "Contenus", icon: Database },
  { id: "api", label: "API", icon: FileText },
];

export default function Page() {
  const [authenticated, setAuthenticated] = useState(false);
  const [currentTab, setCurrentTab] = useState<Tab>("dashboard");

  const handleLogout = useCallback(async () => {
    await fetch("/api/admin/logout", { method: "POST" });
    setAuthenticated(false);
  }, []);

  if (!authenticated) {
    return <LoginForm onSuccess={() => setAuthenticated(true)} />;
  }

  return (
    <div className="flex min-h-screen bg-background">
      {/* Sidebar */}
      <aside className="hidden w-64 flex-col border-r border-border bg-card lg:flex">
        <div className="flex h-16 items-center gap-3 border-b border-border px-6">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
            <Search className="h-4 w-4 text-primary-foreground" />
          </div>
          <span className="text-lg font-semibold text-card-foreground">
            StreamScraper
          </span>
        </div>
        <nav className="flex flex-1 flex-col gap-1 p-3">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setCurrentTab(item.id)}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                currentTab === item.id
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-secondary hover:text-foreground"
              }`}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </button>
          ))}
        </nav>
        <div className="border-t border-border p-3">
          <Button
            variant="ghost"
            onClick={handleLogout}
            className="w-full justify-start text-muted-foreground hover:text-foreground"
          >
            <LogOut className="mr-2 h-4 w-4" />
            Deconnexion
          </Button>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex flex-1 flex-col">
        {/* Mobile header */}
        <header className="flex h-16 items-center justify-between border-b border-border bg-card px-4 lg:hidden">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
              <Search className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="font-semibold text-card-foreground">
              StreamScraper
            </span>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleLogout}
            className="text-muted-foreground"
          >
            <LogOut className="h-4 w-4" />
          </Button>
        </header>

        {/* Mobile nav */}
        <div className="flex gap-1 overflow-x-auto border-b border-border bg-card p-2 lg:hidden">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setCurrentTab(item.id)}
              className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition-colors ${
                currentTab === item.id
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground"
              }`}
            >
              <item.icon className="h-3.5 w-3.5" />
              {item.label}
            </button>
          ))}
        </div>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-4 lg:p-8">
          <div className="mx-auto max-w-5xl">
            {currentTab === "dashboard" && <Dashboard />}
            {currentTab === "sources" && <SourcesManager />}
            {currentTab === "scrape" && <ScrapePanel />}
            {currentTab === "content" && <ContentBrowser />}
            {currentTab === "api" && <ApiDocs />}
          </div>
        </main>
      </div>
    </div>
  );
}
