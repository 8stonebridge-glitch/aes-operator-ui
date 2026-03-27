module.exports = [
"[project]/src/lib/api.ts [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

// In dev, Next.js rewrites /api/* → localhost:4100/api/* (no CORS issues)
// In prod, set NEXT_PUBLIC_AES_API_URL to the backend URL
__turbopack_context__.s([
    "aesGet",
    ()=>aesGet,
    "aesPost",
    ()=>aesPost,
    "api",
    ()=>api,
    "orchestrator",
    ()=>orchestrator
]);
const BASE = ("TURBOPACK compile-time value", "") ?? "";
async function aesGet(path) {
    const res = await fetch(`${BASE}${path}`, {
        cache: "no-store"
    });
    if (!res.ok) throw new Error(`GET ${path} → ${res.status}`);
    return res.json();
}
async function aesPost(path, body) {
    const res = await fetch(`${BASE}${path}`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: body ? JSON.stringify(body) : undefined
    });
    if (!res.ok) {
        const text = await res.text().catch(()=>"");
        throw new Error(`POST ${path} → ${res.status}: ${text}`);
    }
    return res.json();
}
const api = {
    health: ()=>aesGet("/api/health"),
    // Orchestrator
    orchestratorLive: ()=>aesGet("/api/orchestrator/live"),
    orchestratorEvents: ()=>aesGet("/api/orchestrator/events"),
    orchestratorAdvance: ()=>aesPost("/api/orchestrator/advance"),
    // Agent status (thinking line)
    agentStatus: ()=>aesGet("/api/agent-status"),
    // Graph
    graphVisualize: (mode = "full", limit = 220)=>aesGet(`/api/graph/visualize?mode=${mode}&limit=${limit}`),
    // App pipeline
    appIntake: async (name, description)=>{
        const raw = await aesPost("/api/app/intake", {
            name,
            description,
            requested_by: "operator-ui"
        });
        return {
            app_id: raw.payload.app_id,
            status: raw.payload.promotion_status ?? "DRAFT",
            name: raw.payload.name
        };
    },
    appStatus: (appId)=>aesGet(`/api/app/${appId}/status`),
    appResearch: (appId, content)=>aesPost(`/api/app/${appId}/research`, {
            research_content: content
        }),
    appDecompose: (appId, features)=>aesPost(`/api/app/${appId}/decompose`, {
            candidate_features: features ?? []
        }),
    appVerify: (appId)=>aesPost(`/api/app/${appId}/verify`, {
            verification_content: "auto-verify",
            source: "operator-ui"
        }),
    appPromote: (appId)=>aesPost(`/api/app/${appId}/promote`, {}),
    appSeed: (appId)=>aesPost(`/api/app/${appId}/seed`, {}),
    appBuildProgram: (appId)=>aesPost(`/api/app/${appId}/build-program`, {
            requested_by: "operator-ui"
        }),
    /**
   * Run the full pipeline: intake → research → decompose → verify → promote.
   * Calls onProgress at each stage so the UI can update the thinking line.
   * Returns the app_id. Does NOT start the build program — that requires operator approval.
   */ runPipeline: async (intent, onProgress)=>{
        // 1. Intake
        onProgress("intake", "Submitting your intent...");
        const name = intent.toLowerCase().replace(/[^a-z0-9\s]/g, "").split(/\s+/).slice(0, 4).join("-");
        const intake = await api.appIntake(name, intent);
        const appId = intake.app_id;
        // 2. Research
        onProgress("research", "Researching patterns and requirements...");
        try {
            await api.appResearch(appId, intent);
        } catch (err) {
            // Research may fail if no research gateway — continue with what we have
            onProgress("research", "Research skipped (no gateway). Continuing...");
        }
        // 3. Decompose
        onProgress("decompose", "Breaking down into features...");
        await api.appDecompose(appId);
        // 4. Verify
        onProgress("verify", "Verifying feature specs...");
        try {
            await api.appVerify(appId);
        } catch (err) {
            onProgress("verify", "Verification skipped. Continuing...");
        }
        // 5. Promote
        onProgress("promote", "Evaluating promotion gates...");
        try {
            const result = await api.appPromote(appId);
            const decision = result.decision;
            if (decision === "PROMOTED") {
                onProgress("promoted", "Plan approved. Ready to build.");
                return {
                    app_id: appId,
                    promoted: true
                };
            } else {
                onProgress("blocked", `Promotion ${decision ?? "BLOCKED"}. Review needed.`);
                return {
                    app_id: appId,
                    promoted: false,
                    error: `Promotion: ${decision}`
                };
            }
        } catch (err) {
            onProgress("blocked", "Promotion failed. Review needed.");
            return {
                app_id: appId,
                promoted: false,
                error: String(err)
            };
        }
    },
    // Builds
    buildReplay: (buildId)=>aesGet(`/api/builds/${buildId}/replay`),
    buildPrepare: (featureId, intent)=>aesPost("/api/builds/prepare", {
            feature_id: featureId,
            intent
        }),
    buildAbort: (buildId)=>aesPost(`/api/builds/${buildId}/abort-builder`, {}),
    buildRunValidators: (buildId)=>aesPost(`/api/builds/${buildId}/run-validators`, {}),
    // Governance
    pendingDecisions: ()=>aesGet("/api/governance/pending"),
    escalationApprove: (id, by, rationale)=>aesPost(`/api/governance/escalations/${id}/approve`, {
            decided_by: by,
            rationale
        }),
    escalationReject: (id, by, rationale)=>aesPost(`/api/governance/escalations/${id}/reject`, {
            decided_by: by,
            rationale
        }),
    // Features
    featureAudit: (featureId)=>aesGet(`/api/features/${featureId}/audit`),
    // Attention
    attentionQueue: ()=>aesGet("/api/attention-queue")
};
/* ── LangGraph Orchestrator API ── */ const ORCH_BASE = process.env.NEXT_PUBLIC_AES_ORCHESTRATOR_URL ?? "";
const orchestrator = {
    /** Start a new build via the LangGraph orchestrator */ startBuild: async (intent, targetPath)=>{
        const res = await fetch(`${ORCH_BASE}/orchestrator/build`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                intent,
                targetPath: targetPath || undefined
            })
        });
        if (!res.ok) {
            const text = await res.text().catch(()=>"");
            throw new Error(`POST /orchestrator/build → ${res.status}: ${text}`);
        }
        return res.json();
    },
    /** Get job status */ jobStatus: async (jobId)=>{
        const res = await fetch(`${ORCH_BASE}/orchestrator/jobs/${jobId}`, {
            cache: "no-store"
        });
        if (!res.ok) throw new Error(`GET /orchestrator/jobs/${jobId} → ${res.status}`);
        return res.json();
    },
    /** List all jobs */ listJobs: async ()=>{
        const res = await fetch(`${ORCH_BASE}/orchestrator/jobs`, {
            cache: "no-store"
        });
        if (!res.ok) throw new Error(`GET /orchestrator/jobs → ${res.status}`);
        return res.json();
    },
    /** Confirm intent (resolve ambiguity) */ confirmIntent: async (jobId)=>{
        const res = await fetch(`${ORCH_BASE}/orchestrator/jobs/${jobId}/confirm`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            }
        });
        if (!res.ok) throw new Error(`POST confirm → ${res.status}`);
    },
    /** Approve plan (human gate) */ approvePlan: async (jobId)=>{
        const res = await fetch(`${ORCH_BASE}/orchestrator/jobs/${jobId}/approve`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            }
        });
        if (!res.ok) throw new Error(`POST approve → ${res.status}`);
    },
    /** Get SSE stream URL for a job — connect directly to orchestrator to avoid proxy buffering */ streamUrl: (jobId)=>{
        // SSE must bypass the Next.js rewrite proxy (it buffers responses)
        const directUrl = process.env.NEXT_PUBLIC_AES_ORCHESTRATOR_DIRECT_URL ?? "http://localhost:3100";
        return `${directUrl}/api/jobs/${jobId}/stream`;
    },
    /** Get job logs */ jobLogs: async (jobId)=>{
        const res = await fetch(`${ORCH_BASE}/orchestrator/jobs/${jobId}/logs`, {
            cache: "no-store"
        });
        if (!res.ok) throw new Error(`GET /orchestrator/jobs/${jobId}/logs → ${res.status}`);
        return res.json();
    },
    /** Health check for orchestrator */ health: async ()=>{
        const res = await fetch(`${ORCH_BASE}/orchestrator/health`, {
            cache: "no-store"
        });
        if (!res.ok) throw new Error(`GET /orchestrator/health → ${res.status}`);
        return res.json();
    }
};
}),
"[project]/src/lib/hooks.ts [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "useAgentStatus",
    ()=>useAgentStatus,
    "useHealth",
    ()=>useHealth,
    "useOrchestrator",
    ()=>useOrchestrator,
    "useOrchestratorEvents",
    ()=>useOrchestratorEvents,
    "useOrchestratorHealth",
    ()=>useOrchestratorHealth,
    "useOrchestratorJobStatus",
    ()=>useOrchestratorJobStatus,
    "useOrchestratorJobs",
    ()=>useOrchestratorJobs,
    "useOrchestratorStream",
    ()=>useOrchestratorStream,
    "useThinkingText",
    ()=>useThinkingText
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$api$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/api.ts [app-ssr] (ecmascript)");
"use client";
;
;
/* ── Poll hook ── */ function usePoll(fetcher, intervalMs, enabled = true) {
    const [data, setData] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(null);
    const [error, setError] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(null);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        if (!enabled) return;
        let alive = true;
        const run = async ()=>{
            try {
                const d = await fetcher();
                if (alive) {
                    setData(d);
                    setError(null);
                }
            } catch (e) {
                if (alive) setError(e instanceof Error ? e.message : String(e));
            }
        };
        run();
        const id = setInterval(run, intervalMs);
        return ()=>{
            alive = false;
            clearInterval(id);
        };
    }, [
        fetcher,
        intervalMs,
        enabled
    ]);
    return {
        data,
        error
    };
}
function useHealth() {
    const fetcher = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useCallback"])(()=>__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$api$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["api"].health(), []);
    return usePoll(fetcher, 15_000);
}
function useOrchestrator(enabled = true) {
    const fetcher = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useCallback"])(()=>__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$api$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["api"].orchestratorLive(), []);
    return usePoll(fetcher, 2_000, enabled);
}
function useOrchestratorEvents(enabled = true) {
    const fetcher = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useCallback"])(()=>__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$api$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["api"].orchestratorEvents(), []);
    return usePoll(fetcher, 3_000, enabled);
}
function useAgentStatus(enabled = true) {
    const fetcher = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useCallback"])(()=>__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$api$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["api"].agentStatus(), []);
    return usePoll(fetcher, 1_500, enabled);
}
/* ── Thinking line text generator ── */ const THINKING_MESSAGES = {
    idle: ()=>"Waiting for your input...",
    researching: (ctx)=>`Looking into ${ctx.app_id || "your app"} to understand what needs building...`,
    decomposing: (ctx)=>`Breaking ${ctx.app_id || "your app"} into features and figuring out the build order...`,
    matching_donors: (ctx)=>ctx.feature_id ? `Finding the best open-source patterns for ${ctx.feature_id}...` : "Searching the knowledge graph for relevant patterns...",
    promoting: (ctx)=>ctx.feature_id ? `Checking if ${ctx.feature_id} has everything it needs to build safely...` : "Running promotion gates on the feature plan...",
    building: (ctx)=>{
        const done = ctx.completed_features ?? 0;
        const total = ctx.total_features ?? 0;
        const feat = ctx.feature_id || "a feature";
        if (total > 0) return `Building ${feat} now (${done}/${total} complete)...`;
        return `Building ${feat}...`;
    },
    verifying: (ctx)=>ctx.feature_id ? `Checking ${ctx.feature_id} against the spec and running validators...` : "Running post-build verification...",
    blocked: (ctx)=>ctx.feature_id ? `${ctx.feature_id} is blocked — I need your input to continue.` : "Something is blocked. Check the attention queue.",
    failed: (ctx)=>ctx.feature_id ? `${ctx.feature_id} failed. Looking at what went wrong...` : "A build step failed. Reviewing the error...",
    complete: (ctx)=>{
        const total = ctx.total_features ?? 0;
        const failed = ctx.failed_features ?? 0;
        if (failed > 0) return `Done — ${total - failed} features built, ${failed} need attention.`;
        return `All ${total} features built and verified. Everything passed.`;
    }
};
function useThinkingText(agentStatus) {
    if (!agentStatus) return "Connecting to AES...";
    const phase = agentStatus.phase ?? "idle";
    const generator = THINKING_MESSAGES[phase] ?? THINKING_MESSAGES.idle;
    return generator(agentStatus);
}
function useOrchestratorStream(jobId) {
    const [messages, setMessages] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])([]);
    const [connected, setConnected] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(false);
    const [lastEvent, setLastEvent] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(null);
    const eventSourceRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useRef"])(null);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        if (!jobId) return;
        const url = __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$api$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["orchestrator"].streamUrl(jobId);
        const es = new EventSource(url);
        eventSourceRef.current = es;
        const handleEvent = (type)=>(e)=>{
                try {
                    const data = JSON.parse(e.data);
                    const msg = {
                        event: type,
                        data,
                        timestamp: Date.now()
                    };
                    setMessages((prev)=>[
                            ...prev,
                            msg
                        ]);
                    setLastEvent(msg);
                } catch  {
                // ignore malformed events
                }
            };
        es.addEventListener("connected", ()=>setConnected(true));
        es.addEventListener("gate", handleEvent("gate"));
        es.addEventListener("step", handleEvent("step"));
        es.addEventListener("success", handleEvent("success"));
        es.addEventListener("fail", handleEvent("fail"));
        es.addEventListener("warn", handleEvent("warn"));
        es.addEventListener("pause", handleEvent("pause"));
        es.addEventListener("feature", handleEvent("feature"));
        es.addEventListener("needs_approval", handleEvent("needs_approval"));
        es.addEventListener("needs_confirmation", handleEvent("needs_confirmation"));
        es.addEventListener("complete", handleEvent("complete"));
        es.addEventListener("error", handleEvent("error"));
        es.onerror = ()=>{
            setConnected(false);
        };
        return ()=>{
            es.close();
            eventSourceRef.current = null;
        };
    }, [
        jobId
    ]);
    return {
        messages,
        connected,
        lastEvent
    };
}
function useOrchestratorHealth() {
    const fetcher = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useCallback"])(()=>__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$api$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["orchestrator"].health(), []);
    return usePoll(fetcher, 15_000);
}
function useOrchestratorJobStatus(jobId, enabled = true) {
    const fetcher = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useCallback"])(()=>jobId ? __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$api$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["orchestrator"].jobStatus(jobId) : Promise.reject("no job"), [
        jobId
    ]);
    return usePoll(fetcher, 3_000, enabled && !!jobId);
}
function useOrchestratorJobs(enabled = true) {
    const fetcher = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useCallback"])(()=>__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$api$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["orchestrator"].listJobs(), []);
    return usePoll(fetcher, 10_000, enabled);
}
}),
"[project]/src/components/thinking-line.tsx [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "ThinkingLine",
    ()=>ThinkingLine
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-dev-runtime.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$framer$2d$motion$2f$dist$2f$es$2f$render$2f$components$2f$motion$2f$proxy$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/framer-motion/dist/es/render/components/motion/proxy.mjs [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$framer$2d$motion$2f$dist$2f$es$2f$components$2f$AnimatePresence$2f$index$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/framer-motion/dist/es/components/AnimatePresence/index.mjs [app-ssr] (ecmascript)");
"use client";
;
;
function ThinkingLine({ text, phase = "idle" }) {
    const isActive = phase !== "idle" && phase !== "complete";
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "flex items-center gap-3",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$framer$2d$motion$2f$dist$2f$es$2f$render$2f$components$2f$motion$2f$proxy$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["motion"].span, {
                className: "h-[7px] w-[7px] shrink-0 rounded-full bg-[var(--accent)]",
                animate: isActive ? {
                    opacity: [
                        1,
                        0.3,
                        1
                    ]
                } : {
                    opacity: 1
                },
                transition: isActive ? {
                    duration: 1.5,
                    repeat: Infinity
                } : undefined
            }, void 0, false, {
                fileName: "[project]/src/components/thinking-line.tsx",
                lineNumber: 16,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$framer$2d$motion$2f$dist$2f$es$2f$components$2f$AnimatePresence$2f$index$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["AnimatePresence"], {
                mode: "wait",
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$framer$2d$motion$2f$dist$2f$es$2f$render$2f$components$2f$motion$2f$proxy$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["motion"].p, {
                    className: "m-0 text-[13px] leading-5 text-[var(--text-primary)]",
                    initial: {
                        opacity: 0,
                        y: 4
                    },
                    animate: {
                        opacity: 1,
                        y: 0
                    },
                    exit: {
                        opacity: 0,
                        y: -4
                    },
                    transition: {
                        duration: 0.2
                    },
                    children: text
                }, text, false, {
                    fileName: "[project]/src/components/thinking-line.tsx",
                    lineNumber: 23,
                    columnNumber: 9
                }, this)
            }, void 0, false, {
                fileName: "[project]/src/components/thinking-line.tsx",
                lineNumber: 22,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/src/components/thinking-line.tsx",
        lineNumber: 14,
        columnNumber: 5
    }, this);
}
}),
"[project]/src/components/health-indicator.tsx [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "HealthIndicator",
    ()=>HealthIndicator
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-dev-runtime.js [app-ssr] (ecmascript)");
"use client";
;
function HealthIndicator({ health, error }) {
    if (error) {
        return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
            className: "flex items-center gap-2 text-xs",
            children: [
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                    className: "h-2 w-2 rounded-full bg-[var(--red)]"
                }, void 0, false, {
                    fileName: "[project]/src/components/health-indicator.tsx",
                    lineNumber: 14,
                    columnNumber: 9
                }, this),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                    className: "text-[var(--text-muted)]",
                    children: "Offline"
                }, void 0, false, {
                    fileName: "[project]/src/components/health-indicator.tsx",
                    lineNumber: 15,
                    columnNumber: 9
                }, this)
            ]
        }, void 0, true, {
            fileName: "[project]/src/components/health-indicator.tsx",
            lineNumber: 13,
            columnNumber: 7
        }, this);
    }
    if (!health) {
        return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
            className: "flex items-center gap-2 text-xs",
            children: [
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                    className: "h-2 w-2 animate-pulse rounded-full bg-[var(--text-muted)]"
                }, void 0, false, {
                    fileName: "[project]/src/components/health-indicator.tsx",
                    lineNumber: 23,
                    columnNumber: 9
                }, this),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                    className: "text-[var(--text-muted)]",
                    children: "Connecting..."
                }, void 0, false, {
                    fileName: "[project]/src/components/health-indicator.tsx",
                    lineNumber: 24,
                    columnNumber: 9
                }, this)
            ]
        }, void 0, true, {
            fileName: "[project]/src/components/health-indicator.tsx",
            lineNumber: 22,
            columnNumber: 7
        }, this);
    }
    const isOk = health.status === "ok";
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "flex items-center gap-2 text-xs",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                className: `h-2 w-2 rounded-full ${isOk ? "bg-[var(--green)]" : "bg-[var(--amber)]"}`
            }, void 0, false, {
                fileName: "[project]/src/components/health-indicator.tsx",
                lineNumber: 33,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                className: "text-[var(--text-muted)]",
                children: health.total_records !== null ? `${health.total_records.toLocaleString()} records` : health.status
            }, void 0, false, {
                fileName: "[project]/src/components/health-indicator.tsx",
                lineNumber: 36,
                columnNumber: 7
            }, this),
            health.pending_escalations > 0 && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                className: "rounded-full bg-[var(--amber-soft)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--amber)]",
                children: [
                    health.pending_escalations,
                    " pending"
                ]
            }, void 0, true, {
                fileName: "[project]/src/components/health-indicator.tsx",
                lineNumber: 42,
                columnNumber: 9
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/src/components/health-indicator.tsx",
        lineNumber: 32,
        columnNumber: 5
    }, this);
}
}),
"[project]/src/components/intent-input.tsx [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "IntentInput",
    ()=>IntentInput
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-dev-runtime.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react.js [app-ssr] (ecmascript)");
"use client";
;
;
function IntentInput({ onSubmit, disabled }) {
    const [text, setText] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])("");
    const [targetPath, setTargetPath] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])("");
    const [showAdvanced, setShowAdvanced] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(false);
    const handleSubmit = ()=>{
        const trimmed = text.trim();
        if (!trimmed || disabled) return;
        onSubmit(trimmed, targetPath.trim() || undefined);
    };
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "mx-auto w-full max-w-2xl",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "space-y-4 text-center",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("h1", {
                        className: "text-3xl font-bold tracking-tight text-[var(--text-primary)]",
                        children: "What do you want to build?"
                    }, void 0, false, {
                        fileName: "[project]/src/components/intent-input.tsx",
                        lineNumber: 25,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                        className: "text-sm text-[var(--text-secondary)]",
                        children: "Describe your app and AES will research, plan, and build it."
                    }, void 0, false, {
                        fileName: "[project]/src/components/intent-input.tsx",
                        lineNumber: 28,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/src/components/intent-input.tsx",
                lineNumber: 24,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "mt-8 space-y-3",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("textarea", {
                        value: text,
                        onChange: (e)=>setText(e.target.value),
                        onKeyDown: (e)=>{
                            if (e.key === "Enter" && e.metaKey) handleSubmit();
                        },
                        placeholder: "A project management tool with team workspaces, kanban boards, and billing...",
                        disabled: disabled,
                        rows: 4,
                        className: "w-full resize-none rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-5 py-4 text-sm leading-relaxed text-[var(--text-primary)] placeholder-[var(--text-muted)] outline-none transition-all focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)] disabled:opacity-50"
                    }, void 0, false, {
                        fileName: "[project]/src/components/intent-input.tsx",
                        lineNumber: 34,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                type: "button",
                                onClick: ()=>setShowAdvanced(!showAdvanced),
                                className: "flex items-center gap-1.5 text-xs text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("svg", {
                                        width: "12",
                                        height: "12",
                                        viewBox: "0 0 12 12",
                                        className: `transition-transform ${showAdvanced ? "rotate-90" : ""}`,
                                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("path", {
                                            d: "M4 2l4 4-4 4",
                                            stroke: "currentColor",
                                            strokeWidth: "1.5",
                                            fill: "none",
                                            strokeLinecap: "round"
                                        }, void 0, false, {
                                            fileName: "[project]/src/components/intent-input.tsx",
                                            lineNumber: 59,
                                            columnNumber: 15
                                        }, this)
                                    }, void 0, false, {
                                        fileName: "[project]/src/components/intent-input.tsx",
                                        lineNumber: 53,
                                        columnNumber: 13
                                    }, this),
                                    "Output location"
                                ]
                            }, void 0, true, {
                                fileName: "[project]/src/components/intent-input.tsx",
                                lineNumber: 48,
                                columnNumber: 11
                            }, this),
                            showAdvanced && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "mt-2",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
                                        className: "mb-1 block text-[11px] font-medium text-[var(--text-muted)]",
                                        children: "Target file path"
                                    }, void 0, false, {
                                        fileName: "[project]/src/components/intent-input.tsx",
                                        lineNumber: 66,
                                        columnNumber: 15
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                                        type: "text",
                                        value: targetPath,
                                        onChange: (e)=>setTargetPath(e.target.value),
                                        placeholder: "/Users/you/projects/my-app",
                                        disabled: disabled,
                                        className: "w-full rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-4 py-2.5 font-mono text-xs text-[var(--text-primary)] placeholder-[var(--text-muted)] outline-none transition-all focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)] disabled:opacity-50"
                                    }, void 0, false, {
                                        fileName: "[project]/src/components/intent-input.tsx",
                                        lineNumber: 69,
                                        columnNumber: 15
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                        className: "mt-1 text-[10px] text-[var(--text-muted)]",
                                        children: "Where the built app files will be saved. Leave blank for a temp directory."
                                    }, void 0, false, {
                                        fileName: "[project]/src/components/intent-input.tsx",
                                        lineNumber: 77,
                                        columnNumber: 15
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/src/components/intent-input.tsx",
                                lineNumber: 65,
                                columnNumber: 13
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/src/components/intent-input.tsx",
                        lineNumber: 47,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "flex items-center justify-between",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                className: "text-xs text-[var(--text-muted)]",
                                children: "⌘ Enter to start"
                            }, void 0, false, {
                                fileName: "[project]/src/components/intent-input.tsx",
                                lineNumber: 85,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                onClick: handleSubmit,
                                disabled: !text.trim() || disabled,
                                className: "rounded-lg bg-[var(--text-primary)] px-6 py-2.5 text-sm font-medium text-white transition-all hover:opacity-90 disabled:opacity-30 disabled:cursor-not-allowed",
                                children: "Start"
                            }, void 0, false, {
                                fileName: "[project]/src/components/intent-input.tsx",
                                lineNumber: 88,
                                columnNumber: 11
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/src/components/intent-input.tsx",
                        lineNumber: 84,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/src/components/intent-input.tsx",
                lineNumber: 33,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/src/components/intent-input.tsx",
        lineNumber: 23,
        columnNumber: 5
    }, this);
}
}),
"[project]/src/components/pipeline-view.tsx [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "PipelineView",
    ()=>PipelineView
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-dev-runtime.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$framer$2d$motion$2f$dist$2f$es$2f$render$2f$components$2f$motion$2f$proxy$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/framer-motion/dist/es/render/components/motion/proxy.mjs [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$framer$2d$motion$2f$dist$2f$es$2f$components$2f$AnimatePresence$2f$index$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/framer-motion/dist/es/components/AnimatePresence/index.mjs [app-ssr] (ecmascript)");
"use client";
;
;
const STAGES = [
    {
        id: "research",
        label: "Research"
    },
    {
        id: "plan",
        label: "Plan"
    },
    {
        id: "approve",
        label: "Approve"
    },
    {
        id: "build",
        label: "Build"
    },
    {
        id: "verify",
        label: "Verify"
    }
];
/* Map backend stage names to our stage ids */ const STAGE_MAP = {
    raw: "research",
    evidence_gathered: "research",
    researching: "research",
    derived: "plan",
    decomposed: "plan",
    validated: "approve",
    promoted: "approve",
    donors_found: "approve",
    execution_ready: "approve",
    executing: "build",
    building: "build",
    executed: "verify",
    verified: "verify",
    canonical: "verify",
    complete: "verify"
};
function mapStage(backendStage) {
    return STAGE_MAP[backendStage] ?? "research";
}
const STATUS_STYLES = {
    research: "border-[var(--blue)] bg-[var(--blue-soft)] text-[var(--blue)]",
    plan: "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]",
    approve: "border-[var(--amber)] bg-[var(--amber-soft)] text-[var(--amber)]",
    build: "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]",
    verify: "border-[var(--green)] bg-[var(--green-soft)] text-[var(--green)]"
};
function PipelineView({ features, activePhase, onApprove }) {
    const currentStageId = activePhase ? mapStage(activePhase) : undefined;
    // Group features by their mapped stage
    const featuresByStage = {};
    for (const s of STAGES)featuresByStage[s.id] = [];
    for (const f of features){
        const stage = mapStage(f.stage);
        if (featuresByStage[stage]) featuresByStage[stage].push(f);
    }
    // Check if we're at the approve gate
    const atApproveGate = currentStageId === "approve" && featuresByStage["approve"].length > 0 && featuresByStage["build"].length === 0;
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "space-y-6",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "flex items-center gap-0",
                children: STAGES.map((stage, i)=>{
                    const isActive = currentStageId === stage.id;
                    const isPast = currentStageId && STAGES.findIndex((s)=>s.id === currentStageId) > STAGES.findIndex((s)=>s.id === stage.id);
                    const count = featuresByStage[stage.id]?.length ?? 0;
                    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "flex items-center",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "flex flex-col items-center",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "relative",
                                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$framer$2d$motion$2f$dist$2f$es$2f$render$2f$components$2f$motion$2f$proxy$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["motion"].div, {
                                            className: `flex h-10 w-10 items-center justify-center rounded-full border-2 text-xs font-semibold transition-colors ${isActive ? "border-[var(--accent)] bg-[var(--accent)] text-white" : isPast ? "border-[var(--green)] bg-[var(--green)] text-white" : "border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-muted)]"}`,
                                            animate: isActive ? {
                                                scale: [
                                                    1,
                                                    1.08,
                                                    1
                                                ]
                                            } : {},
                                            transition: isActive ? {
                                                duration: 2,
                                                repeat: Infinity
                                            } : undefined,
                                            children: isPast ? "✓" : count > 0 ? count : i + 1
                                        }, void 0, false, {
                                            fileName: "[project]/src/components/pipeline-view.tsx",
                                            lineNumber: 92,
                                            columnNumber: 19
                                        }, this)
                                    }, void 0, false, {
                                        fileName: "[project]/src/components/pipeline-view.tsx",
                                        lineNumber: 91,
                                        columnNumber: 17
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                        className: `mt-1.5 text-xs font-medium ${isActive ? "text-[var(--accent)]" : isPast ? "text-[var(--green)]" : "text-[var(--text-muted)]"}`,
                                        children: stage.label
                                    }, void 0, false, {
                                        fileName: "[project]/src/components/pipeline-view.tsx",
                                        lineNumber: 111,
                                        columnNumber: 17
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/src/components/pipeline-view.tsx",
                                lineNumber: 89,
                                columnNumber: 15
                            }, this),
                            i < STAGES.length - 1 && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: `mx-1 h-0.5 w-8 sm:w-12 md:w-16 ${isPast ? "bg-[var(--green)]" : "bg-[var(--border)]"}`
                            }, void 0, false, {
                                fileName: "[project]/src/components/pipeline-view.tsx",
                                lineNumber: 120,
                                columnNumber: 17
                            }, this)
                        ]
                    }, stage.id, true, {
                        fileName: "[project]/src/components/pipeline-view.tsx",
                        lineNumber: 88,
                        columnNumber: 13
                    }, this);
                })
            }, void 0, false, {
                fileName: "[project]/src/components/pipeline-view.tsx",
                lineNumber: 78,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4",
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$framer$2d$motion$2f$dist$2f$es$2f$components$2f$AnimatePresence$2f$index$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["AnimatePresence"], {
                    mode: "popLayout",
                    children: features.map((f)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(FeatureCard, {
                            feature: f
                        }, f.feature_id, false, {
                            fileName: "[project]/src/components/pipeline-view.tsx",
                            lineNumber: 133,
                            columnNumber: 13
                        }, this))
                }, void 0, false, {
                    fileName: "[project]/src/components/pipeline-view.tsx",
                    lineNumber: 131,
                    columnNumber: 9
                }, this)
            }, void 0, false, {
                fileName: "[project]/src/components/pipeline-view.tsx",
                lineNumber: 130,
                columnNumber: 7
            }, this),
            atApproveGate && onApprove && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$framer$2d$motion$2f$dist$2f$es$2f$render$2f$components$2f$motion$2f$proxy$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["motion"].div, {
                className: "flex items-center justify-center gap-3 rounded-lg border border-[var(--amber)] bg-[var(--amber-soft)] p-4",
                initial: {
                    opacity: 0,
                    y: 12
                },
                animate: {
                    opacity: 1,
                    y: 0
                },
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                        className: "text-sm text-[var(--text-primary)]",
                        children: [
                            features.length,
                            " features ready for approval"
                        ]
                    }, void 0, true, {
                        fileName: "[project]/src/components/pipeline-view.tsx",
                        lineNumber: 145,
                        columnNumber: 11
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                        onClick: onApprove,
                        className: "rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white transition-colors hover:opacity-90",
                        children: "Approve Plan"
                    }, void 0, false, {
                        fileName: "[project]/src/components/pipeline-view.tsx",
                        lineNumber: 148,
                        columnNumber: 11
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/src/components/pipeline-view.tsx",
                lineNumber: 140,
                columnNumber: 9
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/src/components/pipeline-view.tsx",
        lineNumber: 76,
        columnNumber: 5
    }, this);
}
/* ── Feature Card ── */ function FeatureCard({ feature }) {
    const stage = mapStage(feature.stage);
    const style = STATUS_STYLES[stage] ?? "";
    const isBuilding = stage === "build";
    const isDone = stage === "verify";
    const isFailed = feature.stage === "failed";
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$framer$2d$motion$2f$dist$2f$es$2f$render$2f$components$2f$motion$2f$proxy$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["motion"].div, {
        layout: true,
        layoutId: feature.feature_id,
        initial: {
            opacity: 0,
            scale: 0.92
        },
        animate: {
            opacity: 1,
            scale: 1
        },
        exit: {
            opacity: 0,
            scale: 0.92
        },
        transition: {
            type: "spring",
            stiffness: 400,
            damping: 30
        },
        className: `relative overflow-hidden rounded-lg border p-3.5 ${isFailed ? "border-[var(--red)] bg-[var(--red-soft)]" : isDone ? "border-[var(--green)] bg-[var(--green-soft)]" : "border-[var(--border)] bg-[var(--bg-card)]"}`,
        children: [
            isBuilding && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$framer$2d$motion$2f$dist$2f$es$2f$render$2f$components$2f$motion$2f$proxy$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["motion"].div, {
                className: "absolute inset-0 opacity-[0.06]",
                style: {
                    background: "linear-gradient(90deg, transparent, var(--accent), transparent)"
                },
                animate: {
                    x: [
                        "-100%",
                        "100%"
                    ]
                },
                transition: {
                    duration: 2,
                    repeat: Infinity,
                    ease: "linear"
                }
            }, void 0, false, {
                fileName: "[project]/src/components/pipeline-view.tsx",
                lineNumber: 187,
                columnNumber: 9
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "relative",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "flex items-start justify-between gap-2",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("h3", {
                                className: "text-sm font-semibold leading-tight text-[var(--text-primary)]",
                                children: feature.name
                            }, void 0, false, {
                                fileName: "[project]/src/components/pipeline-view.tsx",
                                lineNumber: 200,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                className: `shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${style}`,
                                children: feature.stage
                            }, void 0, false, {
                                fileName: "[project]/src/components/pipeline-view.tsx",
                                lineNumber: 203,
                                columnNumber: 11
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/src/components/pipeline-view.tsx",
                        lineNumber: 199,
                        columnNumber: 9
                    }, this),
                    feature.dependencies.length > 0 && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                        className: "mt-2 text-[11px] text-[var(--text-muted)]",
                        children: [
                            "needs ",
                            feature.dependencies.join(", ")
                        ]
                    }, void 0, true, {
                        fileName: "[project]/src/components/pipeline-view.tsx",
                        lineNumber: 211,
                        columnNumber: 11
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/src/components/pipeline-view.tsx",
                lineNumber: 198,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/src/components/pipeline-view.tsx",
        lineNumber: 170,
        columnNumber: 5
    }, this);
}
}),
"[project]/src/components/dependency-graph.tsx [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "DependencyGraph",
    ()=>DependencyGraph
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-dev-runtime.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$xyflow$2f$react$2f$dist$2f$esm$2f$index$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i("[project]/node_modules/@xyflow/react/dist/esm/index.js [app-ssr] (ecmascript) <locals>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$xyflow$2f$system$2f$dist$2f$esm$2f$index$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/@xyflow/system/dist/esm/index.js [app-ssr] (ecmascript)");
"use client";
;
;
;
const STAGE_COLORS = {
    research: "#2563eb",
    plan: "#d97706",
    approve: "#d97706",
    build: "#d97706",
    verify: "#16a34a",
    complete: "#16a34a",
    failed: "#dc2626"
};
function DependencyGraph({ features }) {
    if (features.length === 0) {
        return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
            className: "flex h-64 items-center justify-center text-xs text-[var(--text-muted)]",
            children: "No features yet"
        }, void 0, false, {
            fileName: "[project]/src/components/dependency-graph.tsx",
            lineNumber: 30,
            columnNumber: 7
        }, this);
    }
    // Simple layout: arrange features in rows by dependency depth
    const depths = computeDepths(features);
    const maxDepth = Math.max(...Object.values(depths), 0);
    // Group by depth
    const byDepth = {};
    for (const f of features){
        const d = depths[f.feature_id] ?? 0;
        if (!byDepth[d]) byDepth[d] = [];
        byDepth[d].push(f);
    }
    const nodes = [];
    const edges = [];
    for(let depth = 0; depth <= maxDepth; depth++){
        const group = byDepth[depth] ?? [];
        group.forEach((f, i)=>{
            const x = depth * 220 + 40;
            const y = i * 100 + 40 + (group.length === 1 ? 50 : 0);
            const stageColor = STAGE_COLORS[f.stage] ?? "#a8a29e";
            nodes.push({
                id: f.feature_id,
                position: {
                    x,
                    y
                },
                data: {
                    label: f.name
                },
                sourcePosition: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$xyflow$2f$system$2f$dist$2f$esm$2f$index$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Position"].Right,
                targetPosition: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$xyflow$2f$system$2f$dist$2f$esm$2f$index$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Position"].Left,
                style: {
                    background: "#fff",
                    border: `2px solid ${stageColor}`,
                    borderRadius: "10px",
                    padding: "10px 16px",
                    fontSize: "12px",
                    fontWeight: 600,
                    color: "#1c1917",
                    minWidth: "120px",
                    textAlign: "center"
                }
            });
            // Edges from dependencies
            for (const dep of f.dependencies){
                edges.push({
                    id: `${dep}->${f.feature_id}`,
                    source: dep,
                    target: f.feature_id,
                    type: "smoothstep",
                    animated: f.stage === "building" || f.stage === "executing",
                    style: {
                        stroke: "#d6d3d1",
                        strokeWidth: 2
                    }
                });
            }
        });
    }
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "h-72 w-full overflow-hidden rounded-lg border border-[var(--border)]",
        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$xyflow$2f$react$2f$dist$2f$esm$2f$index$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$locals$3e$__["ReactFlow"], {
            nodes: nodes,
            edges: edges,
            fitView: true,
            proOptions: {
                hideAttribution: true
            },
            nodesDraggable: false,
            nodesConnectable: false,
            zoomOnScroll: false,
            panOnScroll: true,
            minZoom: 0.5,
            maxZoom: 1.5,
            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$xyflow$2f$react$2f$dist$2f$esm$2f$index$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$locals$3e$__["Background"], {
                gap: 20,
                size: 1,
                color: "var(--border)"
            }, void 0, false, {
                fileName: "[project]/src/components/dependency-graph.tsx",
                lineNumber: 105,
                columnNumber: 9
            }, this)
        }, void 0, false, {
            fileName: "[project]/src/components/dependency-graph.tsx",
            lineNumber: 93,
            columnNumber: 7
        }, this)
    }, void 0, false, {
        fileName: "[project]/src/components/dependency-graph.tsx",
        lineNumber: 92,
        columnNumber: 5
    }, this);
}
/* Compute depth of each feature based on dependencies */ function computeDepths(features) {
    const depths = {};
    const ids = new Set(features.map((f)=>f.feature_id));
    function getDepth(id, visited = new Set()) {
        if (depths[id] !== undefined) return depths[id];
        if (visited.has(id)) return 0; // circular guard
        visited.add(id);
        const f = features.find((x)=>x.feature_id === id);
        if (!f || f.dependencies.length === 0) {
            depths[id] = 0;
            return 0;
        }
        const maxDep = Math.max(...f.dependencies.filter((d)=>ids.has(d)).map((d)=>getDepth(d, visited)));
        depths[id] = maxDep + 1;
        return depths[id];
    }
    for (const f of features)getDepth(f.feature_id);
    return depths;
}
}),
"[project]/src/components/activity-timeline.tsx [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "ActivityTimeline",
    ()=>ActivityTimeline
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-dev-runtime.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$framer$2d$motion$2f$dist$2f$es$2f$render$2f$components$2f$motion$2f$proxy$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/framer-motion/dist/es/render/components/motion/proxy.mjs [app-ssr] (ecmascript)");
"use client";
;
;
const TYPE_COLORS = {
    research: "bg-[var(--blue)]",
    plan: "bg-[var(--accent)]",
    gate: "bg-[var(--amber)]",
    build: "bg-[var(--accent)]",
    verify: "bg-[var(--green)]",
    error: "bg-[var(--red)]",
    info: "bg-[var(--text-muted)]"
};
function ActivityTimeline({ events }) {
    if (events.length === 0) {
        return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
            className: "flex h-32 items-center justify-center text-xs text-[var(--text-muted)]",
            children: "No activity yet"
        }, void 0, false, {
            fileName: "[project]/src/components/activity-timeline.tsx",
            lineNumber: 23,
            columnNumber: 7
        }, this);
    }
    // Show newest first, limit to 50
    const display = [
        ...events
    ].reverse().slice(0, 50);
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "space-y-0",
        children: display.map((event, i)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$framer$2d$motion$2f$dist$2f$es$2f$render$2f$components$2f$motion$2f$proxy$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["motion"].div, {
                initial: i === 0 ? {
                    opacity: 0,
                    x: -8
                } : false,
                animate: {
                    opacity: 1,
                    x: 0
                },
                className: "flex gap-3 py-2",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "flex flex-col items-center",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: `mt-1 h-2 w-2 shrink-0 rounded-full ${TYPE_COLORS[event.type] ?? TYPE_COLORS.info}`
                            }, void 0, false, {
                                fileName: "[project]/src/components/activity-timeline.tsx",
                                lineNumber: 43,
                                columnNumber: 13
                            }, this),
                            i < display.length - 1 && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "mt-1 w-px flex-1 bg-[var(--border)]"
                            }, void 0, false, {
                                fileName: "[project]/src/components/activity-timeline.tsx",
                                lineNumber: 47,
                                columnNumber: 15
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/src/components/activity-timeline.tsx",
                        lineNumber: 42,
                        columnNumber: 11
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "min-w-0 flex-1 pb-2",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                className: "text-xs leading-relaxed text-[var(--text-primary)]",
                                children: event.message
                            }, void 0, false, {
                                fileName: "[project]/src/components/activity-timeline.tsx",
                                lineNumber: 53,
                                columnNumber: 13
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "mt-0.5 flex items-center gap-2 text-[10px] text-[var(--text-muted)]",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                        children: formatTime(event.timestamp)
                                    }, void 0, false, {
                                        fileName: "[project]/src/components/activity-timeline.tsx",
                                        lineNumber: 57,
                                        columnNumber: 15
                                    }, this),
                                    event.feature_id && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                        className: "rounded bg-[var(--bg-stage)] px-1.5 py-0.5",
                                        children: event.feature_id
                                    }, void 0, false, {
                                        fileName: "[project]/src/components/activity-timeline.tsx",
                                        lineNumber: 59,
                                        columnNumber: 17
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/src/components/activity-timeline.tsx",
                                lineNumber: 56,
                                columnNumber: 13
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/src/components/activity-timeline.tsx",
                        lineNumber: 52,
                        columnNumber: 11
                    }, this)
                ]
            }, `${event.timestamp}-${i}`, true, {
                fileName: "[project]/src/components/activity-timeline.tsx",
                lineNumber: 35,
                columnNumber: 9
            }, this))
    }, void 0, false, {
        fileName: "[project]/src/components/activity-timeline.tsx",
        lineNumber: 33,
        columnNumber: 5
    }, this);
}
function formatTime(ts) {
    try {
        const d = new Date(ts);
        return d.toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit"
        });
    } catch  {
        return ts;
    }
}
}),
"[project]/src/components/knowledge-graph.tsx [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "KnowledgeGraph",
    ()=>KnowledgeGraph
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-dev-runtime.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$xyflow$2f$react$2f$dist$2f$esm$2f$index$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i("[project]/node_modules/@xyflow/react/dist/esm/index.js [app-ssr] (ecmascript) <locals>");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$api$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/api.ts [app-ssr] (ecmascript)");
"use client";
;
;
;
;
;
const TYPE_COLORS = {
    LearnedApp: "#1c1917",
    LearnedFeature: "#2563eb",
    LearnedModel: "#7c3aed",
    LearnedIntegration: "#059669",
    LearnedUI: "#d97706"
};
function KnowledgeGraph() {
    const [data, setData] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(null);
    const [loading, setLoading] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(true);
    const [error, setError] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(null);
    const [search, setSearch] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])("");
    const load = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useCallback"])(async ()=>{
        try {
            setLoading(true);
            const d = await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$api$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["api"].graphVisualize("full", 300);
            setData(d);
            setError(d.error ?? null);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Failed to load graph");
        } finally{
            setLoading(false);
        }
    }, []);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        load();
    }, [
        load
    ]);
    if (loading) {
        return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
            className: "flex h-96 items-center justify-center text-sm text-[var(--text-muted)]",
            children: "Loading knowledge graph..."
        }, void 0, false, {
            fileName: "[project]/src/components/knowledge-graph.tsx",
            lineNumber: 45,
            columnNumber: 7
        }, this);
    }
    if (error || !data) {
        return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
            className: "flex h-96 flex-col items-center justify-center gap-3",
            children: [
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                    className: "text-sm text-[var(--red)]",
                    children: error ?? "No data"
                }, void 0, false, {
                    fileName: "[project]/src/components/knowledge-graph.tsx",
                    lineNumber: 54,
                    columnNumber: 9
                }, this),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                    onClick: load,
                    className: "rounded-md bg-[var(--text-primary)] px-4 py-2 text-xs text-white",
                    children: "Retry"
                }, void 0, false, {
                    fileName: "[project]/src/components/knowledge-graph.tsx",
                    lineNumber: 55,
                    columnNumber: 9
                }, this)
            ]
        }, void 0, true, {
            fileName: "[project]/src/components/knowledge-graph.tsx",
            lineNumber: 53,
            columnNumber: 7
        }, this);
    }
    // Filter nodes by search
    const filteredNodes = search ? data.nodes.filter((n)=>n.label.toLowerCase().includes(search.toLowerCase())) : data.nodes;
    const filteredIds = new Set(filteredNodes.map((n)=>n.id));
    const filteredEdges = data.edges.filter((e)=>filteredIds.has(e.source) && filteredIds.has(e.target));
    // Layout: simple force-ish grid
    const nodes = filteredNodes.map((n, i)=>{
        const cols = Math.ceil(Math.sqrt(filteredNodes.length));
        const row = Math.floor(i / cols);
        const col = i % cols;
        const isApp = n.type === "LearnedApp";
        const color = TYPE_COLORS[n.type] ?? "#a8a29e";
        return {
            id: n.id,
            position: {
                x: col * 180 + Math.random() * 20,
                y: row * 120 + Math.random() * 20
            },
            data: {
                label: n.label
            },
            style: {
                background: isApp ? color : "#fff",
                color: isApp ? "#fff" : color,
                border: `2px solid ${color}`,
                borderRadius: isApp ? "12px" : "8px",
                padding: isApp ? "10px 18px" : "6px 12px",
                fontSize: isApp ? "13px" : "10px",
                fontWeight: isApp ? 700 : 500
            }
        };
    });
    const edges = filteredEdges.map((e, i)=>({
            id: `e-${i}`,
            source: e.source,
            target: e.target,
            type: "default",
            style: {
                stroke: e.type === "SIMILAR_TO" ? "#d97706" : "#d6d3d1",
                strokeWidth: e.type === "SIMILAR_TO" ? 1.5 : 1,
                opacity: 0.5
            }
        }));
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "space-y-3",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "flex items-center justify-between",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "text-xs text-[var(--text-muted)]",
                        children: [
                            data.total_nodes,
                            " nodes · ",
                            data.total_edges,
                            " edges"
                        ]
                    }, void 0, true, {
                        fileName: "[project]/src/components/knowledge-graph.tsx",
                        lineNumber: 116,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                        type: "text",
                        value: search,
                        onChange: (e)=>setSearch(e.target.value),
                        placeholder: "Search nodes...",
                        className: "rounded-md border border-[var(--border)] bg-[var(--bg-card)] px-3 py-1.5 text-xs outline-none focus:border-[var(--accent)]"
                    }, void 0, false, {
                        fileName: "[project]/src/components/knowledge-graph.tsx",
                        lineNumber: 119,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/src/components/knowledge-graph.tsx",
                lineNumber: 115,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "flex flex-wrap gap-3 text-[10px]",
                children: Object.entries(TYPE_COLORS).map(([type, color])=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "flex items-center gap-1.5",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                className: "h-2.5 w-2.5 rounded-full",
                                style: {
                                    background: color
                                }
                            }, void 0, false, {
                                fileName: "[project]/src/components/knowledge-graph.tsx",
                                lineNumber: 132,
                                columnNumber: 13
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                className: "text-[var(--text-muted)]",
                                children: type.replace("Learned", "")
                            }, void 0, false, {
                                fileName: "[project]/src/components/knowledge-graph.tsx",
                                lineNumber: 136,
                                columnNumber: 13
                            }, this)
                        ]
                    }, type, true, {
                        fileName: "[project]/src/components/knowledge-graph.tsx",
                        lineNumber: 131,
                        columnNumber: 11
                    }, this))
            }, void 0, false, {
                fileName: "[project]/src/components/knowledge-graph.tsx",
                lineNumber: 129,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "h-[500px] w-full overflow-hidden rounded-lg border border-[var(--border)]",
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$xyflow$2f$react$2f$dist$2f$esm$2f$index$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$locals$3e$__["ReactFlow"], {
                    nodes: nodes,
                    edges: edges,
                    fitView: true,
                    proOptions: {
                        hideAttribution: true
                    },
                    minZoom: 0.2,
                    maxZoom: 2,
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$xyflow$2f$react$2f$dist$2f$esm$2f$index$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$locals$3e$__["Background"], {
                            gap: 24,
                            size: 1,
                            color: "var(--border)"
                        }, void 0, false, {
                            fileName: "[project]/src/components/knowledge-graph.tsx",
                            lineNumber: 153,
                            columnNumber: 11
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$xyflow$2f$react$2f$dist$2f$esm$2f$index$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$locals$3e$__["Controls"], {
                            showInteractive: false,
                            style: {
                                background: "var(--bg-card)",
                                border: "1px solid var(--border)",
                                borderRadius: "8px"
                            }
                        }, void 0, false, {
                            fileName: "[project]/src/components/knowledge-graph.tsx",
                            lineNumber: 154,
                            columnNumber: 11
                        }, this)
                    ]
                }, void 0, true, {
                    fileName: "[project]/src/components/knowledge-graph.tsx",
                    lineNumber: 145,
                    columnNumber: 9
                }, this)
            }, void 0, false, {
                fileName: "[project]/src/components/knowledge-graph.tsx",
                lineNumber: 144,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/src/components/knowledge-graph.tsx",
        lineNumber: 113,
        columnNumber: 5
    }, this);
}
}),
"[project]/src/app/page.tsx [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>Home
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-dev-runtime.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hooks$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/hooks.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$api$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/api.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$client$2f$app$2d$dir$2f$link$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/client/app-dir/link.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$thinking$2d$line$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/components/thinking-line.tsx [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$health$2d$indicator$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/components/health-indicator.tsx [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$intent$2d$input$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/components/intent-input.tsx [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$pipeline$2d$view$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/components/pipeline-view.tsx [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$dependency$2d$graph$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/components/dependency-graph.tsx [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$activity$2d$timeline$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/components/activity-timeline.tsx [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$knowledge$2d$graph$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/components/knowledge-graph.tsx [app-ssr] (ecmascript)");
"use client";
;
;
;
;
;
;
;
;
;
;
;
;
function Home() {
    const [tab, setTab] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])("builds");
    const [buildActive, setBuildActive] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(false);
    const [pipelineRunning, setPipelineRunning] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(false);
    const [pipelineStage, setPipelineStage] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])("");
    const [pipelineMessage, setPipelineMessage] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])("");
    const [promoted, setPromoted] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(false);
    const [appId, setAppId] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(null);
    const [jobId, setJobId] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(null);
    const [needsConfirmation, setNeedsConfirmation] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(false);
    const [needsApproval, setNeedsApproval] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(false);
    const [approvalData, setApprovalData] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(null);
    const { data: health, error: healthError } = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hooks$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useHealth"])();
    const { data: orchHealth } = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hooks$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useOrchestratorHealth"])();
    const { data: orch } = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hooks$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useOrchestrator"])(buildActive);
    const { data: events } = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hooks$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useOrchestratorEvents"])(buildActive);
    const { data: agentStatus } = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hooks$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useAgentStatus"])(buildActive && !pipelineRunning);
    const agentThinkingText = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hooks$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useThinkingText"])(buildActive && !pipelineRunning ? agentStatus : null);
    // SSE stream from LangGraph orchestrator
    const { messages: sseMessages, lastEvent } = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hooks$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useOrchestratorStream"])(jobId);
    const { data: jobStatus } = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$hooks$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useOrchestratorJobStatus"])(jobId, buildActive);
    // Derive thinking text from SSE events
    const sseThinkingText = lastEvent ? String(lastEvent.data?.message ?? lastEvent.data?.gate ?? lastEvent.event) : pipelineMessage;
    const thinkingText = jobId ? sseThinkingText : pipelineRunning ? pipelineMessage : agentThinkingText;
    // Map SSE gate events to pipeline stages
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        if (!lastEvent) return;
        const { event, data } = lastEvent;
        if (event === "gate") {
            const gate = String(data.gate ?? "");
            const stageMap = {
                gate_0: "intake",
                research: "research",
                gate_1: "decompose",
                gate_2: "verify",
                gate_3: "promote",
                building: "building",
                validation: "validation",
                deploying: "deploying"
            };
            setPipelineStage(stageMap[gate] ?? gate);
            setPipelineMessage(String(data.message ?? ""));
        } else if (event === "step" || event === "success" || event === "warn") {
            setPipelineMessage(String(data.message ?? ""));
        } else if (event === "fail") {
            setPipelineMessage(`⚠ ${data.message ?? "Failed"}`);
        } else if (event === "needs_confirmation") {
            setNeedsConfirmation(true);
            setPipelineMessage(String(data.statement ?? "Confirm intent?"));
        } else if (event === "needs_approval") {
            setNeedsApproval(true);
            setApprovalData(data);
            setPipelineMessage(String(data.prompt ?? "Review and approve the plan"));
        } else if (event === "complete") {
            setPipelineRunning(false);
            const hasError = !!data.error;
            setPromoted(!hasError);
            setPipelineMessage(hasError ? String(data.error) : "Pipeline complete");
        } else if (event === "error") {
            setPipelineRunning(false);
            setPipelineMessage(`Error: ${data.message ?? "Unknown error"}`);
        } else if (event === "feature") {
            setPipelineMessage(`${data.name}: ${data.status}`);
        }
    }, [
        lastEvent
    ]);
    const isConnected = !!health && !healthError;
    const orchConnected = !!orchHealth;
    const handleSubmitIntent = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useCallback"])(async (intent, targetPath)=>{
        try {
            setBuildActive(true);
            setPipelineRunning(true);
            setPipelineStage("intake");
            setPipelineMessage("Starting orchestrator...");
            // Try LangGraph orchestrator first
            if (orchConnected) {
                const result = await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$api$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["orchestrator"].startBuild(intent, targetPath);
                setJobId(result.jobId);
                setPipelineMessage("Pipeline started — streaming events...");
                return;
            }
            // Fallback to legacy pipeline
            const result = await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$api$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["api"].runPipeline(intent, (stage, message)=>{
                setPipelineStage(stage);
                setPipelineMessage(message);
            });
            setAppId(result.app_id);
            setPromoted(result.promoted);
            setPipelineRunning(false);
            if (!result.promoted) {
                setPipelineMessage(result.error ?? "Pipeline blocked");
            }
        } catch (err) {
            console.error("Pipeline failed:", err);
            setPipelineRunning(false);
            setPipelineMessage(`Error: ${err}`);
        }
    }, [
        orchConnected
    ]);
    const handleConfirm = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useCallback"])(async ()=>{
        if (!jobId) return;
        try {
            await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$api$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["orchestrator"].confirmIntent(jobId);
            setNeedsConfirmation(false);
            setPipelineMessage("Intent confirmed — continuing...");
        } catch (err) {
            console.error("Failed to confirm:", err);
        }
    }, [
        jobId
    ]);
    const handleApprove = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useCallback"])(async ()=>{
        if (jobId) {
            try {
                await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$api$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["orchestrator"].approvePlan(jobId);
                setNeedsApproval(false);
                setPipelineMessage("Plan approved — building...");
            } catch (err) {
                console.error("Failed to approve:", err);
            }
            return;
        }
        if (!appId) return;
        try {
            await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$api$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["api"].appPromote(appId);
        } catch (err) {
            console.error("Failed to approve:", err);
        }
    }, [
        jobId,
        appId
    ]);
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "flex h-screen",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("aside", {
                className: "flex shrink-0 flex-col border-r border-[var(--border)] bg-[var(--bg-sidebar)]",
                style: {
                    width: 220
                },
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "flex items-center gap-2.5 border-b border-[var(--border)] px-6 py-5",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--text-primary)] text-xs font-bold text-white",
                                children: "A"
                            }, void 0, false, {
                                fileName: "[project]/src/app/page.tsx",
                                lineNumber: 180,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                className: "text-[15px] font-semibold tracking-tight",
                                children: "AES"
                            }, void 0, false, {
                                fileName: "[project]/src/app/page.tsx",
                                lineNumber: 183,
                                columnNumber: 11
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/src/app/page.tsx",
                        lineNumber: 179,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("nav", {
                        className: "flex-1 px-3 py-4",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "space-y-0.5",
                                children: [
                                    {
                                        id: "builds",
                                        label: "Builds"
                                    },
                                    {
                                        id: "graph",
                                        label: "Graph"
                                    },
                                    {
                                        id: "history",
                                        label: "History"
                                    }
                                ].map((item)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                        onClick: ()=>setTab(item.id),
                                        className: `flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[13px] transition-colors ${tab === item.id ? "bg-[var(--bg-card)] font-medium text-[var(--text-primary)] shadow-[0_1px_2px_rgba(0,0,0,0.04)]" : "text-[var(--text-secondary)] hover:bg-[var(--bg-card)] hover:text-[var(--text-primary)]"}`,
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(NavIcon, {
                                                id: item.id,
                                                active: tab === item.id
                                            }, void 0, false, {
                                                fileName: "[project]/src/app/page.tsx",
                                                lineNumber: 205,
                                                columnNumber: 17
                                            }, this),
                                            item.label
                                        ]
                                    }, item.id, true, {
                                        fileName: "[project]/src/app/page.tsx",
                                        lineNumber: 196,
                                        columnNumber: 15
                                    }, this))
                            }, void 0, false, {
                                fileName: "[project]/src/app/page.tsx",
                                lineNumber: 188,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "mt-3 border-t border-[var(--border)] pt-3",
                                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$client$2f$app$2d$dir$2f$link$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"], {
                                    href: "/apps",
                                    className: "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[13px] text-[var(--text-secondary)] hover:bg-[var(--bg-card)] hover:text-[var(--text-primary)] transition-colors",
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("svg", {
                                            width: "14",
                                            height: "14",
                                            viewBox: "0 0 14 14",
                                            className: "shrink-0",
                                            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("rect", {
                                                x: "3",
                                                y: "3",
                                                width: "8",
                                                height: "8",
                                                rx: "2",
                                                stroke: "#A8A29E",
                                                strokeWidth: "1.5",
                                                fill: "none"
                                            }, void 0, false, {
                                                fileName: "[project]/src/app/page.tsx",
                                                lineNumber: 218,
                                                columnNumber: 17
                                            }, this)
                                        }, void 0, false, {
                                            fileName: "[project]/src/app/page.tsx",
                                            lineNumber: 217,
                                            columnNumber: 15
                                        }, this),
                                        "Apps"
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/src/app/page.tsx",
                                    lineNumber: 213,
                                    columnNumber: 13
                                }, this)
                            }, void 0, false, {
                                fileName: "[project]/src/app/page.tsx",
                                lineNumber: 212,
                                columnNumber: 11
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/src/app/page.tsx",
                        lineNumber: 187,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "border-t border-[var(--border)] px-6 py-4 space-y-2",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$health$2d$indicator$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["HealthIndicator"], {
                                health: health,
                                error: healthError
                            }, void 0, false, {
                                fileName: "[project]/src/app/page.tsx",
                                lineNumber: 227,
                                columnNumber: 11
                            }, this),
                            orchConnected && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "flex items-center gap-1.5",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "h-1.5 w-1.5 rounded-full bg-green-500"
                                    }, void 0, false, {
                                        fileName: "[project]/src/app/page.tsx",
                                        lineNumber: 230,
                                        columnNumber: 15
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                        className: "text-[10px] text-[var(--text-muted)]",
                                        children: [
                                            "Orchestrator ",
                                            orchHealth?.version ?? "?"
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/src/app/page.tsx",
                                        lineNumber: 231,
                                        columnNumber: 15
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/src/app/page.tsx",
                                lineNumber: 229,
                                columnNumber: 13
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/src/app/page.tsx",
                        lineNumber: 226,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/src/app/page.tsx",
                lineNumber: 177,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("main", {
                className: "flex flex-1 flex-col overflow-hidden",
                children: [
                    buildActive && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "shrink-0 border-b border-[var(--border)] bg-[var(--bg-card)] px-7 py-3.5",
                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$thinking$2d$line$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["ThinkingLine"], {
                            text: thinkingText,
                            phase: needsApproval || needsConfirmation ? "blocked" : pipelineRunning ? "building" : agentStatus?.phase ?? (promoted ? "complete" : "idle")
                        }, void 0, false, {
                            fileName: "[project]/src/app/page.tsx",
                            lineNumber: 244,
                            columnNumber: 13
                        }, this)
                    }, void 0, false, {
                        fileName: "[project]/src/app/page.tsx",
                        lineNumber: 243,
                        columnNumber: 11
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "flex flex-1 overflow-hidden",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "flex-1 overflow-y-auto px-6 py-6",
                                children: [
                                    tab === "builds" && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(BuildsTab, {
                                        buildActive: buildActive,
                                        pipelineRunning: pipelineRunning,
                                        pipelineStage: pipelineStage,
                                        promoted: promoted,
                                        isConnected: isConnected || orchConnected,
                                        orchestrator: orch,
                                        appId: appId,
                                        jobId: jobId,
                                        jobStatus: jobStatus,
                                        needsConfirmation: needsConfirmation,
                                        needsApproval: needsApproval,
                                        approvalData: approvalData,
                                        sseMessages: sseMessages,
                                        onSubmitIntent: handleSubmitIntent,
                                        onApprove: handleApprove,
                                        onConfirm: handleConfirm
                                    }, void 0, false, {
                                        fileName: "[project]/src/app/page.tsx",
                                        lineNumber: 262,
                                        columnNumber: 15
                                    }, this),
                                    tab === "graph" && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$knowledge$2d$graph$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["KnowledgeGraph"], {}, void 0, false, {
                                        fileName: "[project]/src/app/page.tsx",
                                        lineNumber: 282,
                                        columnNumber: 33
                                    }, this),
                                    tab === "history" && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(HistoryTab, {}, void 0, false, {
                                        fileName: "[project]/src/app/page.tsx",
                                        lineNumber: 284,
                                        columnNumber: 35
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/src/app/page.tsx",
                                lineNumber: 260,
                                columnNumber: 11
                            }, this),
                            buildActive && tab === "builds" && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("aside", {
                                className: "shrink-0 overflow-y-auto border-l border-[var(--border)] bg-[var(--bg-sidebar)] px-5 py-6",
                                style: {
                                    width: 260
                                },
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("h2", {
                                        className: "mb-4 text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--text-muted)]",
                                        children: "Activity"
                                    }, void 0, false, {
                                        fileName: "[project]/src/app/page.tsx",
                                        lineNumber: 290,
                                        columnNumber: 15
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$activity$2d$timeline$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["ActivityTimeline"], {
                                        events: events ?? []
                                    }, void 0, false, {
                                        fileName: "[project]/src/app/page.tsx",
                                        lineNumber: 293,
                                        columnNumber: 15
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/src/app/page.tsx",
                                lineNumber: 289,
                                columnNumber: 13
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/src/app/page.tsx",
                        lineNumber: 258,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/src/app/page.tsx",
                lineNumber: 240,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/src/app/page.tsx",
        lineNumber: 175,
        columnNumber: 5
    }, this);
}
/* ── Pipeline Stage Indicator ── */ const PIPELINE_STAGES = [
    {
        id: "intake",
        label: "Intake"
    },
    {
        id: "research",
        label: "Research"
    },
    {
        id: "decompose",
        label: "Decompose"
    },
    {
        id: "verify",
        label: "Verify"
    },
    {
        id: "promote",
        label: "Promote"
    },
    {
        id: "building",
        label: "Build"
    },
    {
        id: "validation",
        label: "Validate"
    },
    {
        id: "deploying",
        label: "Deploy"
    }
];
function PipelineStageRail({ currentStage }) {
    const stageOrder = PIPELINE_STAGES.map((s)=>s.id);
    const currentIdx = stageOrder.indexOf(currentStage);
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "flex items-center gap-1",
        children: PIPELINE_STAGES.map((stage, i)=>{
            const isDone = i < currentIdx || currentStage === "promoted";
            const isActive = i === currentIdx && currentStage !== "promoted";
            return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "flex items-center gap-1",
                children: [
                    i > 0 && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: `h-px w-6 ${isDone ? "bg-green-500" : "bg-[var(--border)]"}`
                    }, void 0, false, {
                        fileName: "[project]/src/app/page.tsx",
                        lineNumber: 326,
                        columnNumber: 15
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "flex items-center gap-1.5",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: `h-2.5 w-2.5 rounded-full transition-colors ${isDone ? "bg-green-500" : isActive ? "bg-[var(--accent)] animate-pulse" : "bg-[var(--border)]"}`
                            }, void 0, false, {
                                fileName: "[project]/src/app/page.tsx",
                                lineNumber: 331,
                                columnNumber: 15
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                className: `text-[11px] ${isDone ? "text-green-600 font-medium" : isActive ? "text-[var(--accent)] font-medium" : "text-[var(--text-muted)]"}`,
                                children: stage.label
                            }, void 0, false, {
                                fileName: "[project]/src/app/page.tsx",
                                lineNumber: 340,
                                columnNumber: 15
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/src/app/page.tsx",
                        lineNumber: 330,
                        columnNumber: 13
                    }, this)
                ]
            }, stage.id, true, {
                fileName: "[project]/src/app/page.tsx",
                lineNumber: 324,
                columnNumber: 11
            }, this);
        })
    }, void 0, false, {
        fileName: "[project]/src/app/page.tsx",
        lineNumber: 319,
        columnNumber: 5
    }, this);
}
/* ── Builds Tab ── */ function BuildsTab({ buildActive, pipelineRunning, pipelineStage, promoted, isConnected, orchestrator, appId, jobId, jobStatus, needsConfirmation, needsApproval, approvalData, sseMessages, onSubmitIntent, onApprove, onConfirm }) {
    if (!buildActive) {
        return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
            className: "flex h-full items-center justify-center",
            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$intent$2d$input$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["IntentInput"], {
                onSubmit: onSubmitIntent,
                disabled: !isConnected
            }, void 0, false, {
                fileName: "[project]/src/app/page.tsx",
                lineNumber: 398,
                columnNumber: 9
            }, this)
        }, void 0, false, {
            fileName: "[project]/src/app/page.tsx",
            lineNumber: 397,
            columnNumber: 7
        }, this);
    }
    // Human gate: needs confirmation
    if (needsConfirmation) {
        return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
            className: "flex h-full flex-col items-center justify-center gap-6",
            children: [
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(PipelineStageRail, {
                    currentStage: pipelineStage
                }, void 0, false, {
                    fileName: "[project]/src/app/page.tsx",
                    lineNumber: 410,
                    columnNumber: 9
                }, this),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "max-w-md space-y-4 text-center",
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-amber-100",
                            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                className: "text-lg",
                                children: "🤔"
                            }, void 0, false, {
                                fileName: "[project]/src/app/page.tsx",
                                lineNumber: 413,
                                columnNumber: 13
                            }, this)
                        }, void 0, false, {
                            fileName: "[project]/src/app/page.tsx",
                            lineNumber: 412,
                            columnNumber: 11
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("h2", {
                            className: "text-lg font-semibold text-[var(--text-primary)]",
                            children: "Confirm Intent"
                        }, void 0, false, {
                            fileName: "[project]/src/app/page.tsx",
                            lineNumber: 415,
                            columnNumber: 11
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                            className: "text-sm text-[var(--text-secondary)]",
                            children: "The system classified your intent and needs confirmation before proceeding."
                        }, void 0, false, {
                            fileName: "[project]/src/app/page.tsx",
                            lineNumber: 418,
                            columnNumber: 11
                        }, this),
                        jobId && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                            className: "text-xs font-mono text-[var(--text-muted)]",
                            children: [
                                "Job: ",
                                jobId
                            ]
                        }, void 0, true, {
                            fileName: "[project]/src/app/page.tsx",
                            lineNumber: 422,
                            columnNumber: 13
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                            onClick: onConfirm,
                            className: "rounded-lg bg-[var(--text-primary)] px-6 py-2.5 text-sm font-medium text-white transition-all hover:opacity-90",
                            children: "Confirm & Continue"
                        }, void 0, false, {
                            fileName: "[project]/src/app/page.tsx",
                            lineNumber: 424,
                            columnNumber: 11
                        }, this)
                    ]
                }, void 0, true, {
                    fileName: "[project]/src/app/page.tsx",
                    lineNumber: 411,
                    columnNumber: 9
                }, this)
            ]
        }, void 0, true, {
            fileName: "[project]/src/app/page.tsx",
            lineNumber: 409,
            columnNumber: 7
        }, this);
    }
    // Human gate: needs approval
    if (needsApproval) {
        const specRaw = approvalData?.data?.appSpec ?? approvalData?.appSpec;
        const spec = specRaw;
        return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
            className: "flex h-full flex-col items-center gap-6 overflow-y-auto py-8",
            children: [
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(PipelineStageRail, {
                    currentStage: "promote"
                }, void 0, false, {
                    fileName: "[project]/src/app/page.tsx",
                    lineNumber: 441,
                    columnNumber: 9
                }, this),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "max-w-lg space-y-4 text-center",
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-blue-100",
                            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                className: "text-lg",
                                children: "📋"
                            }, void 0, false, {
                                fileName: "[project]/src/app/page.tsx",
                                lineNumber: 444,
                                columnNumber: 13
                            }, this)
                        }, void 0, false, {
                            fileName: "[project]/src/app/page.tsx",
                            lineNumber: 443,
                            columnNumber: 11
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("h2", {
                            className: "text-lg font-semibold text-[var(--text-primary)]",
                            children: "Review & Approve Plan"
                        }, void 0, false, {
                            fileName: "[project]/src/app/page.tsx",
                            lineNumber: 446,
                            columnNumber: 11
                        }, this),
                        spec && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-4 text-left",
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                    className: "text-sm font-medium",
                                    children: String(spec.title ?? "")
                                }, void 0, false, {
                                    fileName: "[project]/src/app/page.tsx",
                                    lineNumber: 451,
                                    columnNumber: 15
                                }, this),
                                spec.summary != null && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                    className: "mt-1 text-xs text-[var(--text-secondary)]",
                                    children: String(spec.summary)
                                }, void 0, false, {
                                    fileName: "[project]/src/app/page.tsx",
                                    lineNumber: 453,
                                    columnNumber: 17
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                    className: "mt-1 text-xs text-[var(--text-muted)]",
                                    children: [
                                        String(spec.app_class ?? "").replace(/_/g, " "),
                                        " · ",
                                        Array.isArray(spec.features) ? spec.features.length : String(spec.features ?? 0),
                                        " features · ",
                                        Array.isArray(spec.roles) ? spec.roles.length : String(spec.roles ?? 0),
                                        " roles"
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/src/app/page.tsx",
                                    lineNumber: 455,
                                    columnNumber: 15
                                }, this),
                                spec.confidence != null && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                    className: "mt-1 text-xs text-[var(--text-muted)]",
                                    children: [
                                        "Confidence: ",
                                        Math.round(Number(spec.confidence?.overall ?? spec.confidence) * 100),
                                        "%"
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/src/app/page.tsx",
                                    lineNumber: 459,
                                    columnNumber: 17
                                }, this),
                                Array.isArray(spec.features) && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "mt-3 max-h-40 space-y-1 overflow-y-auto",
                                    children: spec.features.map((f, i)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: "flex items-center gap-2",
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                    className: `h-1.5 w-1.5 rounded-full ${f.priority === "critical" ? "bg-red-500" : f.priority === "high" ? "bg-amber-500" : "bg-[var(--border)]"}`
                                                }, void 0, false, {
                                                    fileName: "[project]/src/app/page.tsx",
                                                    lineNumber: 467,
                                                    columnNumber: 23
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                    className: "text-[11px] text-[var(--text-secondary)]",
                                                    children: f.name
                                                }, void 0, false, {
                                                    fileName: "[project]/src/app/page.tsx",
                                                    lineNumber: 468,
                                                    columnNumber: 23
                                                }, this)
                                            ]
                                        }, i, true, {
                                            fileName: "[project]/src/app/page.tsx",
                                            lineNumber: 466,
                                            columnNumber: 21
                                        }, this))
                                }, void 0, false, {
                                    fileName: "[project]/src/app/page.tsx",
                                    lineNumber: 464,
                                    columnNumber: 17
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/src/app/page.tsx",
                            lineNumber: 450,
                            columnNumber: 13
                        }, this),
                        jobId && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                            className: "text-xs font-mono text-[var(--text-muted)]",
                            children: [
                                "Job: ",
                                jobId
                            ]
                        }, void 0, true, {
                            fileName: "[project]/src/app/page.tsx",
                            lineNumber: 476,
                            columnNumber: 13
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                            onClick: onApprove,
                            className: "rounded-lg bg-green-600 px-6 py-2.5 text-sm font-medium text-white transition-all hover:opacity-90",
                            children: "Approve & Build"
                        }, void 0, false, {
                            fileName: "[project]/src/app/page.tsx",
                            lineNumber: 478,
                            columnNumber: 11
                        }, this)
                    ]
                }, void 0, true, {
                    fileName: "[project]/src/app/page.tsx",
                    lineNumber: 442,
                    columnNumber: 9
                }, this)
            ]
        }, void 0, true, {
            fileName: "[project]/src/app/page.tsx",
            lineNumber: 440,
            columnNumber: 7
        }, this);
    }
    // Pipeline is running — show stage rail + SSE activity
    if (pipelineRunning) {
        // Map orchestrator gates to pipeline stage names
        const gateToStage = {
            gate_0: "intake",
            gate_1: "decompose",
            gate_2: "verify",
            gate_3: "promote",
            building: "building",
            validation: "validation"
        };
        const displayStage = gateToStage[pipelineStage] ?? pipelineStage;
        return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
            className: "flex h-full flex-col items-center justify-center gap-6",
            children: [
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(PipelineStageRail, {
                    currentStage: displayStage
                }, void 0, false, {
                    fileName: "[project]/src/app/page.tsx",
                    lineNumber: 504,
                    columnNumber: 9
                }, this),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                    className: "text-sm text-[var(--text-secondary)]",
                    children: jobId ? "Orchestrator is processing your intent..." : "Processing your intent through the AES pipeline..."
                }, void 0, false, {
                    fileName: "[project]/src/app/page.tsx",
                    lineNumber: 505,
                    columnNumber: 9
                }, this),
                jobId && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                    className: "text-xs font-mono text-[var(--text-muted)]",
                    children: [
                        "Job: ",
                        jobId
                    ]
                }, void 0, true, {
                    fileName: "[project]/src/app/page.tsx",
                    lineNumber: 509,
                    columnNumber: 11
                }, this),
                appId && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                    className: "text-xs text-[var(--text-muted)]",
                    children: [
                        "App: ",
                        appId
                    ]
                }, void 0, true, {
                    fileName: "[project]/src/app/page.tsx",
                    lineNumber: 514,
                    columnNumber: 11
                }, this),
                sseMessages.length > 0 && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "mt-4 w-full max-w-xl",
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("h3", {
                            className: "mb-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]",
                            children: "Live Events"
                        }, void 0, false, {
                            fileName: "[project]/src/app/page.tsx",
                            lineNumber: 522,
                            columnNumber: 13
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "max-h-48 overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-3",
                            children: sseMessages.slice(-20).map((msg, i)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "flex items-start gap-2 py-0.5",
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                            className: `mt-0.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full ${msg.event === "success" ? "bg-green-500" : msg.event === "fail" ? "bg-red-500" : msg.event === "warn" ? "bg-amber-500" : msg.event === "gate" ? "bg-blue-500" : "bg-[var(--border)]"}`
                                        }, void 0, false, {
                                            fileName: "[project]/src/app/page.tsx",
                                            lineNumber: 528,
                                            columnNumber: 19
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                            className: "text-[11px] text-[var(--text-secondary)]",
                                            children: String(msg.data?.message ?? msg.data?.gate ?? msg.event)
                                        }, void 0, false, {
                                            fileName: "[project]/src/app/page.tsx",
                                            lineNumber: 535,
                                            columnNumber: 19
                                        }, this)
                                    ]
                                }, i, true, {
                                    fileName: "[project]/src/app/page.tsx",
                                    lineNumber: 527,
                                    columnNumber: 17
                                }, this))
                        }, void 0, false, {
                            fileName: "[project]/src/app/page.tsx",
                            lineNumber: 525,
                            columnNumber: 13
                        }, this)
                    ]
                }, void 0, true, {
                    fileName: "[project]/src/app/page.tsx",
                    lineNumber: 521,
                    columnNumber: 11
                }, this)
            ]
        }, void 0, true, {
            fileName: "[project]/src/app/page.tsx",
            lineNumber: 503,
            columnNumber: 7
        }, this);
    }
    // Pipeline complete — orchestrator job has features
    if (jobStatus?.appSpec) {
        return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
            className: "flex h-full flex-col items-center justify-center gap-4",
            children: [
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: `h-4 w-4 rounded-full ${promoted ? "bg-green-500" : jobStatus.errorMessage ? "bg-red-500" : "bg-[var(--accent)]"}`
                }, void 0, false, {
                    fileName: "[project]/src/app/page.tsx",
                    lineNumber: 551,
                    columnNumber: 9
                }, this),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("h2", {
                    className: "text-lg font-semibold text-[var(--text-primary)]",
                    children: promoted ? "Build Complete" : jobStatus.errorMessage ? "Pipeline Failed" : "Pipeline Complete"
                }, void 0, false, {
                    fileName: "[project]/src/app/page.tsx",
                    lineNumber: 552,
                    columnNumber: 9
                }, this),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-4 text-center",
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                            className: "text-sm font-medium",
                            children: jobStatus.appSpec.title
                        }, void 0, false, {
                            fileName: "[project]/src/app/page.tsx",
                            lineNumber: 556,
                            columnNumber: 11
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                            className: "mt-1 text-xs text-[var(--text-secondary)]",
                            children: [
                                String(jobStatus.appSpec.app_class).replace(/_/g, " "),
                                " · ",
                                jobStatus.appSpec.features,
                                " features · ",
                                jobStatus.appSpec.roles,
                                " roles"
                            ]
                        }, void 0, true, {
                            fileName: "[project]/src/app/page.tsx",
                            lineNumber: 557,
                            columnNumber: 11
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                            className: "mt-1 text-xs text-[var(--text-muted)]",
                            children: [
                                "Gate: ",
                                jobStatus.currentGate,
                                jobStatus.appSpec.confidence != null && !isNaN(Number(jobStatus.appSpec.confidence)) ? ` · Confidence: ${Math.round(Number(jobStatus.appSpec.confidence) * 100)}%` : ""
                            ]
                        }, void 0, true, {
                            fileName: "[project]/src/app/page.tsx",
                            lineNumber: 560,
                            columnNumber: 11
                        }, this)
                    ]
                }, void 0, true, {
                    fileName: "[project]/src/app/page.tsx",
                    lineNumber: 555,
                    columnNumber: 9
                }, this),
                jobStatus.targetPath && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg-sidebar)] px-3 py-2",
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("svg", {
                            width: "14",
                            height: "14",
                            viewBox: "0 0 14 14",
                            className: "shrink-0 text-[var(--text-muted)]",
                            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("path", {
                                d: "M2 3.5A1.5 1.5 0 0 1 3.5 2H6l1 1.5h3.5A1.5 1.5 0 0 1 12 5v5.5A1.5 1.5 0 0 1 10.5 12h-7A1.5 1.5 0 0 1 2 10.5z",
                                stroke: "currentColor",
                                strokeWidth: "1",
                                fill: "none"
                            }, void 0, false, {
                                fileName: "[project]/src/app/page.tsx",
                                lineNumber: 567,
                                columnNumber: 15
                            }, this)
                        }, void 0, false, {
                            fileName: "[project]/src/app/page.tsx",
                            lineNumber: 566,
                            columnNumber: 13
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("code", {
                            className: "font-mono text-[11px] text-[var(--text-secondary)]",
                            children: jobStatus.targetPath
                        }, void 0, false, {
                            fileName: "[project]/src/app/page.tsx",
                            lineNumber: 569,
                            columnNumber: 13
                        }, this)
                    ]
                }, void 0, true, {
                    fileName: "[project]/src/app/page.tsx",
                    lineNumber: 565,
                    columnNumber: 11
                }, this),
                jobStatus.errorMessage && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                    className: "text-xs text-red-600",
                    children: jobStatus.errorMessage
                }, void 0, false, {
                    fileName: "[project]/src/app/page.tsx",
                    lineNumber: 573,
                    columnNumber: 11
                }, this),
                jobId && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                    className: "text-xs font-mono text-[var(--text-muted)]",
                    children: jobId
                }, void 0, false, {
                    fileName: "[project]/src/app/page.tsx",
                    lineNumber: 576,
                    columnNumber: 11
                }, this)
            ]
        }, void 0, true, {
            fileName: "[project]/src/app/page.tsx",
            lineNumber: 550,
            columnNumber: 7
        }, this);
    }
    // Promoted via legacy pipeline, show features
    if (promoted && orchestrator?.features?.length) {
        const features = orchestrator.features;
        return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
            className: "space-y-8",
            children: [
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("section", {
                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$pipeline$2d$view$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["PipelineView"], {
                        features: features,
                        activePhase: orchestrator?.phase,
                        onApprove: onApprove
                    }, void 0, false, {
                        fileName: "[project]/src/app/page.tsx",
                        lineNumber: 588,
                        columnNumber: 11
                    }, this)
                }, void 0, false, {
                    fileName: "[project]/src/app/page.tsx",
                    lineNumber: 587,
                    columnNumber: 9
                }, this),
                features.length > 1 && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("section", {
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("h2", {
                            className: "mb-3 text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]",
                            children: "Dependencies"
                        }, void 0, false, {
                            fileName: "[project]/src/app/page.tsx",
                            lineNumber: 596,
                            columnNumber: 13
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$dependency$2d$graph$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["DependencyGraph"], {
                            features: features
                        }, void 0, false, {
                            fileName: "[project]/src/app/page.tsx",
                            lineNumber: 599,
                            columnNumber: 13
                        }, this)
                    ]
                }, void 0, true, {
                    fileName: "[project]/src/app/page.tsx",
                    lineNumber: 595,
                    columnNumber: 11
                }, this)
            ]
        }, void 0, true, {
            fileName: "[project]/src/app/page.tsx",
            lineNumber: 586,
            columnNumber: 7
        }, this);
    }
    // Pipeline complete — show status
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "flex h-full flex-col items-center justify-center gap-4",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: `h-4 w-4 rounded-full ${promoted ? "bg-green-500" : "bg-[var(--accent)]"}`
            }, void 0, false, {
                fileName: "[project]/src/app/page.tsx",
                lineNumber: 609,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("h2", {
                className: "text-lg font-semibold text-[var(--text-primary)]",
                children: promoted ? "Plan Promoted" : "Pipeline Complete"
            }, void 0, false, {
                fileName: "[project]/src/app/page.tsx",
                lineNumber: 610,
                columnNumber: 7
            }, this),
            appId && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                className: "text-xs font-mono text-[var(--text-muted)]",
                children: appId
            }, void 0, false, {
                fileName: "[project]/src/app/page.tsx",
                lineNumber: 614,
                columnNumber: 9
            }, this),
            jobId && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                className: "text-xs font-mono text-[var(--text-muted)]",
                children: jobId
            }, void 0, false, {
                fileName: "[project]/src/app/page.tsx",
                lineNumber: 617,
                columnNumber: 9
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                className: "text-sm text-[var(--text-secondary)]",
                children: promoted ? "Features are ready. Approve to start building." : "Review the pipeline result. Some gates may need attention."
            }, void 0, false, {
                fileName: "[project]/src/app/page.tsx",
                lineNumber: 619,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/src/app/page.tsx",
        lineNumber: 608,
        columnNumber: 5
    }, this);
}
/* ── Nav Icon (matches Paper design) ── */ function NavIcon({ id, active }) {
    if (id === "builds") {
        return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("svg", {
            width: "14",
            height: "14",
            viewBox: "0 0 14 14",
            className: "shrink-0",
            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("circle", {
                cx: "7",
                cy: "7",
                r: "3",
                fill: active ? "#D97706" : "#A8A29E"
            }, void 0, false, {
                fileName: "[project]/src/app/page.tsx",
                lineNumber: 633,
                columnNumber: 9
            }, this)
        }, void 0, false, {
            fileName: "[project]/src/app/page.tsx",
            lineNumber: 632,
            columnNumber: 7
        }, this);
    }
    if (id === "graph") {
        return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("svg", {
            width: "14",
            height: "14",
            viewBox: "0 0 14 14",
            className: "shrink-0",
            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("circle", {
                cx: "7",
                cy: "7",
                r: "3",
                stroke: active ? "#1C1917" : "#A8A29E",
                strokeWidth: "1.5",
                fill: "none"
            }, void 0, false, {
                fileName: "[project]/src/app/page.tsx",
                lineNumber: 640,
                columnNumber: 9
            }, this)
        }, void 0, false, {
            fileName: "[project]/src/app/page.tsx",
            lineNumber: 639,
            columnNumber: 7
        }, this);
    }
    // history
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("svg", {
        width: "14",
        height: "14",
        viewBox: "0 0 14 14",
        className: "shrink-0",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("path", {
                d: "M7 3v4l2.5 1.5",
                stroke: active ? "#1C1917" : "#A8A29E",
                strokeWidth: "1.5",
                strokeLinecap: "round",
                fill: "none"
            }, void 0, false, {
                fileName: "[project]/src/app/page.tsx",
                lineNumber: 647,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("circle", {
                cx: "7",
                cy: "7",
                r: "4.5",
                stroke: active ? "#1C1917" : "#A8A29E",
                strokeWidth: "1.5",
                fill: "none"
            }, void 0, false, {
                fileName: "[project]/src/app/page.tsx",
                lineNumber: 648,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/src/app/page.tsx",
        lineNumber: 646,
        columnNumber: 5
    }, this);
}
/* ── History Tab ── */ function HistoryTab() {
    const [attentionQueue, setAttentionQueue] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(null);
    const [buildId, setBuildId] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])("");
    const [replay, setReplay] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(null);
    const [replayError, setReplayError] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])("");
    const [loading, setLoading] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(false);
    const [escalationLoading, setEscalationLoading] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])({});
    const [escalationErrors, setEscalationErrors] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])({});
    const [retryLoading, setRetryLoading] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])({});
    const [retryErrors, setRetryErrors] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])({});
    const handleEscalationAction = async (artifactId, action)=>{
        setEscalationLoading((prev)=>({
                ...prev,
                [artifactId]: action
            }));
        setEscalationErrors((prev)=>{
            const n = {
                ...prev
            };
            delete n[artifactId];
            return n;
        });
        try {
            if (action === "approve") {
                await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$api$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["api"].escalationApprove(artifactId, "operator", "Approved from UI");
            } else {
                await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$api$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["api"].escalationReject(artifactId, "operator", "Rejected from UI");
            }
            // Remove from list on success
            setAttentionQueue((prev)=>{
                if (!prev) return prev;
                return {
                    ...prev,
                    pending_escalations: prev.pending_escalations.filter((e)=>e.artifact_id !== artifactId)
                };
            });
        } catch (err) {
            setEscalationErrors((prev)=>({
                    ...prev,
                    [artifactId]: `Failed to ${action}: ${err}`
                }));
        } finally{
            setEscalationLoading((prev)=>{
                const n = {
                    ...prev
                };
                delete n[artifactId];
                return n;
            });
        }
    };
    const handleRetryBuild = async (buildArtifactId)=>{
        setRetryLoading((prev)=>({
                ...prev,
                [buildArtifactId]: true
            }));
        setRetryErrors((prev)=>{
            const n = {
                ...prev
            };
            delete n[buildArtifactId];
            return n;
        });
        try {
            await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$api$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["api"].buildReplay(buildArtifactId);
            // Remove from blocked list on success
            setAttentionQueue((prev)=>{
                if (!prev) return prev;
                return {
                    ...prev,
                    blocked_builds: prev.blocked_builds.filter((b)=>b.artifact_id !== buildArtifactId)
                };
            });
        } catch (err) {
            setRetryErrors((prev)=>({
                    ...prev,
                    [buildArtifactId]: `Retry failed: ${err}`
                }));
        } finally{
            setRetryLoading((prev)=>({
                    ...prev,
                    [buildArtifactId]: false
                }));
        }
    };
    // Load attention queue on mount
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$api$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["api"].attentionQueue().then(setAttentionQueue).catch(()=>{});
    }, []);
    const handleLoadReplay = async ()=>{
        if (!buildId.trim()) return;
        setLoading(true);
        setReplayError("");
        setReplay(null);
        try {
            const r = await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$api$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["api"].buildReplay(buildId.trim());
            setReplay(r);
        } catch (err) {
            setReplayError(`Failed to load: ${err}`);
        } finally{
            setLoading(false);
        }
    };
    const blockedBuilds = attentionQueue?.blocked_builds ?? [];
    const pendingEscalations = attentionQueue?.pending_escalations ?? [];
    const staleBridges = attentionQueue?.stale_bridges ?? [];
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "space-y-8",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("h2", {
                        className: "text-lg font-semibold text-[var(--text-primary)]",
                        children: "Build History & Audit"
                    }, void 0, false, {
                        fileName: "[project]/src/app/page.tsx",
                        lineNumber: 736,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                        className: "mt-1 text-sm text-[var(--text-secondary)]",
                        children: "Attention items, build replays, and audit trails."
                    }, void 0, false, {
                        fileName: "[project]/src/app/page.tsx",
                        lineNumber: 739,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/src/app/page.tsx",
                lineNumber: 735,
                columnNumber: 7
            }, this),
            attentionQueue && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "space-y-4",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("h3", {
                        className: "text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]",
                        children: "Attention Queue"
                    }, void 0, false, {
                        fileName: "[project]/src/app/page.tsx",
                        lineNumber: 747,
                        columnNumber: 11
                    }, this),
                    blockedBuilds.length === 0 && pendingEscalations.length === 0 && staleBridges.length === 0 && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                        className: "text-sm text-[var(--text-muted)]",
                        children: "No items needing attention."
                    }, void 0, false, {
                        fileName: "[project]/src/app/page.tsx",
                        lineNumber: 752,
                        columnNumber: 13
                    }, this),
                    blockedBuilds.length > 0 && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "space-y-2",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                className: "text-xs font-medium text-red-600",
                                children: [
                                    "Blocked Builds (",
                                    blockedBuilds.length,
                                    ")"
                                ]
                            }, void 0, true, {
                                fileName: "[project]/src/app/page.tsx",
                                lineNumber: 757,
                                columnNumber: 15
                            }, this),
                            blockedBuilds.map((item)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "rounded-lg border border-red-200 bg-red-50 px-4 py-3",
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: "flex items-center justify-between",
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                    className: "text-xs font-mono text-[var(--text-primary)]",
                                                    children: item.artifact_id
                                                }, void 0, false, {
                                                    fileName: "[project]/src/app/page.tsx",
                                                    lineNumber: 766,
                                                    columnNumber: 21
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                    className: "rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-medium text-red-700",
                                                    children: item.payload.status
                                                }, void 0, false, {
                                                    fileName: "[project]/src/app/page.tsx",
                                                    lineNumber: 769,
                                                    columnNumber: 21
                                                }, this)
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/src/app/page.tsx",
                                            lineNumber: 765,
                                            columnNumber: 19
                                        }, this),
                                        item.payload.feature_id && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                            className: "mt-1 text-xs text-[var(--text-secondary)]",
                                            children: [
                                                "Feature: ",
                                                item.payload.feature_id
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/src/app/page.tsx",
                                            lineNumber: 774,
                                            columnNumber: 21
                                        }, this),
                                        item.payload.queued_at && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                            className: "mt-0.5 text-[10px] text-[var(--text-muted)]",
                                            children: [
                                                "Queued: ",
                                                new Date(item.payload.queued_at).toLocaleString()
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/src/app/page.tsx",
                                            lineNumber: 779,
                                            columnNumber: 21
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: "mt-2 flex items-center gap-3",
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                    onClick: ()=>setBuildId(item.artifact_id),
                                                    className: "text-[11px] text-[var(--accent)] hover:underline",
                                                    children: "Load replay"
                                                }, void 0, false, {
                                                    fileName: "[project]/src/app/page.tsx",
                                                    lineNumber: 784,
                                                    columnNumber: 21
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                    onClick: ()=>handleRetryBuild(item.artifact_id),
                                                    disabled: retryLoading[item.artifact_id],
                                                    className: "rounded-md bg-amber-600 px-3 py-1 text-[11px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40",
                                                    children: retryLoading[item.artifact_id] ? "Retrying..." : "Retry"
                                                }, void 0, false, {
                                                    fileName: "[project]/src/app/page.tsx",
                                                    lineNumber: 790,
                                                    columnNumber: 21
                                                }, this)
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/src/app/page.tsx",
                                            lineNumber: 783,
                                            columnNumber: 19
                                        }, this),
                                        retryErrors[item.artifact_id] && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                            className: "mt-1 text-[10px] text-red-600",
                                            children: retryErrors[item.artifact_id]
                                        }, void 0, false, {
                                            fileName: "[project]/src/app/page.tsx",
                                            lineNumber: 799,
                                            columnNumber: 21
                                        }, this)
                                    ]
                                }, item.artifact_id, true, {
                                    fileName: "[project]/src/app/page.tsx",
                                    lineNumber: 761,
                                    columnNumber: 17
                                }, this))
                        ]
                    }, void 0, true, {
                        fileName: "[project]/src/app/page.tsx",
                        lineNumber: 756,
                        columnNumber: 13
                    }, this),
                    pendingEscalations.length > 0 && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "space-y-2",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                className: "text-xs font-medium text-[var(--accent)]",
                                children: [
                                    "Pending Escalations (",
                                    pendingEscalations.length,
                                    ")"
                                ]
                            }, void 0, true, {
                                fileName: "[project]/src/app/page.tsx",
                                lineNumber: 810,
                                columnNumber: 15
                            }, this),
                            pendingEscalations.map((item)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "rounded-lg border border-amber-200 bg-amber-50 px-4 py-3",
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                            className: "flex items-center justify-between",
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                    children: [
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                            className: "text-xs font-mono",
                                                            children: item.artifact_id
                                                        }, void 0, false, {
                                                            fileName: "[project]/src/app/page.tsx",
                                                            lineNumber: 820,
                                                            columnNumber: 23
                                                        }, this),
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                            className: "ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700",
                                                            children: item.payload.status
                                                        }, void 0, false, {
                                                            fileName: "[project]/src/app/page.tsx",
                                                            lineNumber: 821,
                                                            columnNumber: 23
                                                        }, this)
                                                    ]
                                                }, void 0, true, {
                                                    fileName: "[project]/src/app/page.tsx",
                                                    lineNumber: 819,
                                                    columnNumber: 21
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                    className: "flex items-center gap-2",
                                                    children: [
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                            onClick: ()=>handleEscalationAction(item.artifact_id, "approve"),
                                                            disabled: !!escalationLoading[item.artifact_id],
                                                            className: "rounded-md bg-green-600 px-3 py-1 text-[11px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40",
                                                            children: escalationLoading[item.artifact_id] === "approve" ? "Approving..." : "Approve"
                                                        }, void 0, false, {
                                                            fileName: "[project]/src/app/page.tsx",
                                                            lineNumber: 826,
                                                            columnNumber: 23
                                                        }, this),
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                            onClick: ()=>handleEscalationAction(item.artifact_id, "reject"),
                                                            disabled: !!escalationLoading[item.artifact_id],
                                                            className: "rounded-md bg-red-600 px-3 py-1 text-[11px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40",
                                                            children: escalationLoading[item.artifact_id] === "reject" ? "Rejecting..." : "Reject"
                                                        }, void 0, false, {
                                                            fileName: "[project]/src/app/page.tsx",
                                                            lineNumber: 833,
                                                            columnNumber: 23
                                                        }, this)
                                                    ]
                                                }, void 0, true, {
                                                    fileName: "[project]/src/app/page.tsx",
                                                    lineNumber: 825,
                                                    columnNumber: 21
                                                }, this)
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/src/app/page.tsx",
                                            lineNumber: 818,
                                            columnNumber: 19
                                        }, this),
                                        escalationErrors[item.artifact_id] && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                            className: "mt-1.5 text-[10px] text-red-600",
                                            children: escalationErrors[item.artifact_id]
                                        }, void 0, false, {
                                            fileName: "[project]/src/app/page.tsx",
                                            lineNumber: 843,
                                            columnNumber: 21
                                        }, this)
                                    ]
                                }, item.artifact_id, true, {
                                    fileName: "[project]/src/app/page.tsx",
                                    lineNumber: 814,
                                    columnNumber: 17
                                }, this))
                        ]
                    }, void 0, true, {
                        fileName: "[project]/src/app/page.tsx",
                        lineNumber: 809,
                        columnNumber: 13
                    }, this),
                    staleBridges.length > 0 && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                        className: "text-xs text-[var(--text-muted)]",
                        children: [
                            staleBridges.length,
                            " stale bridge(s)"
                        ]
                    }, void 0, true, {
                        fileName: "[project]/src/app/page.tsx",
                        lineNumber: 853,
                        columnNumber: 13
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/src/app/page.tsx",
                lineNumber: 746,
                columnNumber: 9
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "space-y-3",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("h3", {
                        className: "text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]",
                        children: "Build Replay"
                    }, void 0, false, {
                        fileName: "[project]/src/app/page.tsx",
                        lineNumber: 862,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "flex items-center gap-2",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                                type: "text",
                                value: buildId,
                                onChange: (e)=>setBuildId(e.target.value),
                                onKeyDown: (e)=>{
                                    if (e.key === "Enter") handleLoadReplay();
                                },
                                placeholder: "BLD-... or paste build ID",
                                className: "flex-1 rounded-md border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2 text-sm font-mono outline-none focus:border-[var(--accent)]"
                            }, void 0, false, {
                                fileName: "[project]/src/app/page.tsx",
                                lineNumber: 866,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                onClick: handleLoadReplay,
                                disabled: loading || !buildId.trim(),
                                className: "rounded-md bg-[var(--text-primary)] px-4 py-2 text-sm text-white disabled:opacity-30",
                                children: loading ? "Loading..." : "Load"
                            }, void 0, false, {
                                fileName: "[project]/src/app/page.tsx",
                                lineNumber: 874,
                                columnNumber: 11
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/src/app/page.tsx",
                        lineNumber: 865,
                        columnNumber: 9
                    }, this),
                    replayError && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                        className: "text-xs text-red-600",
                        children: replayError
                    }, void 0, false, {
                        fileName: "[project]/src/app/page.tsx",
                        lineNumber: 884,
                        columnNumber: 11
                    }, this),
                    replay && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-4",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "flex items-center justify-between",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                        className: "text-sm font-mono font-medium",
                                        children: replay.build_id
                                    }, void 0, false, {
                                        fileName: "[project]/src/app/page.tsx",
                                        lineNumber: 890,
                                        columnNumber: 15
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                        className: `rounded-full px-2 py-0.5 text-[10px] font-medium ${replay.build?.payload?.status === "PASSED" ? "bg-green-100 text-green-700" : replay.build?.payload?.status === "FAILED" ? "bg-red-100 text-red-700" : "bg-gray-100 text-gray-700"}`,
                                        children: replay.build?.payload?.status ?? "UNKNOWN"
                                    }, void 0, false, {
                                        fileName: "[project]/src/app/page.tsx",
                                        lineNumber: 891,
                                        columnNumber: 15
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/src/app/page.tsx",
                                lineNumber: 889,
                                columnNumber: 13
                            }, this),
                            replay.build?.payload?.feature_id && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                className: "mt-2 text-xs text-[var(--text-secondary)]",
                                children: [
                                    "Feature: ",
                                    replay.build.payload.feature_id
                                ]
                            }, void 0, true, {
                                fileName: "[project]/src/app/page.tsx",
                                lineNumber: 902,
                                columnNumber: 15
                            }, this),
                            replay.diff != null && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("details", {
                                className: "mt-3",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("summary", {
                                        className: "cursor-pointer text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)]",
                                        children: "Diff captured"
                                    }, void 0, false, {
                                        fileName: "[project]/src/app/page.tsx",
                                        lineNumber: 908,
                                        columnNumber: 17
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("pre", {
                                        className: "mt-2 max-h-48 overflow-auto rounded bg-[var(--bg-sidebar)] p-3 text-[10px] leading-relaxed",
                                        children: JSON.stringify(replay.diff, null, 2)
                                    }, void 0, false, {
                                        fileName: "[project]/src/app/page.tsx",
                                        lineNumber: 911,
                                        columnNumber: 17
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/src/app/page.tsx",
                                lineNumber: 907,
                                columnNumber: 15
                            }, this),
                            replay.test_run != null && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("details", {
                                className: "mt-2",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("summary", {
                                        className: "cursor-pointer text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)]",
                                        children: "Test run"
                                    }, void 0, false, {
                                        fileName: "[project]/src/app/page.tsx",
                                        lineNumber: 918,
                                        columnNumber: 17
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("pre", {
                                        className: "mt-2 max-h-48 overflow-auto rounded bg-[var(--bg-sidebar)] p-3 text-[10px] leading-relaxed",
                                        children: JSON.stringify(replay.test_run, null, 2)
                                    }, void 0, false, {
                                        fileName: "[project]/src/app/page.tsx",
                                        lineNumber: 921,
                                        columnNumber: 17
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/src/app/page.tsx",
                                lineNumber: 917,
                                columnNumber: 15
                            }, this),
                            replay.validation != null && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("details", {
                                className: "mt-2",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("summary", {
                                        className: "cursor-pointer text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)]",
                                        children: "Validation"
                                    }, void 0, false, {
                                        fileName: "[project]/src/app/page.tsx",
                                        lineNumber: 928,
                                        columnNumber: 17
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("pre", {
                                        className: "mt-2 max-h-48 overflow-auto rounded bg-[var(--bg-sidebar)] p-3 text-[10px] leading-relaxed",
                                        children: JSON.stringify(replay.validation, null, 2)
                                    }, void 0, false, {
                                        fileName: "[project]/src/app/page.tsx",
                                        lineNumber: 931,
                                        columnNumber: 17
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/src/app/page.tsx",
                                lineNumber: 927,
                                columnNumber: 15
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/src/app/page.tsx",
                        lineNumber: 888,
                        columnNumber: 11
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/src/app/page.tsx",
                lineNumber: 861,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/src/app/page.tsx",
        lineNumber: 734,
        columnNumber: 5
    }, this);
}
}),
];

//# sourceMappingURL=src_147fb675._.js.map