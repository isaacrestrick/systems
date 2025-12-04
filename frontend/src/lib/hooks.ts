import { useState, useCallback } from "react";
import type { LogEntry } from "@/components/DemoSection";

/**
 * Hook for managing event logs in demo sections.
 * Provides a logs array and an addLog function that auto-timestamps entries.
 * 
 * @param maxLogs - Maximum number of logs to keep (default: 20)
 * @returns [logs, addLog, clearLogs]
 */
export function useEventLog(maxLogs: number = 20) {
  const [logs, setLogs] = useState<LogEntry[]>([]);

  const addLog = useCallback((message: string, type?: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs((prev) => [...prev.slice(-(maxLogs - 1)), { timestamp, message, type }]);
  }, [maxLogs]);

  const clearLogs = useCallback(() => {
    setLogs([]);
  }, []);

  return [logs, addLog, clearLogs] as const;
}

