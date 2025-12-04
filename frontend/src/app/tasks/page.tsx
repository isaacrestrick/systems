"use client";

import { useState, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { DemoSection } from "@/components/DemoSection";
import { useEventLog } from "@/lib/hooks";

const API_BASE = "http://localhost:8000/api/tasks";

// ============ 1. Sync vs Async Demo ============

function SyncAsyncDemo() {
  const [logs, addLog, clearLogs] = useEventLog();
  const [running, setRunning] = useState(false);

  const runSync = async () => {
    setRunning(true);
    addLog("Starting SYNC request (3s task)...");
    addLog("⏳ User waiting... browser blocked...", "warning");
    
    const start = Date.now();
    await fetch(`${API_BASE}/sync/process`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ duration_seconds: 3 }),
    });
    
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

  return (
    <DemoSection
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
      <Button size="sm" variant="outline" disabled={running} onClick={clearLogs}>
        Clear
      </Button>
    </DemoSection>
  );
}

// ============ 2. Worker Pool Demo ============

function WorkerPoolDemo() {
  const [logs, addLog, clearLogs] = useEventLog();
  const [running, setRunning] = useState(false);
  const [workersRunning, setWorkersRunning] = useState(false);
  const [workers, setWorkers] = useState<Array<{ id: string; status: string; jobs_processed: number }>>([]);
  const [stats, setStats] = useState({ queue: 0, completed: 0, processing: 0 });

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
    clearLogs();
    await fetchStatus();
  };

  return (
    <DemoSection
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
    </DemoSection>
  );
}

// ============ 3. Backpressure Demo ============

function BackpressureDemo() {
  const [logs, addLog, clearLogs] = useEventLog();
  const [running, setRunning] = useState(false);
  const [stats, setStats] = useState({ queue: 0, max: 10, rejected: 0 });

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
    clearLogs();
    await fetchStatus();
  };

  const queuePercent = (stats.queue / stats.max) * 100;

  return (
    <DemoSection
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
    </DemoSection>
  );
}

// ============ 4. Dead Letter Queue Demo ============

function DLQDemo() {
  const [logs, addLog, clearLogs] = useEventLog();
  const [running, setRunning] = useState(false);
  const [dlqCount, setDlqCount] = useState(0);
  const [workersRunning, setWorkersRunning] = useState(false);

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
    
    if (!workersRunning) {
      await fetch(`${API_BASE}/workers/start`, { method: "POST" });
      addLog("Started workers");
    }
    
    const res = await fetch(`${API_BASE}/dlq/submit-failing`, { method: "POST" });
    const data = await res.json();
    
    addLog(`Submitted failing job ${data.job_id}`);
    addLog(`Will retry ${data.max_retries} times then go to DLQ`, "warning");
    
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
    clearLogs();
    await fetchStatus();
  };

  return (
    <DemoSection
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
    </DemoSection>
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
