"use client";

import { useEffect, useState } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

export type BackendStatus = "checking" | "ok" | "down";

export function useBackendStatus(): BackendStatus {
  const [status, setStatus] = useState<BackendStatus>("checking");

  useEffect(() => {
    let cancelled = false;

    async function check() {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 3000);
      try {
        const r = await fetch(`${API_BASE}/health`, { signal: controller.signal });
        if (!cancelled) setStatus(r.ok ? "ok" : "down");
      } catch {
        if (!cancelled) setStatus("down");
      } finally {
        clearTimeout(timer);
      }
    }

    void check();
    const id = setInterval(() => void check(), 30000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  return status;
}
