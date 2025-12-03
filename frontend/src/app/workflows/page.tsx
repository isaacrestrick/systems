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

const API_BASE = "http://localhost:8000/api/workflows";

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
                      log.type === "success" || log.type === "complete" ? "text-green-600" :
                      log.type === "compensate" || log.type === "rollback_start" ? "text-orange-600" : ""
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

// ============ Saga Pattern Demo ============

function SagaDemo() {
  const [workflowId, setWorkflowId] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState<"active" | "idle" | "error">("idle");
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [steps, setSteps] = useState<Array<{ name: string; status: string }>>([]);

  const addLog = useCallback((message: string, type?: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs((prev) => [...prev.slice(-19), { timestamp, message, type }]);
  }, []);

  const startSaga = async (failAt: number | null) => {
    setLogs([]);
    setRunning(true);
    setStatus("active");

    const res = await fetch(`${API_BASE}/saga/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fail_at_step: failAt }),
    });
    const data = await res.json();
    setWorkflowId(data.workflow_id);
    addLog(`Started saga ${data.workflow_id}`, "start");

    // Run steps automatically
    let continueRunning = true;
    while (continueRunning) {
      await new Promise((r) => setTimeout(r, 100));

      const stepRes = await fetch(`${API_BASE}/saga/${data.workflow_id}/step`, {
        method: "POST",
      });
      const stepData = await stepRes.json();

      // Fetch current state
      const stateRes = await fetch(`${API_BASE}/saga/${data.workflow_id}`);
      const state = await stateRes.json();

      if (state.workflow) {
        setSteps(state.workflow.steps);
      }

      // Add logs from server
      if (state.logs) {
        const serverLogs = state.logs.map((l: { timestamp: number; event: string; type: string }) => ({
          timestamp: new Date(l.timestamp * 1000).toLocaleTimeString(),
          message: l.event,
          type: l.type,
        }));
        setLogs(serverLogs);
      }

      if (stepData.status === "completed" || stepData.status === "already_completed") {
        setStatus("idle");
        continueRunning = false;
      } else if (stepData.status === "already_rolled_back" || state.workflow?.status === "rolled_back") {
        setStatus("error");
        continueRunning = false;
      }
    }

    setRunning(false);
  };

  const reset = () => {
    setWorkflowId(null);
    setLogs([]);
    setSteps([]);
    setStatus("idle");
  };

  return (
    <Section
      title="Saga Pattern"
      description="Multi-step transaction with compensating actions. If a step fails, previous steps are rolled back in reverse order."
      running={running}
      status={status}
      logs={logs}
    >
      <Button size="sm" disabled={running} onClick={() => startSaga(null)}>
        Run (Success)
      </Button>
      <Button size="sm" variant="outline" disabled={running} onClick={() => startSaga(1)}>
        Fail Step 2
      </Button>
      <Button size="sm" variant="outline" disabled={running} onClick={() => startSaga(2)}>
        Fail Step 3
      </Button>
      <Button size="sm" variant="outline" disabled={running} onClick={reset}>
        Reset
      </Button>
      {steps.length > 0 && (
        <div className="w-full flex gap-1">
          {steps.map((step, i) => (
            <div
              key={i}
              className={`flex-1 text-center text-xs py-1 rounded ${
                step.status === "completed" ? "bg-green-500/20 text-green-700" :
                step.status === "failed" ? "bg-red-500/20 text-red-700" :
                step.status === "compensated" ? "bg-orange-500/20 text-orange-700" :
                step.status === "running" || step.status === "compensating" ? "bg-blue-500/20 text-blue-700" :
                "bg-muted text-muted-foreground"
              }`}
              title={step.name}
            >
              {i + 1}
            </div>
          ))}
        </div>
      )}
    </Section>
  );
}

// ============ Event Sourcing Demo ============

function EventSourcingDemo() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [events, setEvents] = useState<Array<{ type: string; data: { amount: number }; version: number }>>([]);
  const [balance, setBalance] = useState(0);
  const [running, setRunning] = useState(false);
  const aggregateId = "account-1";

  const addLog = useCallback((message: string, type?: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs((prev) => [...prev.slice(-19), { timestamp, message, type }]);
  }, []);

  const fetchState = useCallback(async () => {
    const res = await fetch(`${API_BASE}/events/${aggregateId}`);
    const data = await res.json();
    setEvents(data.events || []);
    setBalance(data.projection?.balance || 0);
  }, []);

  useEffect(() => {
    fetchState();
  }, [fetchState]);

  const appendEvent = async (type: string, amount: number) => {
    setRunning(true);
    await fetch(`${API_BASE}/events/append`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        aggregate_id: aggregateId,
        event_type: type,
        data: { amount },
      }),
    });
    addLog(`Event: ${type} $${amount}`, "success");
    await fetchState();
    setRunning(false);
  };

  const replay = async () => {
    setRunning(true);
    addLog("Replaying events from log...", "start");
    const res = await fetch(`${API_BASE}/events/${aggregateId}/replay`, { method: "POST" });
    const data = await res.json();
    for (const step of data.replay_log || []) {
      addLog(`Replay: ${step.event} $${step.amount} → Balance: $${step.balance_after}`);
      await new Promise((r) => setTimeout(r, 300));
    }
    addLog(`Projection rebuilt: $${data.final_projection?.balance}`, "complete");
    await fetchState();
    setRunning(false);
  };

  const clear = async () => {
    await fetch(`${API_BASE}/events/${aggregateId}`, { method: "DELETE" });
    setLogs([]);
    setEvents([]);
    setBalance(0);
  };

  return (
    <Section
      title="Event Sourcing"
      description="Store events instead of state. Replay events to rebuild current state. Perfect audit trail."
      running={running}
      status={running ? "active" : "idle"}
      logs={logs}
    >
      <Button size="sm" disabled={running} onClick={() => appendEvent("deposit", 100)}>
        Deposit $100
      </Button>
      <Button size="sm" variant="outline" disabled={running} onClick={() => appendEvent("withdraw", 30)}>
        Withdraw $30
      </Button>
      <Button size="sm" variant="outline" disabled={running || events.length === 0} onClick={replay}>
        Replay
      </Button>
      <Button size="sm" variant="outline" disabled={running} onClick={clear}>
        Reset
      </Button>
      <div className="w-full flex items-center justify-between text-sm">
        <span className="text-muted-foreground">{events.length} events</span>
        <span className="font-mono font-bold">Balance: ${balance}</span>
      </div>
    </Section>
  );
}

// ============ Durable Execution Demo ============

function DurableExecutionDemo() {
  const [workflowId, setWorkflowId] = useState<string | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [running, setRunning] = useState(false);
  const [history, setHistory] = useState<Array<{ step: string }>>([]);
  const [crashed, setCrashed] = useState(false);

  const steps = ["Validate Order", "Process Payment", "Update Inventory", "Send Notification"];

  const addLog = useCallback((message: string, type?: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs((prev) => [...prev.slice(-19), { timestamp, message, type }]);
  }, []);

  const startWorkflow = async () => {
    setLogs([]);
    setHistory([]);
    setCrashed(false);
    setRunning(true);

    const res = await fetch(`${API_BASE}/durable/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ steps }),
    });
    const data = await res.json();
    setWorkflowId(data.workflow_id);
    addLog(`Started workflow ${data.workflow_id}`, "start");
    setRunning(false);
  };

  const executeStep = async (simulateCrash: boolean = false) => {
    if (!workflowId) return;
    setRunning(true);

    const res = await fetch(
      `${API_BASE}/durable/${workflowId}/execute?crash_after=${simulateCrash}`,
      { method: "POST" }
    );
    const data = await res.json();

    if (data.status === "crashed") {
      addLog(`Step completed, then CRASHED!`, "error");
      addLog(`State preserved in history`, "success");
      setCrashed(true);
      setHistory(data.history || []);
    } else if (data.status === "step_completed") {
      addLog(`Completed: ${data.step}`, "success");
      setHistory((prev) => [...prev, { step: data.step }]);
      if (data.remaining === 0) {
        addLog("Workflow completed!", "complete");
      }
    } else if (data.status === "completed") {
      addLog("Workflow already completed", "complete");
    }

    setRunning(false);
  };

  const recover = async () => {
    if (!workflowId) return;
    setRunning(true);

    const res = await fetch(`${API_BASE}/durable/${workflowId}/recover`, { method: "POST" });
    const data = await res.json();

    addLog(`Recovered! ${data.completed_steps} steps in history`, "success");
    addLog(`Next step: ${data.next_step || "none"}`, "start");
    setCrashed(false);
    setHistory(data.history || []);
    setRunning(false);
  };

  const reset = () => {
    setWorkflowId(null);
    setLogs([]);
    setHistory([]);
    setCrashed(false);
  };

  return (
    <Section
      title="Durable Execution"
      description="Workflow state survives crashes. History enables replay-based recovery without re-executing completed steps."
      running={running}
      status={crashed ? "error" : running ? "active" : "idle"}
      logs={logs}
    >
      {!workflowId ? (
        <Button size="sm" onClick={startWorkflow}>
          Start Workflow
        </Button>
      ) : (
        <>
          <Button size="sm" disabled={running || crashed} onClick={() => executeStep(false)}>
            Execute Step
          </Button>
          <Button size="sm" variant="outline" disabled={running || crashed} onClick={() => executeStep(true)}>
            Execute + Crash
          </Button>
          {crashed && (
            <Button size="sm" variant="default" onClick={recover}>
              Recover
            </Button>
          )}
          <Button size="sm" variant="outline" disabled={running} onClick={reset}>
            Reset
          </Button>
        </>
      )}
      {workflowId && (
        <div className="w-full flex gap-1">
          {steps.map((step, i) => (
            <div
              key={i}
              className={`flex-1 text-center text-xs py-1 rounded truncate px-1 ${
                i < history.length ? "bg-green-500/20 text-green-700" :
                crashed && i === history.length ? "bg-red-500/20 text-red-700" :
                "bg-muted text-muted-foreground"
              }`}
              title={step}
            >
              {i + 1}
            </div>
          ))}
        </div>
      )}
    </Section>
  );
}

