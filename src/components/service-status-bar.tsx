"use client";

import { useEffect, useState } from "react";
import { api, type ServiceStatus } from "@/lib/api";

export function ServiceStatusBar() {
  const [services, setServices] = useState<ServiceStatus[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let mounted = true;
    async function check() {
      try {
        const res = await api.servicesStatus();
        if (mounted) {
          setServices(res.services);
          setError(false);
        }
      } catch {
        if (mounted) setError(true);
      }
    }
    check();
    const interval = setInterval(check, 30000);
    return () => { mounted = false; clearInterval(interval); };
  }, []);

  if (error) {
    return (
      <div className="mx-auto mb-6 flex w-full max-w-2xl items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-4 py-3">
        <span className="h-2 w-2 rounded-full bg-[var(--red)]" />
        <span className="text-xs text-[var(--text-muted)]">Unable to check services</span>
      </div>
    );
  }

  return (
    <div className="mx-auto mb-6 w-full max-w-2xl rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-4 py-3">
      <div className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-[var(--text-muted)]">
        System Services
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
          : Array.from({ length: 5 }).map((_, i) => (
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
