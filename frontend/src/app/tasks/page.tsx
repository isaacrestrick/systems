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

const API_BASE = "http://localhost:8000/api/tasks";

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
                {running ? "Running" : status === "error" ? "Error" : "Idle"}
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
                      log.type === "error" || log.type === "rejected" ? "text-red-600" :
                      log.type === "success" || log.type === "completed" ? "text-green-600" :
                      log.type === "warning" || log.type === "retry" ? "text-orange-600" :
                      log.type === "fast" ? "text-blue-600" : ""
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

// ============ 1. Sync vs Async Demo ============

function SyncAsyncDemo() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [running, setRunning] = useState(false);

  const addLog = useCallback((message: string, type?: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs((prev) => [...prev.slice(-19), { timestamp, message, type }]);
  }, []);

  const runSync = async () => {
    setRunning(true);
    addLog("Starting SYNC request (3s task)...");
    addLog("⏳ User waiting... browser blocked...", "warning");
    
    const start = Date.now();
    const res = await fetch(`${API_BASE}/sync/process`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ duration_seconds: 3 }),
    });
    const data = await res.json();
    
    addLog(`Done after ${Date.now() - start}ms`, "success");
    addLog(`User waited entire time! 😫`, "error");
    setRunning(false);
  };

  const runAsync = async () => {
    setRunning(true);
    addLog("Starting ASYNC request (3s task)...");
    
    const start = Date.now();
    const res = await fetch(`${API_BASE}/async/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ duration_seconds: 3 }),
    });
    const data = await res.json();
    
    addLog(`Response in ${Date.now() - start}ms! Job ID: ${data.job_id}`, "fast");
    addLog("User free to continue! 🎉", "success");
    
    // Poll for completion
    addLog("Polling for status...");
    let completed = false;
    while (!completed) {
      await new Promise(r => setTimeout(r, 500));
      const statusRes = await fetch(`${API_BASE}/async/status/${data.job_id}`);
      const status = await statusRes.json();
      
      if (status.status === "completed") {
        addLog(`Job completed! Result: ${status.result}`, "completed");
        completed = true;
      } else if (status.status === "processing") {
        addLog(`Status: processing...`);
      }
    }
    
    setRunning(false);
  };

  const reset = () => setLogs([]);

  return (
    <Section
      title="Sync vs Async Processing"
      description="Sync blocks the user. Async returns immediately with a job ID while work happens in background."
      running={running}
      status={running ? "active" : "idle"}
      logs={logs}
    >
      <Button size="sm" variant="destructive" disabled={running} onClick={runSync}>
        Sync (Blocks 3s)
      </Button>
      <Button size="sm" disabled={running} onClick={runAsync}>
        Async (Instant)
      </Button>
      <Button size="sm" variant="outline" disabled={running} onClick={reset}>
        Clear
      </Button>
    </Section>
  );
}

// ============ 2. Worker Pool Demo ============

function WorkerPoolDemo() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [running, setRunning] = useState(false);
  const [workersRunning, setWorkersRunning] = useState(false);
  const [workers, setWorkers] = useState<Array<{ id: string; status: string; jobs_processed: number }>>([]);
  const [stats, setStats] = useState({ queue: 0, completed: 0, processing: 0 });

  const addLog = useCallback((message: string, type?: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs((prev) => [...prev.slice(-19), { timestamp, message, type }]);
  }, []);

  const fetchStatus = useCallback(async () => {
    const res = await fetch(`${API_BASE}/workers/status`);
    const data = await res.json();
    setWorkersRunning(data.running);
    setWorkers(data.workers || []);
    setStats({
      queue: data.queue_depth || 0,
      completed: data.stats?.jobs_completed || 0,
      processing: data.workers?.filter((w: { status: string }) => w.status === "processing").length || 0,
    });
  }, []);

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 500);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  const toggleWorkers = async () => {
    setRunning(true);
    if (workersRunning) {
      await fetch(`${API_BASE}/workers/stop`, { method: "POST" });
      addLog("Workers stopped");
    } else {
      const res = await fetch(`${API_BASE}/workers/start`, { method: "POST" });
      const data = await res.json();
      addLog(`Started ${data.worker_count} workers`, "success");
    }
    await fetchStatus();
    setRunning(false);
  };

  const submitJob = async () => {
    const res = await fetch(`${API_BASE}/queue/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "task", duration: 2 }),
    });
    const data = await res.json();
    
    if (data.status === "rejected") {
      addLog(`Job rejected: ${data.reason}`, "rejected");
    } else {
      addLog(`Job ${data.job_id} queued (pos: ${data.queue_position})`);
    }
  };

  const reset = async () => {
    await fetch(`${API_BASE}/reset`, { method: "POST" });
    setLogs([]);
    await fetchStatus();
  };

  return (
    <Section
      title="Worker Pool"
      description="Workers pull jobs from queue and process them. Jobs wait in queue until a worker is available."
      running={running || stats.processing > 0}
      status={workersRunning ? "active" : "idle"}
      logs={logs}
    >
      <Button 
        size="sm" 
        variant={workersRunning ? "destructive" : "default"}
        disabled={running}
        onClick={toggleWorkers}
      >
        {workersRunning ? "Stop Workers" : "Start Workers"}
      </Button>
      <Button size="sm" variant="outline" onClick={submitJob}>
        Submit Job
      </Button>
      <Button size="sm" variant="outline" onClick={reset}>
        Reset
      </Button>
      <div className="w-full grid grid-cols-3 gap-1.5 text-xs">
        <div className="text-center py-1 rounded bg-muted">
          <div className="text-muted-foreground">Queue</div>
          <div className="font-medium">{stats.queue}</div>
        </div>
        <div className="text-center py-1 rounded bg-muted">
          <div className="text-muted-foreground">Processing</div>
          <div className="font-medium text-blue-600">{stats.processing}</div>
        </div>
        <div className="text-center py-1 rounded bg-muted">
          <div className="text-muted-foreground">Completed</div>
          <div className="font-medium text-green-600">{stats.completed}</div>
        </div>
      </div>
      {workers.length > 0 && (
        <div className="w-full flex gap-1">
          {workers.map((w) => (
            <div
              key={w.id}
              className={`flex-1 text-center text-xs py-1 rounded ${
                w.status === "processing" ? "bg-blue-500/20 text-blue-700" :
                w.status === "idle" ? "bg-green-500/20 text-green-700" :
                "bg-muted text-muted-foreground"
              }`}
              title={`${w.id}: ${w.jobs_processed} jobs`}
            >
              W{w.id.split("-")[1]}
            </div>
          ))}
        </div>
      )}
    </Section>
  );
}

