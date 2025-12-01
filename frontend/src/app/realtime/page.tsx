"use client";

import { useState, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface LogEntry {
  timestamp: string;
  message: string;
}

function Section({
  title,
  description,
  running,
  onStart,
  onStop,
  logs,
}: {
  title: string;
  description: string;
  running: boolean;
  onStart: () => void;
  onStop: () => void;
  logs: LogEntry[];
}) {
  return (
    <Card className="flex flex-col">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 p-3 pb-2">
        <div className="min-w-0 flex-1">
          <CardTitle className="text-base">{title}</CardTitle>
          <CardDescription className="text-xs truncate">{description}</CardDescription>
        </div>
        <div className="flex items-center gap-2 ml-2">
          <span
            className={`h-2 w-2 rounded-full ${
              running ? "bg-green-500" : "bg-muted"
            }`}
          />
          <Button
            onClick={running ? onStop : onStart}
            variant={running ? "destructive" : "default"}
            size="sm"
          >
            {running ? "Stop" : "Start"}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-3 pt-0">
        <div className="h-24 overflow-y-auto rounded-md bg-muted p-2 font-mono text-xs">
          {logs.length === 0 ? (
            <span className="text-muted-foreground">No messages yet...</span>
          ) : (
            logs.map((log, i) => (
              <div key={i}>
                <span className="text-muted-foreground">[{log.timestamp}]</span>{" "}
                {log.message}
              </div>
            ))
          )}
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
    <div>
      <h1 className="mb-1 text-2xl font-bold">Real-Time Updates</h1>
        <p className="mb-4 text-sm text-muted-foreground">
          Comparing SSE, WebSocket, Polling, and Long Polling patterns
        </p>

        <div className="grid grid-cols-2 gap-4">
          <Section
            title="Server-Sent Events (SSE)"
            description="Server pushes events to client over HTTP. One-way communication."
            running={sseRunning}
            onStart={startSse}
            onStop={stopSse}
            logs={sseLogs}
          />

          <Section
            title="WebSocket"
            description="Full-duplex communication. Connects directly to backend (port 8000)."
            running={wsRunning}
            onStart={startWs}
            onStop={stopWs}
            logs={wsLogs}
          />

          <Section
            title="Polling"
            description="Client repeatedly requests updates at fixed intervals (2s)."
            running={pollRunning}
            onStart={startPolling}
            onStop={stopPolling}
            logs={pollLogs}
          />

          <Section
            title="Long Polling"
            description="Client request held open until server has data or timeout."
            running={longPollRunning}
            onStart={startLongPolling}
            onStop={stopLongPolling}
            logs={longPollLogs}
          />
        </div>
      </div>
  );
}
