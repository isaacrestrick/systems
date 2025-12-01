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

interface LogEntry {
  timestamp: string;
  message: string;
}

type PatternType = "sse" | "websocket" | "polling" | "long-polling";

const patternColors: Record<PatternType, { bg: string; text: string; border: string }> = {
  sse: {
    bg: "bg-blue-500/10",
    text: "text-blue-600",
    border: "border-blue-500/20",
  },
  websocket: {
    bg: "bg-purple-500/10",
    text: "text-purple-600",
    border: "border-purple-500/20",
  },
  polling: {
    bg: "bg-amber-500/10",
    text: "text-amber-600",
    border: "border-amber-500/20",
  },
  "long-polling": {
    bg: "bg-emerald-500/10",
    text: "text-emerald-600",
    border: "border-emerald-500/20",
  },
};

function Section({
  title,
  description,
  running,
  onStart,
  onStop,
  logs,
  pattern,
}: {
  title: string;
  description: string;
  running: boolean;
  onStart: () => void;
  onStop: () => void;
  logs: LogEntry[];
  pattern: PatternType;
}) {
  const logsEndRef = useRef<HTMLDivElement>(null);
  const colors = patternColors[pattern];

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
                {running ? "Active" : "Idle"}
              </span>
            </div>
            <CardDescription className="text-sm leading-relaxed">
              {description}
            </CardDescription>
          </div>
          <Button
            onClick={running ? onStop : onStart}
            variant={running ? "destructive" : "default"}
            size="sm"
            className="shrink-0"
          >
            {running ? "Stop" : "Start"}
          </Button>
        </div>
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

export default function RealtimePage() {
  // SSE state
  const [sseRunning, setSseRunning] = useState(false);
  const [sseLogs, setSseLogs] = useState<LogEntry[]>([]);
  const sseRef = useRef<EventSource | null>(null);

  // WebSocket state
  const [wsRunning, setWsRunning] = useState(false);
  const [wsLogs, setWsLogs] = useState<LogEntry[]>([]);
  const wsRef = useRef<WebSocket | null>(null);

  // Polling state
  const [pollRunning, setPollRunning] = useState(false);
  const [pollLogs, setPollLogs] = useState<LogEntry[]>([]);
  const pollRef = useRef<NodeJS.Timeout | null>(null);

  // Long Polling state
  const [longPollRunning, setLongPollRunning] = useState(false);
  const [longPollLogs, setLongPollLogs] = useState<LogEntry[]>([]);
  const longPollAbortRef = useRef<AbortController | null>(null);

  const addLog = (
    setter: React.Dispatch<React.SetStateAction<LogEntry[]>>,
    message: string
  ) => {
    const timestamp = new Date().toLocaleTimeString();
    setter((prev) => [...prev.slice(-19), { timestamp, message }]);
  };

  // SSE handlers
  const startSse = useCallback(() => {
    const eventSource = new EventSource("/api/realtime/sse");
    sseRef.current = eventSource;
    setSseRunning(true);
    addLog(setSseLogs, "Connected to SSE stream");

    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.done) {
        addLog(setSseLogs, "Stream complete");
        eventSource.close();
        setSseRunning(false);
      } else {
        addLog(setSseLogs, `Count: ${data.count}, Time: ${data.timestamp}`);
      }
    };

    eventSource.onerror = () => {
      addLog(setSseLogs, "Connection error");
      eventSource.close();
      setSseRunning(false);
    };
  }, []);

  const stopSse = useCallback(() => {
    sseRef.current?.close();
    setSseRunning(false);
    addLog(setSseLogs, "Disconnected");
  }, []);

  // WebSocket handlers
  const startWs = useCallback(() => {
    const ws = new WebSocket("ws://localhost:8000/api/realtime/ws");
    wsRef.current = ws;

    ws.onopen = () => {
      setWsRunning(true);
      addLog(setWsLogs, "Connected to WebSocket");
      ws.send("Hello from client!");
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === "ping") {
        addLog(setWsLogs, `Ping received at ${data.timestamp}`);
      } else if (data.type === "echo") {
        addLog(setWsLogs, `Echo: "${data.message}" at ${data.timestamp}`);
      }
    };

    ws.onclose = () => {
      setWsRunning(false);
      addLog(setWsLogs, "Disconnected");
    };

    ws.onerror = () => {
      addLog(setWsLogs, "Connection error");
    };
  }, []);

  const stopWs = useCallback(() => {
    wsRef.current?.close();
    setWsRunning(false);
  }, []);

  // Polling handlers
  const startPolling = useCallback(() => {
    setPollRunning(true);
    addLog(setPollLogs, "Started polling (every 2s)");

    const poll = async () => {
      try {
        const res = await fetch("/api/realtime/poll");
        const data = await res.json();
        addLog(setPollLogs, `Value: ${data.value}, Time: ${data.timestamp}`);
      } catch {
        addLog(setPollLogs, "Poll failed");
      }
    };

    poll();
    pollRef.current = setInterval(poll, 2000);
  }, []);

  const stopPolling = useCallback(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    setPollRunning(false);
    addLog(setPollLogs, "Stopped polling");
  }, []);

  // Long Polling handlers
  const startLongPolling = useCallback(() => {
    setLongPollRunning(true);
    addLog(setLongPollLogs, "Started long polling");

    const longPoll = async () => {
      const controller = new AbortController();
      longPollAbortRef.current = controller;

      try {
        const res = await fetch("/api/realtime/long-poll", {
          signal: controller.signal,
        });
        const data = await res.json();
        addLog(
          setLongPollLogs,
          `Event: ${data.event}, waited ${data.waited_seconds}s`
        );
        if (longPollAbortRef.current === controller) {
          longPoll();
        }
      } catch (e) {
        if (e instanceof Error && e.name !== "AbortError") {
          addLog(setLongPollLogs, "Long poll failed");
        }
      }
    };

    longPoll();
  }, []);

  const stopLongPolling = useCallback(() => {
    longPollAbortRef.current?.abort();
    setLongPollRunning(false);
    addLog(setLongPollLogs, "Stopped long polling");
  }, []);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">
          Real-Time Communication Patterns
        </h1>
        <p className="mt-2 text-muted-foreground">
          Compare different approaches to real-time data streaming between client
          and server.
        </p>
      </header>

      <div className="grid gap-6 md:grid-cols-2">
        <Section
          title="Server-Sent Events"
          description="One-way server-to-client streaming over HTTP. Ideal for live feeds, notifications, and dashboards."
          running={sseRunning}
          onStart={startSse}
          onStop={stopSse}
          logs={sseLogs}
          pattern="sse"
        />

        <Section
          title="WebSocket"
          description="Full-duplex bidirectional communication. Best for chat, gaming, and collaborative apps."
          running={wsRunning}
          onStart={startWs}
          onStop={stopWs}
          logs={wsLogs}
          pattern="websocket"
        />

        <Section
          title="Polling"
          description="Client requests updates at fixed intervals (2s). Simple but less efficient for frequent updates."
          running={pollRunning}
          onStart={startPolling}
          onStop={stopPolling}
          logs={pollLogs}
          pattern="polling"
        />

        <Section
          title="Long Polling"
          description="Server holds request until data is available. Good fallback when WebSocket isn't an option."
          running={longPollRunning}
          onStart={startLongPolling}
          onStop={stopLongPolling}
          logs={longPollLogs}
          pattern="long-polling"
        />
      </div>
    </div>
  );
}
