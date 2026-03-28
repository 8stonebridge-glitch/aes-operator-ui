"use client";

import { useEffect, useState, useCallback } from "react";
import { api, type ServiceStatus } from "@/lib/api";

export function ServiceStatusBar() {
  const [services, setServices] = useState<ServiceStatus[] | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);

  const checkServices = useCallback(async () => {
    try {
      const res = await api.servicesStatus();
      setServices(res.services);
      setError(false);
    } catch {
      setError(true);
    }
  }, []);

  const loadAllServices = useCallback(async () => {
    setLoading(true);
    try {
      await api.loadServices();
      // Re-check after loading
      await checkServices();
    } catch {
      // Still re-check to show current state
      await checkServices();
    } finally {
      setLoading(false);
    }
  }, [checkServices]);

  useEffect(() => {
    checkServices();
    const interval = setInterval(checkServices, 30000);
    return () => clearInterval(interval);
  }, [checkServices]);

  const allUp = services?.every((s) => s.up) ?? false;
  const downCount = services?.filter((s) => !s.up).length ?? 0;

  if (error) {
    return (
      <div className="mx-auto mb-6 w-full max-w-2xl rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-red-400" />
            <span className="text-xs text-[var(--text-muted)]">Unable to check services</span>
          </div>
          <button
            onClick={loadAllServices}
            disabled={loading}
            className="rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-1.5 text-[11px] font-medium text-[var(--text-secondary)] transition-all hover:bg-[var(--bg-card)] hover:text-[var(--text-primary)] disabled:opacity-50"
          >
            {loading ? "Loading..." : "Load All Services"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto mb-6 w-full max-w-2xl rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-4 py-3">
      <div className="mb-2 flex items-center justify-between">
        <div className="text-[10px] font-semibold uppercase tracking-widest text-[var(--text-muted)]">
          System Services
        </div>
        <div className="flex items-center gap-2">
          {services && !allUp && (
            <span className="text-[10px] text-red-400">
              {downCount} down
            </span>
          )}
          {services && allUp && (
            <span className="text-[10px] text-emerald-400">
              All systems go
            </span>
          )}
          <button
            onClick={allUp ? checkServices : loadAllServices}
            disabled={loading}
            className={`rounded-lg border border-[var(--border)] px-3 py-1 text-[11px] font-medium transition-all disabled:opacity-50 ${
              allUp
                ? "bg-[var(--bg-primary)] text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
                : "bg-[var(--text-primary)] text-white hover:opacity-90"
            }`}
          >
            {loading ? "Loading..." : allUp ? "Refresh" : "Load All Services"}
          </button>
        </div>
      </div>
      <div className="flex flex-wrap gap-3">
        {services
          ? services.map((svc) => (
              <div
                key={svc.id}
                className="flex items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--bg-primary)] px-2.5 py-1.5 text-xs text-[var(--text-secondary)]"
                title={svc.up ? `${svc.name}: connected` : `${svc.name}: ${svc.error ?? "unreachable"}`}
              >
                <span
                  className={`h-2 w-2 rounded-full ${
                    svc.up ? "bg-emerald-400" : "bg-red-400"
                  }`}
                />
                {svc.name}
              </div>
            ))
          : Array.from({ length: 7 }).map((_, i) => (
              <div
                key={i}
                className="flex items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--bg-primary)] px-2.5 py-1.5 text-xs text-[var(--text-muted)]"
              >
                <span className="h-2 w-2 animate-pulse rounded-full bg-amber-400" />
                Checking...
              </div>
            ))}
      </div>
    </div>
  );
}
