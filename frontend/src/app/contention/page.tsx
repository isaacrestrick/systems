"use client";

import { useState, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { DemoSection } from "@/components/DemoSection";
import { useEventLog } from "@/lib/hooks";

const API_BASE = "http://localhost:8000/api/contention";

function PessimisticLockingDemo() {
  const [balance, setBalance] = useState(1000);
  const [lockedBy, setLockedBy] = useState<string | null>(null);
  const [logs, addLog, clearLogs] = useEventLog();
  const [loading, setLoading] = useState(false);

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
        addLog(`${clientId}: ${endpoint} succeeded`, "success");
      } else {
        addLog(`${clientId}: ${data.message || endpoint + " failed"}`, "error");
      }
      await fetchState();
    } catch {
      addLog(`${clientId}: ${endpoint} error`, "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <DemoSection
      title="Pessimistic Locking"
      description="SELECT ... FOR UPDATE locks rows before reading. Blocks other transactions until released."
      running={false}
      status={lockedBy ? "active" : "idle"}
      statusLabel={`$${balance} | Lock: ${lockedBy || "none"}`}
      logs={logs}
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
    </DemoSection>
  );
}

function OptimisticConcurrencyDemo() {
  const [quantity, setQuantity] = useState(100);
  const [version, setVersion] = useState(1);
  const [logs, addLog, clearLogs] = useEventLog();
  const [loading, setLoading] = useState(false);
  const [clientVersions, setClientVersions] = useState<Record<string, number>>({ "Client A": 1, "Client B": 1 });

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
        addLog(`${client}: Updated qty by ${change > 0 ? "+" : ""}${change}, now v${data.new_version}`, "success");
      } else {
        addLog(`${client}: ${data.message || "Update failed"}`, "error");
      }
      await fetchState();
    } catch {
      addLog(`${client}: Update error`, "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <DemoSection
      title="Optimistic Concurrency"
      description="Include version in updates. If it changed, retry. Good for low-contention scenarios."
      running={false}
      status="idle"
      statusLabel={`Qty: ${quantity} | v${version}`}
      logs={logs}
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
    </DemoSection>
  );
}

function DistributedLockDemo() {
  const [lockHolder, setLockHolder] = useState<string | null>(null);
  const [ttl, setTtl] = useState(0);
  const [logs, addLog, clearLogs] = useEventLog();
  const [loading, setLoading] = useState(false);

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
        addLog(`${client}: ${endpoint} succeeded`, "success");
      } else {
        addLog(`${client}: ${data.message || endpoint + " failed"}`, "error");
      }
      await fetchState();
    } catch {
      addLog(`${client}: ${endpoint} error`, "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <DemoSection
      title="Distributed Lock"
      description="Redis-style lock with TTL. Auto-expires to prevent deadlocks. Extend before expiry."
      running={!!lockHolder}
      status={lockHolder ? "active" : "idle"}
      statusLabel={lockHolder ? `${lockHolder} (${ttl.toFixed(1)}s)` : "Unlocked"}
      logs={logs}
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
    </DemoSection>
  );
}

function SagaPatternDemo() {
  const [logs, addLog, clearLogs] = useEventLog();
  const [running, setRunning] = useState(false);

  const runSaga = async (shouldFail: boolean) => {
    setRunning(true);
    const steps = ["Reserve inventory", "Charge payment", "Ship order"];
    const compensations = ["Release inventory", "Refund payment", "Cancel shipment"];

    try {
      for (let i = 0; i < steps.length; i++) {
        addLog(`Step ${i + 1}: ${steps[i]}...`);
        await new Promise((r) => setTimeout(r, 800));

        if (shouldFail && i === 1) {
          addLog(`Step ${i + 1}: FAILED`, "error");
          addLog("Starting compensation...", "warning");
          for (let j = i; j >= 0; j--) {
            await new Promise((r) => setTimeout(r, 500));
            addLog(`Compensate: ${compensations[j]}`, "warning");
          }
          addLog("Saga rolled back", "error");
          return;
        }
        addLog(`Step ${i + 1}: OK`, "success");
      }
      addLog("Saga completed successfully", "complete");
    } finally {
      setRunning(false);
    }
  };

  return (
    <DemoSection
      title="Saga Pattern"
      description="Break transactions into steps with compensating actions. Each step can be undone if later steps fail."
      running={running}
      status={running ? "active" : "idle"}
      statusLabel={running ? "Running..." : "Idle"}
      logs={logs}
    >
      <Button size="sm" variant="outline" disabled={running} onClick={() => runSaga(false)}>
        Run (Success)
      </Button>
      <Button size="sm" variant="outline" disabled={running} onClick={() => runSaga(true)}>
        Run (Fail at Step 2)
      </Button>
      <Button size="sm" variant="outline" disabled={running} onClick={clearLogs}>
        Clear
      </Button>
    </DemoSection>
  );
}

export default function ContentionPage() {
  const resetAll = async () => {
    await fetch(`${API_BASE}/reset`, { method: "POST" });
    window.location.reload();
  };

  return (
    <div className="space-y-4">
      <header className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Handling Contention
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Compare different strategies for managing concurrent access to shared resources.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={resetAll}>Reset All</Button>
      </header>

      <div className="grid gap-4 md:grid-cols-2">
        <PessimisticLockingDemo />
        <OptimisticConcurrencyDemo />
        <DistributedLockDemo />
        <SagaPatternDemo />
      </div>
    </div>
  );
}