// ============ 3. Backpressure Demo ============

function BackpressureDemo() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [running, setRunning] = useState(false);
  const [stats, setStats] = useState({ queue: 0, max: 10, rejected: 0 });

  const addLog = useCallback((message: string, type?: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs((prev) => [...prev.slice(-19), { timestamp, message, type }]);
  }, []);

  const fetchStatus = useCallback(async () => {
    const res = await fetch(`${API_BASE}/queue/status`);
    const data = await res.json();
    setStats({
      queue: data.queue_depth || 0,
      max: data.max_queue_size || 10,
      rejected: data.stats?.queue_rejections || 0,
    });
  }, []);

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 500);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  const submitBurst = async () => {
    setRunning(true);
    addLog("Submitting burst of 15 jobs...");
    
    const res = await fetch(`${API_BASE}/queue/burst?count=15`, { method: "POST" });
    const data = await res.json();
    
    addLog(`Queued: ${data.queued}, Rejected: ${data.rejected}`, data.rejected > 0 ? "warning" : "success");
    if (data.rejected > 0) {
      addLog(`Backpressure! Queue full (max: ${data.max_queue_size})`, "error");
    }
    
    await fetchStatus();
    setRunning(false);
  };

  const reset = async () => {
    await fetch(`${API_BASE}/reset`, { method: "POST" });
    setLogs([]);
    await fetchStatus();
  };

  const queuePercent = (stats.queue / stats.max) * 100;

  return (
    <Section
      title="Queue Backpressure"
      description="When queue is full, new jobs are rejected. This protects the system from being overwhelmed."
      running={running}
      status={queuePercent >= 100 ? "error" : queuePercent > 50 ? "active" : "idle"}
      logs={logs}
    >
      <Button size="sm" disabled={running} onClick={submitBurst}>
        Burst (15 jobs)
      </Button>
      <Button size="sm" variant="outline" onClick={reset}>
        Reset
      </Button>
      <div className="w-full space-y-1">
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>Queue: {stats.queue}/{stats.max}</span>
          <span className="text-red-600">Rejected: {stats.rejected}</span>
        </div>
        <div className="h-2 rounded-full bg-muted overflow-hidden">
          <div 
            className={`h-full transition-all ${
              queuePercent >= 100 ? "bg-red-500" :
              queuePercent > 70 ? "bg-orange-500" :
              "bg-green-500"
            }`}
            style={{ width: `${Math.min(100, queuePercent)}%` }}
          />
        </div>
      </div>
    </Section>
  );
}

