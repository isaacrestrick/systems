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

const API_BASE = "http://localhost:8000/api/contention";

interface LogEntry {
  timestamp: string;
  message: string;
}

function Section({
  title,
  description,
  children,
  logs,
  status,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
  logs: LogEntry[];
  status: string;
}) {
  const logsEndRef = useRef<HTMLDivElement>(null);

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
              <span className="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium bg-muted text-muted-foreground">
                {status}
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
                    className="flex gap-2 rounded px-1.5 py-0.5 hover:bg-muted"
                  >
                    <span className="shrink-0 text-muted-foreground">
                      {log.timestamp}
                    </span>
                    <span className="text-foreground">{log.message}</span>
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

function PessimisticLockingDemo() {
  const [balance, setBalance] = useState(1000);
  const [lockedBy, setLockedBy] = useState<string | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(false);

  const addLog = (message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs((prev) => [...prev.slice(-19), { timestamp, message }]);
  };

  const fetchState = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/pessimistic/state`);
      const data = await res.json();
      setBalance(data.balance);
      setLockedBy(data.locked_by);
    } catch {}
  }, []);

  useEffect(() => {
    fetchState();
    const interval = setInterval(fetchState, 1000);
    return () => clearInterval(interval);
  }, [fetchState]);

  const action = async (endpoint: string, clientId: string, body?: object) => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/pessimistic/${endpoint}${body ? "" : `?client_id=${encodeURIComponent(clientId)}`}`, {
        method: "POST",
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify({ ...body, client_id: clientId }) : undefined,
      });
      const data = await res.json();
      if (data.success) {
        addLog(`${clientId}: ${endpoint} succeeded`);
      } else {
        addLog(`${clientId}: ${data.message || endpoint + " failed"}`);
      }
      await fetchState();
    } catch {
      addLog(`${clientId}: ${endpoint} error`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Section
      title="Pessimistic Locking"
      description="SELECT ... FOR UPDATE locks rows before reading. Blocks other transactions until released."
      logs={logs}
      status={`$${balance} | Lock: ${lockedBy || "none"}`}
    >
      {["Client A", "Client B"].map((client) => {
        const isHolder = lockedBy === client;
        return (
          <div key={client} className="flex items-center gap-2 rounded border px-2 py-1">
            <span className="text-sm font-medium">{client}</span>
            <Button size="sm" variant="outline" disabled={loading || isHolder} onClick={() => action("lock", client)}>
              Lock
            </Button>
            <Button size="sm" variant="outline" disabled={loading || !isHolder} onClick={() => action("withdraw", client, { amount: 100 })}>
              -$100
            </Button>
            <Button size="sm" variant="outline" disabled={loading || !isHolder} onClick={() => action("release", client)}>
              Release
            </Button>
          </div>
        );
      })}
    </Section>
  );
}

function OptimisticConcurrencyDemo() {
  const [quantity, setQuantity] = useState(100);
  const [version, setVersion] = useState(1);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [clientVersions, setClientVersions] = useState<Record<string, number>>({ "Client A": 1, "Client B": 1 });

  const addLog = (message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs((prev) => [...prev.slice(-19), { timestamp, message }]);
  };

  const fetchState = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/optimistic/state`);
      const data = await res.json();
      setQuantity(data.quantity);
      setVersion(data.version);
    } catch {}
  }, []);

  useEffect(() => {
    fetchState();
    const interval = setInterval(fetchState, 1000);
    return () => clearInterval(interval);
  }, [fetchState]);

  const readVersion = (client: string) => {
    setClientVersions((prev) => ({ ...prev, [client]: version }));
    addLog(`${client}: Read version ${version}`);
  };

  const update = async (client: string, change: number) => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/optimistic/update`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ client_id: client, quantity_change: change, expected_version: clientVersions[client] }),
      });
      const data = await res.json();
      if (data.success) {
        setClientVersions((prev) => ({ ...prev, [client]: data.new_version }));
        addLog(`${client}: Updated qty by ${change > 0 ? "+" : ""}${change}, now v${data.new_version}`);
      } else {
        addLog(`${client}: ${data.message || "Update failed"}`);
      }
      await fetchState();
    } catch {
      addLog(`${client}: Update error`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Section
      title="Optimistic Concurrency"
      description="Include version in updates. If it changed, retry. Good for low-contention scenarios."
      logs={logs}
      status={`Qty: ${quantity} | v${version}`}
    >
      {["Client A", "Client B"].map((client) => {
        const cv = clientVersions[client];
        const stale = cv !== version;
        return (
          <div key={client} className="flex items-center gap-2 rounded border px-2 py-1">
            <span className="text-sm font-medium">{client}</span>
            <span className={`text-xs ${stale ? "text-destructive" : "text-muted-foreground"}`}>v{cv}{stale && "*"}</span>
            <Button size="sm" variant="outline" onClick={() => readVersion(client)}>Read</Button>
            <Button size="sm" variant="outline" disabled={loading} onClick={() => update(client, -10)}>-10</Button>
            <Button size="sm" variant="outline" disabled={loading} onClick={() => update(client, 10)}>+10</Button>
          </div>
        );
      })}
    </Section>
  );
}

