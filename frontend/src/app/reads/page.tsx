"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const API_BASE = "http://localhost:8000/api/reads";

interface LogEntry {
  timestamp: string;
  message: string;
  type?: string;
}

const statusColors = {
  active: {
    bg: "bg-green-500/10",
    text: "text-green-600",
    border: "border-green-500/20",
  },
  idle: {
    bg: "bg-orange-500/10",
    text: "text-orange-600",
    border: "border-orange-500/20",
  },
  error: {
    bg: "bg-red-500/10",
    text: "text-red-600",
    border: "border-red-500/20",
  },
};

function Section({
  title,
  description,
  running,
  status,
  children,
  logs,
}: {
  title: string;
  description: string;
  running: boolean;
  status: "active" | "idle" | "error";
  children: React.ReactNode;
  logs: LogEntry[];
}) {
  const logsEndRef = useRef<HTMLDivElement>(null);
  const colors = statusColors[status];

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  return (
    <Card className="flex flex-col overflow-hidden border-2 transition-all hover:shadow-md">
      <CardHeader className="space-y-3 p-4 pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <CardTitle className="text-lg font-semibold">{title}</CardTitle>
              <span
                className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium ${colors.bg} ${colors.text} ${colors.border}`}
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    running ? "bg-current animate-pulse" : "bg-current opacity-40"
                  }`}
                />
                {running ? "Running" : status === "error" ? "Failed" : "Idle"}
              </span>
            </div>
            <CardDescription className="text-sm leading-relaxed">
              {description}
            </CardDescription>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">{children}</div>
      </CardHeader>
      <CardContent className="flex-1 p-4 pt-0">
        <div className="flex h-40 flex-col rounded-lg border bg-muted/50">
          <div className="flex items-center justify-between border-b px-3 py-1.5">
            <span className="text-xs font-medium text-muted-foreground">
              Event Log
            </span>
            <span className="text-xs text-muted-foreground">
              {logs.length} {logs.length === 1 ? "event" : "events"}
            </span>
          </div>
          <div className="flex-1 overflow-y-auto p-2 font-mono text-xs">
            {logs.length === 0 ? (
              <div className="flex h-full items-center justify-center text-muted-foreground">
                Waiting for events...
              </div>
            ) : (
              <div className="space-y-0.5">
                {logs.map((log, i) => (
                  <div
                    key={i}
                    className={`flex gap-2 rounded px-1.5 py-0.5 hover:bg-muted ${
                      log.type === "error" ? "text-red-600" :
                      log.type === "success" || log.type === "cache" ? "text-green-600" :
                      log.type === "miss" ? "text-orange-600" : ""
                    }`}
                  >
                    <span className="shrink-0 text-muted-foreground">
                      {log.timestamp}
                    </span>
                    <span>{log.message}</span>
                  </div>
                ))}
                <div ref={logsEndRef} />
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ============ Cache vs No Cache Demo ============

function CacheDemo() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [running, setRunning] = useState(false);
  const [stats, setStats] = useState({ hits: 0, misses: 0, dbReads: 0 });

  const addLog = useCallback((message: string, type?: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs((prev) => [...prev.slice(-19), { timestamp, message, type }]);
  }, []);

  const readNoCache = async () => {
    setRunning(true);
    const key = `product:${Math.floor(Math.random() * 10)}`;
    addLog(`Reading ${key} without cache...`);

    const res = await fetch(`${API_BASE}/no-cache/read`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key }),
    });
    const data = await res.json();

    addLog(`${data.latency_ms}ms from ${data.source}`, "miss");
    setStats({ hits: 0, misses: 0, dbReads: data.stats?.db_reads || 0 });
    setRunning(false);
  };

  const readWithCache = async () => {
    setRunning(true);
    const key = `product:${Math.floor(Math.random() * 10)}`;
    addLog(`Reading ${key} with cache...`);

    const res = await fetch(`${API_BASE}/cache/read`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key }),
    });
    const data = await res.json();

    const isHit = data.source === "cache";
    addLog(
      `${data.latency_ms}ms from ${data.source}`,
      isHit ? "cache" : "miss"
    );
    setStats({
      hits: data.stats?.cache_hits || 0,
      misses: data.stats?.cache_misses || 0,
      dbReads: data.stats?.db_reads || 0,
    });
    setRunning(false);
  };

  const burstReads = async (useCache: boolean) => {
    setRunning(true);
    const endpoint = useCache ? "cache/read" : "no-cache/read";
    addLog(`Burst: 10 reads ${useCache ? "with" : "without"} cache...`, "start");

    const keys = Array.from({ length: 10 }, () => `product:${Math.floor(Math.random() * 5)}`);
    const start = Date.now();

    const results = await Promise.all(
      keys.map((key) =>
        fetch(`${API_BASE}/${endpoint}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ key }),
        }).then((r) => r.json())
      )
    );

    const totalTime = Date.now() - start;
    const lastStats = results[results.length - 1].stats;
    const cacheHits = results.filter((r) => r.source === "cache").length;

    addLog(
      `Completed in ${totalTime}ms (${cacheHits}/10 cache hits)`,
      cacheHits > 5 ? "success" : "miss"
    );
    if (lastStats) {
      setStats({
        hits: lastStats.cache_hits || 0,
        misses: lastStats.cache_misses || 0,
        dbReads: lastStats.db_reads || 0,
      });
    }
    setRunning(false);
  };

  const clearCache = async () => {
    await fetch(`${API_BASE}/cache/clear`, { method: "POST" });
    addLog("Cache cleared");
  };

  const reset = () => {
    setLogs([]);
    setStats({ hits: 0, misses: 0, dbReads: 0 });
    clearCache();
  };

  return (
    <Section
      title="Cache-Aside Pattern"
      description="Compare reading directly from DB vs using a cache layer. Cache hits are ~25x faster."
      running={running}
      status={running ? "active" : "idle"}
      logs={logs}
    >
      <Button size="sm" disabled={running} onClick={readNoCache}>
        Read (No Cache)
      </Button>
      <Button size="sm" disabled={running} onClick={readWithCache}>
        Read (Cached)
      </Button>
      <Button size="sm" variant="outline" disabled={running} onClick={() => burstReads(false)}>
        Burst (No Cache)
      </Button>
      <Button size="sm" variant="outline" disabled={running} onClick={() => burstReads(true)}>
        Burst (Cached)
      </Button>
      <Button size="sm" variant="outline" disabled={running} onClick={reset}>
        Reset
      </Button>
      <div className="w-full flex items-center justify-between text-xs text-muted-foreground">
        <span>Hits: {stats.hits}</span>
        <span>Misses: {stats.misses}</span>
        <span>DB Reads: {stats.dbReads}</span>
      </div>
    </Section>
  );
}

// ============ Read Replicas Demo ============

function ReplicaDemo() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [running, setRunning] = useState(false);
  const [replicaStats, setReplicaStats] = useState([0, 0, 0]);

  const addLog = useCallback((message: string, type?: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs((prev) => [...prev.slice(-19), { timestamp, message, type }]);
  }, []);

  const readFromReplica = async () => {
    setRunning(true);
    const key = `product:${Math.floor(Math.random() * 10)}`;
    addLog(`Reading ${key} from replica...`);

    const res = await fetch(`${API_BASE}/replica/read`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key }),
    });
    const data = await res.json();

    addLog(`${data.latency_ms}ms from ${data.source}`, "success");
    if (data.stats?.replica_reads) {
      setReplicaStats(data.stats.replica_reads);
    }
    setRunning(false);
  };

  const burstReads = async () => {
    setRunning(true);
    addLog("Burst: 20 reads across replicas...", "start");

    const start = Date.now();
    const results = await Promise.all(
      Array.from({ length: 20 }, () =>
        fetch(`${API_BASE}/replica/read`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ key: `product:${Math.floor(Math.random() * 10)}` }),
        }).then((r) => r.json())
      )
    );

    const totalTime = Date.now() - start;
    const lastStats = results[results.length - 1].stats;

    addLog(`Completed in ${totalTime}ms`, "success");
    if (lastStats?.replica_reads) {
      setReplicaStats(lastStats.replica_reads);
      addLog(
        `Load: R0=${lastStats.replica_reads[0]}, R1=${lastStats.replica_reads[1]}, R2=${lastStats.replica_reads[2]}`
      );
    }
    setRunning(false);
  };

  const reset = async () => {
    await fetch(`${API_BASE}/reset`, { method: "POST" });
    setLogs([]);
    setReplicaStats([0, 0, 0]);
  };

  return (
    <Section
      title="Read Replicas"
      description="Distribute read load across multiple database replicas. Each read goes to a random replica."
      running={running}
      status={running ? "active" : "idle"}
      logs={logs}
    >
      <Button size="sm" disabled={running} onClick={readFromReplica}>
        Read
      </Button>
      <Button size="sm" variant="outline" disabled={running} onClick={burstReads}>
        Burst (20 reads)
      </Button>
      <Button size="sm" variant="outline" disabled={running} onClick={reset}>
        Reset
      </Button>
      <div className="w-full flex gap-2">
        {replicaStats.map((count, i) => (
          <div
            key={i}
            className="flex-1 text-center text-xs py-1 rounded bg-muted"
          >
            Replica {i}: {count}
          </div>
        ))}
      </div>
    </Section>
  );
}

// ============ Cache Stampede Demo ============

function StampedeDemo() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [running, setRunning] = useState(false);
  const [stats, setStats] = useState({ maxConcurrent: 0, totalRebuilds: 0 });

  const addLog = useCallback((message: string, type?: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs((prev) => [...prev.slice(-19), { timestamp, message, type }]);
  }, []);

  const expireCache = async () => {
    await fetch(`${API_BASE}/stampede/expire`, { method: "POST" });
    addLog("Cache expired - ready for stampede test");
    setStats({ maxConcurrent: 0, totalRebuilds: 0 });
  };

  const triggerStampede = async (protected_: boolean) => {
    setRunning(true);
    await expireCache();

    const endpoint = protected_ ? "stampede/read-protected" : "stampede/read-naive";
    addLog(`Sending 20 concurrent requests (${protected_ ? "protected" : "unprotected"})...`, "start");

    const start = Date.now();
    const results = await Promise.all(
      Array.from({ length: 20 }, () =>
        fetch(`${API_BASE}/${endpoint}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ key: "product:1" }),
        }).then((r) => r.json())
      )
    );

    const totalTime = Date.now() - start;
    const rebuilds = results.filter((r) => r.rebuilt).length;
    const lastStats = results.find((r) => r.stats)?.stats;

    if (protected_) {
      addLog(`Only 1 rebuild (others waited for lock)`, "success");
    } else {
      addLog(`${rebuilds} concurrent rebuilds!`, rebuilds > 1 ? "error" : "success");
    }
    addLog(`Completed in ${totalTime}ms`);

    if (lastStats) {
      setStats({
        maxConcurrent: lastStats.max_concurrent || 0,
        totalRebuilds: lastStats.total_rebuilds || 0,
      });
    }
    setRunning(false);
  };

  const reset = async () => {
    await fetch(`${API_BASE}/reset`, { method: "POST" });
    setLogs([]);
    setStats({ maxConcurrent: 0, totalRebuilds: 0 });
  };

  return (
    <Section
      title="Cache Stampede"
      description="When cache expires, many requests hit DB simultaneously. Lock-based protection serializes rebuilds."
      running={running}
      status={running ? "active" : stats.maxConcurrent > 5 ? "error" : "idle"}
      logs={logs}
    >
      <Button size="sm" variant="destructive" disabled={running} onClick={() => triggerStampede(false)}>
        Trigger (Unprotected)
      </Button>
      <Button size="sm" disabled={running} onClick={() => triggerStampede(true)}>
        Trigger (Protected)
      </Button>
      <Button size="sm" variant="outline" disabled={running} onClick={reset}>
        Reset
      </Button>
      <div className="w-full flex items-center justify-between text-xs text-muted-foreground">
        <span>Max Concurrent Rebuilds: {stats.maxConcurrent}</span>
        <span>Total Rebuilds: {stats.totalRebuilds}</span>
      </div>
    </Section>
  );
}

