"use client";

import { useState, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { DemoSection, LogEntry } from "@/components/DemoSection";
import { useEventLog } from "@/lib/hooks";

const API_BASE = "http://localhost:8000/api/workflows";

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
    addLog(`Started saga ${data.workflow_id}`);

    let continueRunning = true;
    while (continueRunning) {
      await new Promise((r) => setTimeout(r, 100));

      const stepRes = await fetch(`${API_BASE}/saga/${data.workflow_id}/step`, {
        method: "POST",
      });
      const stepData = await stepRes.json();

      const stateRes = await fetch(`${API_BASE}/saga/${data.workflow_id}`);
      const state = await stateRes.json();

      if (state.workflow) {
        setSteps(state.workflow.steps);
      }

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
    <DemoSection
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
    </DemoSection>
  );
}

// ============ Event Sourcing Demo ============

function EventSourcingDemo() {
  const [logs, addLog, clearLogs] = useEventLog();
  const [events, setEvents] = useState<Array<{ type: string; data: { amount: number }; version: number }>>([]);
  const [balance, setBalance] = useState(0);
  const [running, setRunning] = useState(false);
  const aggregateId = "account-1";

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
    addLog("Replaying events from log...");
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
    clearLogs();
    setEvents([]);
    setBalance(0);
  };

  return (
    <DemoSection
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
    </DemoSection>
  );
}

// ============ Durable Execution Demo ============

function DurableExecutionDemo() {
  const [workflowId, setWorkflowId] = useState<string | null>(null);
  const [logs, addLog, clearLogs] = useEventLog();
  const [running, setRunning] = useState(false);
  const [history, setHistory] = useState<Array<{ step: string }>>([]);
  const [crashed, setCrashed] = useState(false);

  const steps = ["Validate Order", "Process Payment", "Update Inventory", "Send Notification"];

  const startWorkflow = async () => {
    clearLogs();
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
    addLog(`Started workflow ${data.workflow_id}`);
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
    addLog(`Next step: ${data.next_step || "none"}`);
    setCrashed(false);
    setHistory(data.history || []);
    setRunning(false);
  };

  const reset = () => {
    setWorkflowId(null);
    clearLogs();
    setHistory([]);
    setCrashed(false);
  };

  return (
    <DemoSection
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
    </DemoSection>
  );
}

// ============ Workflow Comparison Demo ============

function ComparisonDemo() {
  const [logs, addLog, clearLogs] = useEventLog();
  const [running, setRunning] = useState(false);

  const simulateNaive = async () => {
    clearLogs();
    setRunning(true);

    addLog("Starting naive orchestration...");
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
    clearLogs();
    setRunning(true);

    addLog("Starting workflow orchestration...");
    await new Promise((r) => setTimeout(r, 500));
    addLog("Step 1: Charge payment... OK (saved to history)");
    await new Promise((r) => setTimeout(r, 500));
    addLog("Step 2: Reserve inventory... OK (saved to history)");
    await new Promise((r) => setTimeout(r, 500));
    addLog("Step 3: SERVER CRASHED!", "error");
    await new Promise((r) => setTimeout(r, 300));
    addLog("Server restarted...");
    addLog("Recovering from history...");
    await new Promise((r) => setTimeout(r, 300));
    addLog("Found 2 completed steps in history", "success");
    addLog("Resuming from step 3...");
    await new Promise((r) => setTimeout(r, 500));
    addLog("Step 3: Ship order... OK", "success");
    addLog("Workflow completed!", "complete");

    setRunning(false);
  };

  return (
    <DemoSection
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
      <Button size="sm" variant="outline" disabled={running} onClick={clearLogs}>
        Reset
      </Button>
    </DemoSection>
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