// ============ Workflow Comparison Demo ============

function ComparisonDemo() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [running, setRunning] = useState(false);

  const addLog = useCallback((message: string, type?: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs((prev) => [...prev.slice(-19), { timestamp, message, type }]);
  }, []);

  const simulateNaive = async () => {
    setLogs([]);
    setRunning(true);

    addLog("Starting naive orchestration...", "start");
    await new Promise((r) => setTimeout(r, 500));
    addLog("Step 1: Charge payment... OK");
    await new Promise((r) => setTimeout(r, 500));
    addLog("Step 2: Reserve inventory... OK");
    await new Promise((r) => setTimeout(r, 500));
    addLog("Step 3: SERVER CRASHED!", "error");
    await new Promise((r) => setTimeout(r, 300));
    addLog("Server restarted...");
    addLog("No record of partial work!", "error");
    addLog("Customer charged but no order!", "error");

    setRunning(false);
  };

  const simulateWorkflow = async () => {
    setLogs([]);
    setRunning(true);

    addLog("Starting workflow orchestration...", "start");
    await new Promise((r) => setTimeout(r, 500));
    addLog("Step 1: Charge payment... OK (saved to history)");
    await new Promise((r) => setTimeout(r, 500));
    addLog("Step 2: Reserve inventory... OK (saved to history)");
    await new Promise((r) => setTimeout(r, 500));
    addLog("Step 3: SERVER CRASHED!", "error");
    await new Promise((r) => setTimeout(r, 300));
    addLog("Server restarted...");
    addLog("Recovering from history...", "start");
    await new Promise((r) => setTimeout(r, 300));
    addLog("Found 2 completed steps in history", "success");
    addLog("Resuming from step 3...");
    await new Promise((r) => setTimeout(r, 500));
    addLog("Step 3: Ship order... OK", "success");
    addLog("Workflow completed!", "complete");

    setRunning(false);
  };

  return (
    <Section
      title="Naive vs Workflow"
      description="Compare what happens when a server crashes during a multi-step process."
      running={running}
      status={running ? "active" : "idle"}
      logs={logs}
    >
      <Button size="sm" variant="destructive" disabled={running} onClick={simulateNaive}>
        Naive (Fails)
      </Button>
      <Button size="sm" disabled={running} onClick={simulateWorkflow}>
        Workflow (Recovers)
      </Button>
      <Button size="sm" variant="outline" disabled={running} onClick={() => setLogs([])}>
        Reset
      </Button>
    </Section>
  );
}

// ============ Main Page ============

export default function WorkflowsPage() {
  const resetAll = async () => {
    await fetch(`${API_BASE}/reset`, { method: "POST" });
    window.location.reload();
  };

  return (
    <div className="space-y-4">
      <header className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Multi-Step Processes
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Patterns for reliable, long-running distributed workflows that survive failures.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={resetAll}>Reset All</Button>
      </header>

      <div className="grid gap-4 md:grid-cols-2">
        <SagaDemo />
        <EventSourcingDemo />
        <DurableExecutionDemo />
        <ComparisonDemo />
      </div>
    </div>
  );
}
