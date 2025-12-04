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

const API_BASE = "http://localhost:8000/api/writes";

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
      <CardHeader className="space-y-2 p-3 pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="space-y-0.5">
            <div className="flex items-center gap-2">
              <CardTitle className="text-base font-semibold">{title}</CardTitle>
              <span
                className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-xs font-medium ${colors.bg} ${colors.text} ${colors.border}`}
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    running ? "bg-current animate-pulse" : "bg-current opacity-40"
                  }`}
                />
                {running ? "Running" : status === "error" ? "Failed" : "Idle"}
              </span>
            </div>
            <CardDescription className="text-xs">
              {description}
            </CardDescription>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">{children}</div>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col justify-end p-3 pt-0">
        <div className="flex h-32 flex-col rounded-lg border bg-muted/50">
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
                      log.type === "success" || log.type === "fast" ? "text-green-600" :
                      log.type === "slow" ? "text-orange-600" :
                      log.type === "dropped" ? "text-red-500" : ""
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

// ============ 1. Vertical Scaling Demo ============

function VerticalScalingDemo() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [running, setRunning] = useState(false);

  const addLog = useCallback((message: string, type?: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs((prev) => [...prev.slice(-19), { timestamp, message, type }]);
  }, []);

  const writeToDb = async (dbType: string) => {
    setRunning(true);
    const key = `item:${Date.now()}`;
    
    addLog(`Writing to ${dbType} database...`);
    const res = await fetch(`${API_BASE}/vertical/write?db_type=${dbType}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, value: "test-value" }),
    });
    const data = await res.json();
    
    const speed = data.latency_ms < 15 ? "fast" : data.latency_ms < 35 ? "success" : "slow";
    addLog(`${data.db_name}: ${data.latency_ms}ms`, speed);
    setRunning(false);
  };

  const runBenchmark = async () => {
    setRunning(true);
    addLog("Running benchmark across all DB types...", "start");
    
    const res = await fetch(`${API_BASE}/vertical/benchmark?count=10`, {
      method: "POST",
    });
    const data = await res.json();
    
    for (const [dbType, result] of Object.entries(data.benchmark) as [string, { name: string; avg_latency_ms: number; writes_per_sec: number }][]) {
      const speed = result.avg_latency_ms < 15 ? "fast" : result.avg_latency_ms < 35 ? "success" : "slow";
      addLog(`${result.name}: ${result.avg_latency_ms}ms avg, ${result.writes_per_sec} w/s`, speed);
    }
    
    addLog("Benchmark complete!", "success");
    setRunning(false);
  };

  const reset = async () => {
    await fetch(`${API_BASE}/reset`, { method: "POST" });
    setLogs([]);
  };

  return (
    <Section
      title="Vertical Scaling & DB Choice"
      description="Different databases optimize for different workloads. Append-only DBs (like Cassandra) are 10x faster for writes."
      running={running}
      status={running ? "active" : "idle"}
      logs={logs}
    >
      <Button size="sm" disabled={running} onClick={() => writeToDb("traditional")}>
        Traditional DB
      </Button>
      <Button size="sm" variant="outline" disabled={running} onClick={() => writeToDb("optimized")}>
        Optimized
      </Button>
      <Button size="sm" variant="outline" disabled={running} onClick={() => writeToDb("append_only")}>
        Append-Only
      </Button>
      <Button size="sm" variant="outline" disabled={running} onClick={runBenchmark}>
        Benchmark All
      </Button>
      <Button size="sm" variant="outline" disabled={running} onClick={reset}>
        Reset
      </Button>
    </Section>
  );
}

// ============ 2. Sharding Demo ============

function ShardingDemo() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [running, setRunning] = useState(false);
  const [shardStats, setShardStats] = useState([0, 0, 0, 0]);

  const addLog = useCallback((message: string, type?: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs((prev) => [...prev.slice(-19), { timestamp, message, type }]);
  }, []);

  const burstWrite = async (useBadSharding: boolean) => {
    setRunning(true);
    const strategy = useBadSharding ? "bad (prefix-based)" : "good (hash-based)";
    addLog(`Burst: 20 writes with ${strategy} sharding...`, "start");
    
    const res = await fetch(`${API_BASE}/sharding/burst?count=20&use_bad_sharding=${useBadSharding}&key_prefix=user`, {
      method: "POST",
    });
    const data = await res.json();
    
    setShardStats(data.shard_distribution);
    
    if (data.variance > 10) {
      addLog(`High variance (${data.variance.toFixed(1)}) - uneven load!`, "error");
    } else {
      addLog(`Low variance (${data.variance.toFixed(1)}) - even distribution!`, "success");
    }
    addLog(`Distribution: [${data.shard_distribution.join(", ")}]`);
    addLog(`${data.writes_per_sec} writes/sec`);
    setRunning(false);
  };

  const reset = async () => {
    await fetch(`${API_BASE}/reset`, { method: "POST" });
    setLogs([]);
    setShardStats([0, 0, 0, 0]);
  };

  return (
    <Section
      title="Sharding & Partitioning"
      description="Distribute writes across shards. Good keys spread load evenly; bad keys create hot spots."
      running={running}
      status={running ? "active" : "idle"}
      logs={logs}
    >
      <Button size="sm" disabled={running} onClick={() => burstWrite(false)}>
        Good Sharding (Hash)
      </Button>
      <Button size="sm" variant="destructive" disabled={running} onClick={() => burstWrite(true)}>
        Bad Sharding (Prefix)
      </Button>
      <Button size="sm" variant="outline" disabled={running} onClick={reset}>
        Reset
      </Button>
      <div className="w-full flex gap-1.5 mt-1">
        {shardStats.map((count, i) => (
          <div
            key={i}
            className="flex-1 text-center text-xs py-1 rounded bg-muted relative overflow-hidden"
          >
            <div 
              className="absolute inset-0 bg-primary/20 transition-all"
              style={{ width: `${Math.min(100, (count / Math.max(1, Math.max(...shardStats))) * 100)}%` }}
            />
            <span className="relative">Shard {i}: {count}</span>
          </div>
        ))}
      </div>
    </Section>
  );
}

// ============ 3. Queue & Load Shedding Demo ============

function QueueDemo() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [running, setRunning] = useState(false);
  const [processorRunning, setProcessorRunning] = useState(false);
  const [stats, setStats] = useState({ queued: 0, processed: 0, dropped: 0, depth: 0 });

  const addLog = useCallback((message: string, type?: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs((prev) => [...prev.slice(-19), { timestamp, message, type }]);
  }, []);

  const toggleProcessor = async () => {
    if (processorRunning) {
      const res = await fetch(`${API_BASE}/queue/stop-processor`, { method: "POST" });
      const data = await res.json();
      setProcessorRunning(false);
      addLog("Queue processor stopped");
      setStats({ queued: data.stats.queued, processed: data.stats.processed, dropped: data.stats.dropped, depth: data.stats.queue_depth });
    } else {
      const res = await fetch(`${API_BASE}/queue/start-processor`, { method: "POST" });
      const data = await res.json();
      setProcessorRunning(true);
      addLog("Queue processor started", "success");
      setStats({ queued: data.stats.queued, processed: data.stats.processed, dropped: data.stats.dropped, depth: data.stats.queue_depth });
    }
  };

  const sendBurst = async () => {
    setRunning(true);
    addLog("Sending burst of 40 writes (mixed priority)...", "start");
    
    const res = await fetch(`${API_BASE}/queue/burst?count=40&mixed_priority=true`, {
      method: "POST",
    });
    const data = await res.json();
    
    if (data.burst_results.dropped > 0) {
      addLog(`Queued: ${data.burst_results.queued}, Dropped: ${data.burst_results.dropped}`, "dropped");
      addLog("Low-priority writes shed under load!", "error");
    } else {
      addLog(`All ${data.burst_results.queued} writes queued`, "success");
    }
    addLog(`Queue depth: ${data.queue_depth}`);
    
    setStats({ 
      queued: data.stats.queued, 
      processed: data.stats.processed, 
      dropped: data.stats.dropped, 
      depth: data.stats.queue_depth 
    });
    setRunning(false);
  };

  const reset = async () => {
    await fetch(`${API_BASE}/queue/stop-processor`, { method: "POST" });
    await fetch(`${API_BASE}/reset`, { method: "POST" });
    setLogs([]);
    setProcessorRunning(false);
    setStats({ queued: 0, processed: 0, dropped: 0, depth: 0 });
  };

  // Poll for stats when processor is running
  useEffect(() => {
    if (!processorRunning) return;
    
    const interval = setInterval(async () => {
      const res = await fetch(`${API_BASE}/stats`);
      const data = await res.json();
      setStats({ 
        queued: data.queue.queued, 
        processed: data.queue.processed, 
        dropped: data.queue.dropped, 
        depth: data.queue.queue_depth 
      });
    }, 500);
    
    return () => clearInterval(interval);
  }, [processorRunning]);

  return (
    <Section
      title="Queues & Load Shedding"
      description="Buffer writes with queues. When overwhelmed, shed low-priority writes to protect the system."
      running={running}
      status={processorRunning ? "active" : "idle"}
      logs={logs}
    >
      <Button 
        size="sm" 
        variant={processorRunning ? "destructive" : "default"}
        onClick={toggleProcessor}
      >
        {processorRunning ? "Stop Processor" : "Start Processor"}
      </Button>
      <Button size="sm" variant="outline" disabled={running} onClick={sendBurst}>
        Burst (40 writes)
      </Button>
      <Button size="sm" variant="outline" onClick={reset}>
        Reset
      </Button>
      <div className="w-full grid grid-cols-4 gap-1.5 text-xs">
        <div className="text-center py-1 rounded bg-muted">
          <div className="text-muted-foreground">Queued</div>
          <div className="font-medium">{stats.queued}</div>
        </div>
        <div className="text-center py-1 rounded bg-muted">
          <div className="text-muted-foreground">Processed</div>
          <div className="font-medium text-green-600">{stats.processed}</div>
        </div>
        <div className="text-center py-1 rounded bg-muted">
          <div className="text-muted-foreground">Dropped</div>
          <div className="font-medium text-red-600">{stats.dropped}</div>
        </div>
        <div className="text-center py-1 rounded bg-muted">
          <div className="text-muted-foreground">Depth</div>
          <div className="font-medium">{stats.depth}</div>
        </div>
      </div>
    </Section>
  );
}

// ============ 4. Batching Demo ============

function BatchingDemo() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [running, setRunning] = useState(false);
  const [stats, setStats] = useState({ individual: 0, batched: 0, dbOps: 0 });

  const addLog = useCallback((message: string, type?: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs((prev) => [...prev.slice(-19), { timestamp, message, type }]);
  }, []);

  const compareBatching = async () => {
    setRunning(true);
    addLog("Comparing individual vs batched writes...", "start");
    
    const res = await fetch(`${API_BASE}/batching/compare?count=20`, {
      method: "POST",
    });
    const data = await res.json();
    
    addLog(`Individual: ${data.individual.total_ms}ms (${data.individual.db_operations} DB ops)`, "slow");
    addLog(`Batched: ${data.batched.total_ms}ms (${data.batched.db_operations} DB op)`, "fast");
    addLog(`Result: ${data.improvement}, saved ${data.db_ops_saved} DB operations!`, "success");
    
    setStats({ 
      individual: data.individual.db_operations, 
      batched: data.batched.db_operations, 
      dbOps: data.db_ops_saved 
    });
    setRunning(false);
  };

  const runAggregation = async () => {
    setRunning(true);
    addLog("Simulating 100 likes with hierarchical aggregation...", "start");
    
    const res = await fetch(`${API_BASE}/aggregation/burst?key=viral_post&count=100`, {
      method: "POST",
    });
    const data = await res.json();
    
    addLog(`100 increments → ${data.stats.aggregator_flushes} aggregator flushes`, "success");
    addLog(`Leaf: ${data.leaf_value}, Aggregator: ${data.aggregator_value}, Root: ${data.root_value}`);
    addLog(`Total count: ${data.total}`, "success");
    
    // Flush to "database"
    const flushRes = await fetch(`${API_BASE}/aggregation/flush-to-root`, { method: "POST" });
    const flushData = await flushRes.json();
    addLog(`Flushed ${flushData.total_flushed} to root (1 DB write)`, "fast");
    
    setRunning(false);
  };

  const reset = async () => {
    await fetch(`${API_BASE}/reset`, { method: "POST" });
    setLogs([]);
    setStats({ individual: 0, batched: 0, dbOps: 0 });
  };

  return (
    <Section
      title="Batching & Aggregation"
      description="Batch writes together to reduce DB operations. Hierarchical aggregation handles viral content."
      running={running}
      status={running ? "active" : "idle"}
      logs={logs}
    >
      <Button size="sm" disabled={running} onClick={compareBatching}>
        Compare Batching
      </Button>
      <Button size="sm" variant="outline" disabled={running} onClick={runAggregation}>
        Hierarchical Agg
      </Button>
      <Button size="sm" variant="outline" disabled={running} onClick={reset}>
        Reset
      </Button>
      <div className="w-full flex items-center justify-between text-xs text-muted-foreground">
        <span>Individual ops: {stats.individual}</span>
        <span>Batched ops: {stats.batched}</span>
        <span className="text-green-600">Saved: {stats.dbOps}</span>
      </div>
    </Section>
  );
}

// ============ Main Page ============

export default function WritesPage() {
  const resetAll = async () => {
    await fetch(`${API_BASE}/reset`, { method: "POST" });
    window.location.reload();
  };

  return (
    <div className="space-y-4">
      <header className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Scaling Writes</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Strategies for handling high-volume write traffic: vertical scaling, sharding, queues, and batching.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={resetAll}>
          Reset All
        </Button>
      </header>

      <div className="grid gap-4 md:grid-cols-2">
        <VerticalScalingDemo />
        <ShardingDemo />
        <QueueDemo />
        <BatchingDemo />
      </div>
    </div>
  );
}