// ============ 4. Dead Letter Queue Demo ============

function DLQDemo() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [running, setRunning] = useState(false);
  const [dlqCount, setDlqCount] = useState(0);
  const [workersRunning, setWorkersRunning] = useState(false);

  const addLog = useCallback((message: string, type?: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs((prev) => [...prev.slice(-19), { timestamp, message, type }]);
  }, []);

  const fetchStatus = useCallback(async () => {
    const res = await fetch(`${API_BASE}/dlq/list`);
    const data = await res.json();
    setDlqCount(data.count || 0);
    
    const workerRes = await fetch(`${API_BASE}/workers/status`);
    const workerData = await workerRes.json();
    setWorkersRunning(workerData.running);
  }, []);

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 500);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  const submitFailingJob = async () => {
    setRunning(true);
    
    // Ensure workers are running
    if (!workersRunning) {
      await fetch(`${API_BASE}/workers/start`, { method: "POST" });
      addLog("Started workers");
    }
    
    const res = await fetch(`${API_BASE}/dlq/submit-failing`, { method: "POST" });
    const data = await res.json();
    
    addLog(`Submitted failing job ${data.job_id}`);
    addLog(`Will retry ${data.max_retries} times then go to DLQ`, "warning");
    
    // Wait for retries
    await new Promise(r => setTimeout(r, 4000));
    await fetchStatus();
    addLog(`Job moved to DLQ after ${data.max_retries} failures`, "error");
    
    setRunning(false);
  };

  const retryFromDLQ = async () => {
    const listRes = await fetch(`${API_BASE}/dlq/list`);
    const listData = await listRes.json();
    
    if (listData.jobs && listData.jobs.length > 0) {
      const jobId = listData.jobs[0].id;
      await fetch(`${API_BASE}/dlq/retry/${jobId}`, { method: "POST" });
      addLog(`Retrying job ${jobId} from DLQ`, "success");
      await fetchStatus();
    } else {
      addLog("No jobs in DLQ to retry", "warning");
    }
  };

  const clearDLQ = async () => {
    await fetch(`${API_BASE}/dlq/clear`, { method: "POST" });
    addLog("DLQ cleared");
    await fetchStatus();
  };

  const reset = async () => {
    await fetch(`${API_BASE}/reset`, { method: "POST" });
    setLogs([]);
    await fetchStatus();
  };

  return (
    <Section
      title="Dead Letter Queue (DLQ)"
      description="Jobs that fail repeatedly go to DLQ for investigation. Prevents poison messages from blocking the queue."
      running={running}
      status={dlqCount > 0 ? "error" : "idle"}
      logs={logs}
    >
      <Button size="sm" variant="destructive" disabled={running} onClick={submitFailingJob}>
        Submit Failing Job
      </Button>
      <Button size="sm" variant="outline" disabled={dlqCount === 0} onClick={retryFromDLQ}>
        Retry from DLQ
      </Button>
      <Button size="sm" variant="outline" disabled={dlqCount === 0} onClick={clearDLQ}>
        Clear DLQ
      </Button>
      <Button size="sm" variant="outline" onClick={reset}>
        Reset
      </Button>
      <div className="w-full text-center py-1.5 rounded bg-muted">
        <span className="text-xs text-muted-foreground">Dead Letter Queue: </span>
        <span className={`text-sm font-medium ${dlqCount > 0 ? "text-red-600" : "text-green-600"}`}>
          {dlqCount} job{dlqCount !== 1 ? "s" : ""}
        </span>
      </div>
    </Section>
  );
}

// ============ Main Page ============

export default function TasksPage() {
  const resetAll = async () => {
    await fetch(`${API_BASE}/reset`, { method: "POST" });
    window.location.reload();
  };

  return (
    <div className="space-y-4">
      <header className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Long Running Tasks</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Async job queues, worker pools, backpressure, and dead letter queues for reliable background processing.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={resetAll}>
          Reset All
        </Button>
      </header>

      <div className="grid gap-4 md:grid-cols-2">
        <SyncAsyncDemo />
        <WorkerPoolDemo />
        <BackpressureDemo />
        <DLQDemo />
      </div>
    </div>
  );
}

