"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type Result =
  | { ok: true; status: string; timestamp: string }
  | { ok: false; error: string };

const demos = [
  {
    href: "/realtime",
    title: "Real-Time Updates",
    description: "Compare SSE, WebSocket, Polling, and Long Polling patterns",
  },
];

export default function Home() {
  const [result, setResult] = useState<Result | null>(null);
  const [loading, setLoading] = useState(false);

  async function checkBackend() {
    setLoading(true);
    try {
      const res = await fetch("/api/health");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setResult({ ok: true, ...data });
    } catch (e) {
      setResult({ ok: false, error: e instanceof Error ? e.message : "Unknown error" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <h1 className="text-3xl font-bold">System Design Demo</h1>
        <p className="mt-2 text-muted-foreground">
          Interactive demonstrations of common system design patterns and concepts.
          Built with Next.js and FastAPI.
        </p>

        <div className="mt-8">
          <h2 className="text-xl font-semibold">Demos</h2>
          <div className="mt-4 grid gap-4">
            {demos.map((demo) => (
              <Link key={demo.href} href={demo.href}>
                <Card className="transition-colors hover:bg-muted/50">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-lg">{demo.title}</CardTitle>
                    <CardDescription>{demo.description}</CardDescription>
                  </CardHeader>
                </Card>
              </Link>
            ))}
          </div>
        </div>

        <div className="mt-8">
          <h2 className="text-xl font-semibold">Backend Status</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Check connectivity to the FastAPI backend (has 50% random error rate for demo purposes)
          </p>
          <div className="mt-4 flex items-center gap-4">
            <Button onClick={checkBackend} disabled={loading} variant="outline">
              {loading ? "Checking..." : "Check Backend"}
            </Button>
            {result && (
              <span className={result.ok ? "text-green-600" : "text-destructive"}>
                {result.ok ? `OK - ${result.timestamp}` : `Error: ${result.error}`}
              </span>
            )}
          </div>
        </div>

        <div className="mt-8">
          <h2 className="text-xl font-semibold">Architecture</h2>
          <div className="mt-4 rounded-lg bg-muted p-4 font-mono text-sm">
            <div>Frontend: Next.js (port 3000)</div>
            <div>Backend: FastAPI (port 8000)</div>
            <div>Proxy: /api/* → localhost:8000/api/*</div>
          </div>
        </div>
      </div>
  );
}
