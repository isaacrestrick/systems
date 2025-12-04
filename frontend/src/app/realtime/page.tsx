"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { DemoSection, LogEntry } from "@/components/DemoSection";

export default function RealtimePage() {

  /* SSE state */
  const [sseRunning, setSseRunning] = useState(false);
  const [sseLogs, setSseLogs] = useState<LogEntry[]>([]);
  const sseRef = useRef<EventSource | null>(null);

  /* WebSocket state */
  const [wsRunning, setWsRunning] = useState(false);
  const [wsLogs, setWsLogs] = useState<LogEntry[]>([]);
  const wsRef = useRef<WebSocket | null>(null);

  /* Polling state */
  const [pollRunning, setPollRunning] = useState(false);
  const [pollLogs, setPollLogs] = useState<LogEntry[]>([]);
  const pollRef = useRef<NodeJS.Timeout | null>(null);

  /* Long Polling state */
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
    if (longPollRunning) return;

    const controller = new AbortController();
    longPollAbortRef.current = controller;
    setLongPollRunning(true);
    addLog(setLongPollLogs, "Started long polling");

    const longPoll = async () => {
      while (!controller.signal.aborted) {
        try {
          const res = await fetch("/api/realtime/long-poll", {
            signal: controller.signal,
          });

          if (controller.signal.aborted) break;

          const data = await res.json();
          if (controller.signal.aborted) break;

          addLog(
            setLongPollLogs,
            `Event: ${data.event}, waited ${data.waited_seconds}s`
          );
        } catch (e) {
          if (e instanceof Error && e.name === "AbortError") {
            break;
          }
          addLog(setLongPollLogs, "Long poll failed; stopping");
          setLongPollRunning(false);
          longPollAbortRef.current = null;
          return;
        }
      }
    };

    longPoll();
  }, [longPollRunning]);

  const stopLongPolling = useCallback(() => {
    if (!longPollAbortRef.current) return;
    longPollAbortRef.current.abort();
    longPollAbortRef.current = null;
    setLongPollRunning(false);
    addLog(setLongPollLogs, "Stopped long polling");
  }, []);

  useEffect(() => {
    return () => {
      stopLongPolling();
    };
  }, [stopLongPolling]);

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
        <DemoSection
          title="Server-Sent Events"
          description="One-way server-to-client streaming over HTTP. Ideal for live feeds, notifications, and dashboards."
          running={sseRunning}
          status={sseRunning ? "active" : "idle"}
          statusLabel={sseRunning ? "Active" : "Idle"}
          logs={sseLogs}
        >
          <Button
            size="sm"
            variant={sseRunning ? "destructive" : "default"}
            onClick={sseRunning ? stopSse : startSse}
          >
            {sseRunning ? "Stop" : "Start"}
          </Button>
        </DemoSection>

        <DemoSection
          title="WebSocket"
          description="Full-duplex bidirectional communication. Best for chat, gaming, and collaborative apps."
          running={wsRunning}
          status={wsRunning ? "active" : "idle"}
          statusLabel={wsRunning ? "Active" : "Idle"}
          logs={wsLogs}
        >
          <Button
            size="sm"
            variant={wsRunning ? "destructive" : "default"}
            onClick={wsRunning ? stopWs : startWs}
          >
            {wsRunning ? "Stop" : "Start"}
          </Button>
        </DemoSection>

        <DemoSection
          title="Polling"
          description="Client requests updates at fixed intervals (2s). Simple but less efficient for frequent updates."
          running={pollRunning}
          status={pollRunning ? "active" : "idle"}
          statusLabel={pollRunning ? "Active" : "Idle"}
          logs={pollLogs}
        >
          <Button
            size="sm"
            variant={pollRunning ? "destructive" : "default"}
            onClick={pollRunning ? stopPolling : startPolling}
          >
            {pollRunning ? "Stop" : "Start"}
          </Button>
        </DemoSection>

        <DemoSection
          title="Long Polling"
          description="Server holds request until data is available. Good fallback when WebSocket isn't an option."
          running={longPollRunning}
          status={longPollRunning ? "active" : "idle"}
          statusLabel={longPollRunning ? "Active" : "Idle"}
          logs={longPollLogs}
        >
          <Button
            size="sm"
            variant={longPollRunning ? "destructive" : "default"}
            onClick={longPollRunning ? stopLongPolling : startLongPolling}
          >
            {longPollRunning ? "Stop" : "Start"}
          </Button>
        </DemoSection>
      </div>
    </div>
  );
}
