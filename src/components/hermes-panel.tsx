"use client";

import { useState, useRef, useEffect } from "react";
import { useHermesDashboard } from "@/lib/hooks";
import { hermes } from "@/lib/api";
import type { HermesPatrolStatus } from "@/lib/api";

interface ChatMessage {
  role: "user" | "assistant";
  text: string;
  timestamp: number;
}

export function HermesPanel() {
  const { data: dashboard, error } = useHermesDashboard();
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [view, setView] = useState<"dashboard" | "chat">("dashboard");
  const chatEndRef = useRef<HTMLDivElement>(null);
  const [patrol, setPatrol] = useState<HermesPatrolStatus | null>(null);

  // Poll patrol status
  useEffect(() => {
    const fetchPatrol = () => hermes.patrol().then(setPatrol).catch(() => {});
    fetchPatrol();
    const interval = setInterval(fetchPatrol, 10000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  const handleChat = async () => {
    const msg = chatInput.trim();
    if (!msg || chatLoading) return;
    setChatInput("");
    setChatMessages((prev) => [...prev, { role: "user", text: msg, timestamp: Date.now() }]);
    setChatLoading(true);
    try {
      const res = await hermes.chat(msg);
      setChatMessages((prev) => [...prev, { role: "assistant", text: res.reply, timestamp: Date.now() }]);
    } catch (err) {
      setChatMessages((prev) => [
        ...prev,
        { role: "assistant", text: `Error: ${err instanceof Error ? err.message : String(err)}`, timestamp: Date.now() },
      ]);
    } finally {
      setChatLoading(false);
    }
  };

  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-100 text-lg">!</div>
        <p className="text-sm font-medium text-[var(--text-primary)]">Hermes Offline</p>
        <p className="text-xs text-[var(--text-muted)]">{error}</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[var(--border)] px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-100 text-sm">H</div>
          <div>
            <h2 className="text-[15px] font-semibold text-[var(--text-primary)]">Hermes</h2>
            <p className="text-[11px] text-[var(--text-muted)]">
              {dashboard ? `${dashboard.stats.issues} issues · ${dashboard.stats.playbooks} playbooks` : "Connecting..."}
            </p>
          </div>
        </div>
        <div className="flex rounded-lg border border-[var(--border)] p-0.5">
          <button
            onClick={() => setView("dashboard")}
            className={`rounded-md px-3 py-1 text-[11px] transition-colors ${
              view === "dashboard"
                ? "bg-[var(--bg-card)] font-medium text-[var(--text-primary)] shadow-sm"
                : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
            }`}
          >
            Dashboard
          </button>
          <button
            onClick={() => setView("chat")}
            className={`rounded-md px-3 py-1 text-[11px] transition-colors ${
              view === "chat"
                ? "bg-[var(--bg-card)] font-medium text-[var(--text-primary)] shadow-sm"
                : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
            }`}
          >
            Chat
          </button>
        </div>
      </div>

      {/* Content */}
      {view === "dashboard" ? (
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {!dashboard ? (
            <div className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
              <div className="h-2 w-2 animate-pulse rounded-full bg-amber-400" />
              Loading dashboard...
            </div>
          ) : (
            <>
              {/* Stats row */}
              <div className="grid grid-cols-4 gap-3">
                <StatCard
                  label="Active"
                  value={dashboard.unresolved?.length ?? 0}
                  color={(dashboard.unresolved?.length ?? 0) > 0 ? "red" : "green"}
                  sub={(dashboard.unresolved?.length ?? 0) > 0 ? "need attention" : "all clear"}
                />
                <StatCard
                  label="Total"
                  value={dashboard.stats.issues}
                  color="gray"
                  sub="all time"
                />
                <StatCard
                  label="Resolved"
                  value={dashboard.stats.resolutions}
                  color="green"
                  sub={dashboard.stats.issues > 0 ? `${Math.round((dashboard.stats.resolutions / dashboard.stats.issues) * 100)}% rate` : "—"}
                />
                <StatCard
                  label="Playbooks"
                  value={dashboard.stats.playbooks}
                  color="blue"
                  sub="learned fixes"
                />
              </div>

              {/* Patrol Status */}
              {patrol && (
                <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <div className={`h-2 w-2 rounded-full ${
                        !patrol.enabled ? "bg-gray-400" :
                        patrol.status === "idle" ? "bg-green-400 animate-pulse" :
                        patrol.status === "patrolling" ? "bg-cyan-400 animate-pulse" :
                        patrol.status === "escalating" ? "bg-amber-400 animate-pulse" :
                        "bg-blue-400 animate-pulse"
                      }`} />
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                        Patrol {patrol.enabled ? patrol.status : "OFF"}
                      </span>
                    </div>
                    {patrol.lastPollAt && (
                      <span className="text-[10px] text-[var(--text-muted)]">
                        {new Date(patrol.lastPollAt).toLocaleTimeString()}
                      </span>
                    )}
                  </div>
                  {patrol.enabled && (
                    <div className="grid grid-cols-4 gap-2">
                      <div className="text-center">
                        <p className="text-[16px] font-semibold text-[var(--text-primary)]">{patrol.issuesDetected ?? 0}</p>
                        <p className="text-[9px] text-[var(--text-muted)]">Detected</p>
                      </div>
                      <div className="text-center">
                        <p className="text-[16px] font-semibold text-green-600">{patrol.issuesResolved ?? 0}</p>
                        <p className="text-[9px] text-[var(--text-muted)]">Resolved</p>
                      </div>
                      <div className="text-center">
                        <p className="text-[16px] font-semibold text-amber-600">{patrol.escalations ?? 0}</p>
                        <p className="text-[9px] text-[var(--text-muted)]">Escalated</p>
                      </div>
                      <div className="text-center">
                        <p className="text-[16px] font-semibold text-blue-600">{patrol.playbooksGenerated ?? 0}</p>
                        <p className="text-[9px] text-[var(--text-muted)]">New PBs</p>
                      </div>
                    </div>
                  )}
                  {patrol.lastError && (
                    <p className="mt-2 text-[10px] text-red-500 truncate">{patrol.lastError}</p>
                  )}
                </div>
              )}

              {/* Top Issues */}
              {dashboard.top_issues.length > 0 && (
                <Section title="Top Issues">
                  {dashboard.top_issues.slice(0, 5).map((issue) => (
                    <div key={issue.id} className="flex items-start justify-between gap-2 py-2">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[12px] text-[var(--text-primary)]">
                          {issue.error_signature || issue.id}
                        </p>
                        <p className="text-[10px] text-[var(--text-muted)]">
                          {issue.environment} · {issue.occurrence_count}x · {issue.severity}
                        </p>
                      </div>
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-medium ${
                          issue.status === "open"
                            ? "bg-red-100 text-red-700"
                            : issue.status === "resolved"
                              ? "bg-green-100 text-green-700"
                              : "bg-gray-100 text-gray-600"
                        }`}
                      >
                        {issue.status}
                      </span>
                    </div>
                  ))}
                </Section>
              )}

              {/* Pending Observations */}
              {dashboard.pending_observations.length > 0 && (
                <Section title="Pending Observations">
                  {dashboard.pending_observations.slice(0, 5).map((obs) => (
                    <div key={obs.id} className="py-2">
                      <p className="truncate text-[12px] text-[var(--text-primary)]">
                        {obs.raw_message.slice(0, 80)}
                      </p>
                      <p className="text-[10px] text-[var(--text-muted)]">
                        {obs.source} · {new Date(obs.timestamp).toLocaleTimeString()}
                      </p>
                    </div>
                  ))}
                </Section>
              )}

              {/* Playbooks */}
              {dashboard.playbooks.length > 0 && (
                <Section title="Top Playbooks">
                  {dashboard.playbooks.slice(0, 5).map((pb) => (
                    <div key={pb.id} className="flex items-start justify-between gap-2 py-2">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[12px] text-[var(--text-primary)]">
                          {pb.error_pattern || pb.id}
                        </p>
                        <p className="text-[10px] text-[var(--text-muted)]">
                          {pb.applied_count} applied · {Math.round(pb.success_rate * 100)}% success
                        </p>
                      </div>
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-medium ${
                          pb.promotion_status === "promoted"
                            ? "bg-green-100 text-green-700"
                            : pb.promotion_status === "candidate"
                              ? "bg-amber-100 text-amber-700"
                              : "bg-gray-100 text-gray-600"
                        }`}
                      >
                        {pb.promotion_status}
                      </span>
                    </div>
                  ))}
                </Section>
              )}

              {/* Recent Resolutions */}
              {dashboard.recent_resolutions.length > 0 && (
                <Section title="Recent Fixes">
                  {dashboard.recent_resolutions.slice(0, 5).map((r, i) => (
                    <div key={i} className="py-2">
                      <p className="truncate text-[12px] text-[var(--text-primary)]">
                        {r.fixApplied || "Fix applied"}
                      </p>
                      <p className="text-[10px] text-[var(--text-muted)]">
                        {r.method} · {r.issueId} · {new Date(r.resolvedAt).toLocaleTimeString()}
                      </p>
                    </div>
                  ))}
                </Section>
              )}

              {/* Service Failures */}
              {dashboard.service_failures.length > 0 && (
                <Section title="Service Failures">
                  <div className="flex flex-wrap gap-2">
                    {dashboard.service_failures.map((sf) => (
                      <span
                        key={sf.service}
                        className="rounded-full border border-red-200 bg-red-50 px-2.5 py-1 text-[11px] text-red-700"
                      >
                        {sf.service}: {sf.count}
                      </span>
                    ))}
                  </div>
                </Section>
              )}
            </>
          )}
        </div>
      ) : (
        /* Chat view */
        <div className="flex flex-1 flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
            {chatMessages.length === 0 && (
              <p className="text-center text-[12px] text-[var(--text-muted)] py-8">
                Ask Hermes anything — issues, playbooks, graph data, or general questions.
              </p>
            )}
            {chatMessages.map((msg, i) => (
              <div
                key={i}
                className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[85%] rounded-xl px-3.5 py-2.5 text-[12px] leading-relaxed ${
                    msg.role === "user"
                      ? "bg-[var(--text-primary)] text-white"
                      : "bg-[var(--bg-sidebar)] text-[var(--text-primary)] border border-[var(--border)]"
                  }`}
                >
                  <pre className="whitespace-pre-wrap font-sans">{msg.text}</pre>
                </div>
              </div>
            ))}
            {chatLoading && (
              <div className="flex justify-start">
                <div className="flex items-center gap-1.5 rounded-xl bg-[var(--bg-sidebar)] border border-[var(--border)] px-3.5 py-2.5">
                  <div className="h-1.5 w-1.5 animate-bounce rounded-full bg-amber-400" style={{ animationDelay: "0ms" }} />
                  <div className="h-1.5 w-1.5 animate-bounce rounded-full bg-amber-400" style={{ animationDelay: "150ms" }} />
                  <div className="h-1.5 w-1.5 animate-bounce rounded-full bg-amber-400" style={{ animationDelay: "300ms" }} />
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Input */}
          <div className="border-t border-[var(--border)] px-4 py-3">
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleChat(); }}
                placeholder="Ask Hermes..."
                disabled={chatLoading}
                className="flex-1 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2 text-[13px] outline-none placeholder:text-[var(--text-muted)] focus:border-amber-400 disabled:opacity-50"
              />
              <button
                onClick={handleChat}
                disabled={chatLoading || !chatInput.trim()}
                className="rounded-lg bg-[var(--text-primary)] px-4 py-2 text-[12px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-30"
              >
                Send
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, color, sub }: { label: string; value: number; color: "red" | "green" | "blue" | "amber" | "gray"; sub?: string }) {
  const colorMap = {
    red: "bg-red-50 text-red-700 border-red-100",
    green: "bg-green-50 text-green-700 border-green-100",
    blue: "bg-blue-50 text-blue-700 border-blue-100",
    amber: "bg-amber-50 text-amber-700 border-amber-100",
    gray: "bg-gray-50 text-gray-600 border-gray-100",
  };
  return (
    <div className={`rounded-lg border px-3 py-2.5 ${colorMap[color]}`}>
      <p className="text-[20px] font-semibold">{value}</p>
      <p className="text-[10px] opacity-70">{label}</p>
      {sub && <p className="text-[9px] opacity-50 mt-0.5">{sub}</p>}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--text-muted)]">
        {title}
      </h3>
      <div className="divide-y divide-[var(--border)]">{children}</div>
    </div>
  );
}
