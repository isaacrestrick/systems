"use client";

import { useState } from "react";

type Result =
  | { ok: true; status: string; timestamp: string }
  | { ok: false; error: string };

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
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-black">
      <main className="flex flex-col items-center gap-8 p-8">
        <h1 className="text-3xl font-bold text-zinc-900 dark:text-zinc-50">
          System Design Demo
        </h1>

        <button
          onClick={checkBackend}
          disabled={loading}
          className="rounded-lg bg-blue-600 px-6 py-3 font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? "Checking..." : "Check Backend"}
        </button>

        {result && (
          result.ok ? (
            <div className="rounded-lg border border-green-200 bg-green-50 p-4 dark:border-green-800 dark:bg-green-900/20">
              <p className="text-green-800 dark:text-green-200">
                Status: {result.status}
              </p>
              <p className="text-sm text-green-700 dark:text-green-300">
                Timestamp: {result.timestamp}
              </p>
            </div>
          ) : (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-900/20">
              <p className="text-red-800 dark:text-red-200">Error: {result.error}</p>
            </div>
          )
        )}
      </main>
    </div>
  );
}