function DistributedLockDemo() {
  const [lockHolder, setLockHolder] = useState<string | null>(null);
  const [ttl, setTtl] = useState(0);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(false);

  const addLog = (message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs((prev) => [...prev.slice(-19), { timestamp, message }]);
  };

  const fetchState = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/distributed/state`);
      const data = await res.json();
      setLockHolder(data.lock?.holder || null);
      setTtl(data.lock?.ttl_remaining || 0);
    } catch {}
  }, []);

  useEffect(() => {
    fetchState();
    const interval = setInterval(fetchState, 500);
    return () => clearInterval(interval);
  }, [fetchState]);

  const action = async (endpoint: string, client: string) => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/distributed/${endpoint}?client_id=${encodeURIComponent(client)}${endpoint === "acquire" ? "&ttl=10" : endpoint === "work" ? "&duration=3" : ""}`, { method: "POST" });
      const data = await res.json();
      if (data.success) {
        addLog(`${client}: ${endpoint} succeeded`);
      } else {
        addLog(`${client}: ${data.message || endpoint + " failed"}`);
      }
      await fetchState();
    } catch {
      addLog(`${client}: ${endpoint} error`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Section
      title="Distributed Lock"
      description="Redis-style lock with TTL. Auto-expires to prevent deadlocks. Extend before expiry."
      logs={logs}
      status={lockHolder ? `${lockHolder} (${ttl.toFixed(1)}s)` : "Unlocked"}
    >
      {["Client A", "Client B"].map((client) => {
        const isHolder = lockHolder === client;
        return (
          <div key={client} className="flex items-center gap-2 rounded border px-2 py-1">
            <span className="text-sm font-medium">{client}</span>
            <Button size="sm" variant="outline" disabled={loading} onClick={() => action("acquire", client)}>
              {isHolder ? "Extend" : "Lock"}
            </Button>
            <Button size="sm" variant="outline" disabled={loading || !isHolder} onClick={() => action("work", client)}>
              Work
            </Button>
            <Button size="sm" variant="outline" disabled={loading || !isHolder} onClick={() => action("release", client)}>
              Release
            </Button>
          </div>
        );
      })}
    </Section>
  );
}

function SagaPatternDemo() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [running, setRunning] = useState(false);

  const addLog = (message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs((prev) => [...prev.slice(-19), { timestamp, message }]);
  };

  const runSaga = async (shouldFail: boolean) => {
    setRunning(true);
    const steps = ["Reserve inventory", "Charge payment", "Ship order"];
    const compensations = ["Release inventory", "Refund payment", "Cancel shipment"];

    try {
      for (let i = 0; i < steps.length; i++) {
        addLog(`Step ${i + 1}: ${steps[i]}...`);
        await new Promise((r) => setTimeout(r, 800));

        if (shouldFail && i === 1) {
          addLog(`Step ${i + 1}: FAILED`);
          addLog("Starting compensation...");
          for (let j = i; j >= 0; j--) {
            await new Promise((r) => setTimeout(r, 500));
            addLog(`Compensate: ${compensations[j]}`);
          }
          addLog("Saga rolled back");
          return;
        }
        addLog(`Step ${i + 1}: OK`);
      }
      addLog("Saga completed successfully");
    } finally {
      setRunning(false);
    }
  };

  return (
    <Section
      title="Saga Pattern"
      description="Break transactions into steps with compensating actions. Each step can be undone if later steps fail."
      logs={logs}
      status={running ? "Running..." : "Idle"}
    >
      <Button size="sm" variant="outline" disabled={running} onClick={() => runSaga(false)}>
        Run (Success)
      </Button>
      <Button size="sm" variant="outline" disabled={running} onClick={() => runSaga(true)}>
        Run (Fail at Step 2)
      </Button>
      <Button size="sm" variant="outline" disabled={running} onClick={() => setLogs([])}>
        Clear
      </Button>
    </Section>
  );
}

export default function ContentionPage() {
  const resetAll = async () => {
    await fetch(`${API_BASE}/reset`, { method: "POST" });
    window.location.reload();
  };

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            Handling Contention
          </h1>
          <p className="mt-2 text-muted-foreground">
            Compare different strategies for managing concurrent access to shared resources.
          </p>
        </div>
        <Button variant="outline" onClick={resetAll}>Reset All</Button>
      </header>

      <div className="grid gap-6 md:grid-cols-2">
        <PessimisticLockingDemo />
        <OptimisticConcurrencyDemo />
        <DistributedLockDemo />
        <SagaPatternDemo />
      </div>
    </div>
  );
}