// ============ Cache Versioning Demo ============

function VersioningDemo() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [running, setRunning] = useState(false);
  const [currentVersion, setCurrentVersion] = useState(1);

  const addLog = useCallback((message: string, type?: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs((prev) => [...prev.slice(-19), { timestamp, message, type }]);
  }, []);

  const key = "product:1";

  const readVersioned = async () => {
    setRunning(true);
    addLog(`Reading ${key}...`);

    const res = await fetch(`${API_BASE}/versioning/read`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key }),
    });
    const data = await res.json();

    const isCache = data.source === "cache";
    addLog(
      `v${data.version} from ${data.source} (key: ${data.cache_key})`,
      isCache ? "cache" : "miss"
    );
    setCurrentVersion(data.version);
    setRunning(false);
  };

  const updatePrice = async () => {
    setRunning(true);
    const newPrice = Math.round(Math.random() * 400 + 50);
    addLog(`Updating price to $${newPrice}...`);

    const res = await fetch(`${API_BASE}/versioning/update`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, price: newPrice }),
    });
    const data = await res.json();

    addLog(`Version bumped: v${data.old_version} → v${data.new_version}`, "success");
    addLog(`Old cache key now stale, new reads use v${data.new_version}`);
    setCurrentVersion(data.new_version);
    setRunning(false);
  };

  const showCacheState = async () => {
    const res = await fetch(`${API_BASE}/versioning/cache-state`);
    const data = await res.json();
    addLog(`Cache has ${data.cache_entries.length} versioned entries`);
    if (data.cache_entries.length > 0) {
      addLog(`Keys: ${data.cache_entries.slice(0, 3).join(", ")}...`);
    }
  };

  const reset = async () => {
    await fetch(`${API_BASE}/reset`, { method: "POST" });
    setLogs([]);
    setCurrentVersion(1);
  };

  return (
    <Section
      title="Cache Versioning"
      description="Avoid invalidation race conditions by including version in cache keys. Old versions become unreachable."
      running={running}
      status={running ? "active" : "idle"}
      logs={logs}
    >
      <Button size="sm" disabled={running} onClick={readVersioned}>
        Read
      </Button>
      <Button size="sm" variant="outline" disabled={running} onClick={updatePrice}>
        Update Price
      </Button>
      <Button size="sm" variant="outline" disabled={running} onClick={showCacheState}>
        Show Cache
      </Button>
      <Button size="sm" variant="outline" disabled={running} onClick={reset}>
        Reset
      </Button>
      <div className="w-full text-xs text-muted-foreground">
        Current version: v{currentVersion}
      </div>
    </Section>
  );
}

// ============ Main Page ============

export default function ReadsPage() {
  const resetAll = async () => {
    await fetch(`${API_BASE}/reset`, { method: "POST" });
    window.location.reload();
  };

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Scaling Reads</h1>
          <p className="mt-2 text-muted-foreground">
            Strategies for handling high-volume read traffic: caching, replicas, and stampede protection.
          </p>
        </div>
        <Button variant="outline" onClick={resetAll}>
          Reset All
        </Button>
      </header>

      <div className="grid gap-6 md:grid-cols-2">
        <CacheDemo />
        <ReplicaDemo />
        <StampedeDemo />
        <VersioningDemo />
      </div>
    </div>
  );
}
