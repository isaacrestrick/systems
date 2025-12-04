"use client";

import { useRef, useEffect } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

// ============ Shared Types ============

export interface LogEntry {
  timestamp: string;
  message: string;
  type?: string;
}

export type StatusType = "active" | "idle" | "error";

// ============ Status Colors ============

const statusColors: Record<StatusType, { bg: string; text: string; border: string }> = {
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

// ============ Log Type Colors ============
// Consolidated from all pages - covers all use cases

const logTypeColors: Record<string, string> = {
  // Errors
  error: "text-red-600",
  rejected: "text-red-600",
  dropped: "text-red-500",
  
  // Success
  success: "text-green-600",
  complete: "text-green-600",
  completed: "text-green-600",
  cache: "text-green-600",
  fast: "text-green-600",
  
  // Warnings / In-progress
  warning: "text-orange-600",
  miss: "text-orange-600",
  slow: "text-orange-600",
  compensate: "text-orange-600",
  rollback_start: "text-orange-600",
  retry: "text-orange-600",
  
  // Info
  info: "text-blue-600",
};

function getLogColor(type?: string): string {
  if (!type) return "";
  return logTypeColors[type] || "";
}

// ============ DemoSection Component ============

interface DemoSectionProps {
  title: string;
  description: string;
  running: boolean;
  status: StatusType;
  children: React.ReactNode;
  logs: LogEntry[];
  /** Optional custom status label (defaults to Running/Failed/Idle) */
  statusLabel?: string;
}

export function DemoSection({
  title,
  description,
  running,
  status,
  children,
  logs,
  statusLabel,
}: DemoSectionProps) {
  const logsEndRef = useRef<HTMLDivElement>(null);
  const colors = statusColors[status];

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  const defaultStatusLabel = running 
    ? "Running" 
    : status === "error" 
      ? "Failed" 
      : "Idle";

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
                {statusLabel || defaultStatusLabel}
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
                    className={`flex gap-2 rounded px-1.5 py-0.5 hover:bg-muted ${getLogColor(log.type)}`}
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

