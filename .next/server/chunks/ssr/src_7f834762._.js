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
"[project]/src/app/apps/page.tsx [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>AppsPage
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-dev-runtime.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$client$2f$app$2d$dir$2f$link$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/client/app-dir/link.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$api$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/api.ts [app-ssr] (ecmascript)");
"use client";
;
;
;
;
const GATE_COLORS = {
    gate_0: "bg-blue-100 text-blue-700",
    gate_1: "bg-indigo-100 text-indigo-700",
    gate_2: "bg-amber-100 text-amber-700",
    gate_3: "bg-orange-100 text-orange-700",
    building: "bg-yellow-100 text-yellow-700",
    complete: "bg-green-100 text-green-700",
    failed: "bg-red-100 text-red-700"
};
function gateBadgeClass(gate) {
    return GATE_COLORS[gate] ?? "bg-gray-100 text-gray-700";
}
function AppsPage() {
    const [jobs, setJobs] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])([]);
    const [error, setError] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])("");
    const [search, setSearch] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])("");
    const fetchJobs = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useCallback"])(async ()=>{
        try {
            const data = await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$api$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["orchestrator"].listJobs();
            setJobs(data);
            setError("");
        } catch (err) {
            setError(`Failed to load jobs: ${err}`);
        }
    }, []);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        fetchJobs();
        const interval = setInterval(fetchJobs, 10_000);
        return ()=>clearInterval(interval);
    }, [
        fetchJobs
    ]);
    const filtered = search.trim() ? jobs.filter((j)=>j.jobId.toLowerCase().includes(search.toLowerCase()) || j.intent.toLowerCase().includes(search.toLowerCase()) || j.currentGate.toLowerCase().includes(search.toLowerCase())) : jobs;
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
                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$client$2f$app$2d$dir$2f$link$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"], {
                            href: "/",
                            className: "flex items-center gap-2.5",
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--text-primary)] text-xs font-bold text-white",
                                    children: "A"
                                }, void 0, false, {
                                    fileName: "[project]/src/app/apps/page.tsx",
                                    lineNumber: 70,
                                    columnNumber: 13
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                    className: "text-[15px] font-semibold tracking-tight",
                                    children: "AES"
                                }, void 0, false, {
                                    fileName: "[project]/src/app/apps/page.tsx",
                                    lineNumber: 73,
                                    columnNumber: 13
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/src/app/apps/page.tsx",
                            lineNumber: 69,
                            columnNumber: 11
                        }, this)
                    }, void 0, false, {
                        fileName: "[project]/src/app/apps/page.tsx",
                        lineNumber: 68,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("nav", {
                        className: "flex-1 px-3 py-4",
                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "space-y-0.5",
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$client$2f$app$2d$dir$2f$link$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"], {
                                    href: "/",
                                    className: "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[13px] text-[var(--text-secondary)] hover:bg-[var(--bg-card)] hover:text-[var(--text-primary)] transition-colors",
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("svg", {
                                            width: "14",
                                            height: "14",
                                            viewBox: "0 0 14 14",
                                            className: "shrink-0",
                                            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("circle", {
                                                cx: "7",
                                                cy: "7",
                                                r: "3",
                                                fill: "#A8A29E"
                                            }, void 0, false, {
                                                fileName: "[project]/src/app/apps/page.tsx",
                                                lineNumber: 83,
                                                columnNumber: 17
                                            }, this)
                                        }, void 0, false, {
                                            fileName: "[project]/src/app/apps/page.tsx",
                                            lineNumber: 82,
                                            columnNumber: 15
                                        }, this),
                                        "Builds"
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/src/app/apps/page.tsx",
                                    lineNumber: 78,
                                    columnNumber: 13
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[13px] bg-[var(--bg-card)] font-medium text-[var(--text-primary)] shadow-[0_1px_2px_rgba(0,0,0,0.04)]",
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
                                                fill: "#1C1917"
                                            }, void 0, false, {
                                                fileName: "[project]/src/app/apps/page.tsx",
                                                lineNumber: 89,
                                                columnNumber: 17
                                            }, this)
                                        }, void 0, false, {
                                            fileName: "[project]/src/app/apps/page.tsx",
                                            lineNumber: 88,
                                            columnNumber: 15
                                        }, this),
                                        "Apps"
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/src/app/apps/page.tsx",
                                    lineNumber: 87,
                                    columnNumber: 13
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$client$2f$app$2d$dir$2f$link$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"], {
                                    href: "/",
                                    className: "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[13px] text-[var(--text-secondary)] hover:bg-[var(--bg-card)] hover:text-[var(--text-primary)] transition-colors",
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("svg", {
                                            width: "14",
                                            height: "14",
                                            viewBox: "0 0 14 14",
                                            className: "shrink-0",
                                            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("circle", {
                                                cx: "7",
                                                cy: "7",
                                                r: "3",
                                                stroke: "#A8A29E",
                                                strokeWidth: "1.5",
                                                fill: "none"
                                            }, void 0, false, {
                                                fileName: "[project]/src/app/apps/page.tsx",
                                                lineNumber: 98,
                                                columnNumber: 17
                                            }, this)
                                        }, void 0, false, {
                                            fileName: "[project]/src/app/apps/page.tsx",
                                            lineNumber: 97,
                                            columnNumber: 15
                                        }, this),
                                        "Graph"
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/src/app/apps/page.tsx",
                                    lineNumber: 93,
                                    columnNumber: 13
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$client$2f$app$2d$dir$2f$link$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"], {
                                    href: "/",
                                    className: "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[13px] text-[var(--text-secondary)] hover:bg-[var(--bg-card)] hover:text-[var(--text-primary)] transition-colors",
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("svg", {
                                            width: "14",
                                            height: "14",
                                            viewBox: "0 0 14 14",
                                            className: "shrink-0",
                                            children: [
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("path", {
                                                    d: "M7 3v4l2.5 1.5",
                                                    stroke: "#A8A29E",
                                                    strokeWidth: "1.5",
                                                    strokeLinecap: "round",
                                                    fill: "none"
                                                }, void 0, false, {
                                                    fileName: "[project]/src/app/apps/page.tsx",
                                                    lineNumber: 107,
                                                    columnNumber: 17
                                                }, this),
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("circle", {
                                                    cx: "7",
                                                    cy: "7",
                                                    r: "4.5",
                                                    stroke: "#A8A29E",
                                                    strokeWidth: "1.5",
                                                    fill: "none"
                                                }, void 0, false, {
                                                    fileName: "[project]/src/app/apps/page.tsx",
                                                    lineNumber: 108,
                                                    columnNumber: 17
                                                }, this)
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/src/app/apps/page.tsx",
                                            lineNumber: 106,
                                            columnNumber: 15
                                        }, this),
                                        "History"
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/src/app/apps/page.tsx",
                                    lineNumber: 102,
                                    columnNumber: 13
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/src/app/apps/page.tsx",
                            lineNumber: 77,
                            columnNumber: 11
                        }, this)
                    }, void 0, false, {
                        fileName: "[project]/src/app/apps/page.tsx",
                        lineNumber: 76,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/src/app/apps/page.tsx",
                lineNumber: 64,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("main", {
                className: "flex flex-1 flex-col overflow-hidden",
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "flex-1 overflow-y-auto px-6 py-6",
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "mb-6 flex items-center justify-between",
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    children: [
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("h1", {
                                            className: "text-lg font-semibold text-[var(--text-primary)]",
                                            children: [
                                                "Apps",
                                                " ",
                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                    className: "ml-1 text-sm font-normal text-[var(--text-muted)]",
                                                    children: [
                                                        "(",
                                                        filtered.length,
                                                        ")"
                                                    ]
                                                }, void 0, true, {
                                                    fileName: "[project]/src/app/apps/page.tsx",
                                                    lineNumber: 124,
                                                    columnNumber: 17
                                                }, this)
                                            ]
                                        }, void 0, true, {
                                            fileName: "[project]/src/app/apps/page.tsx",
                                            lineNumber: 122,
                                            columnNumber: 15
                                        }, this),
                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                            className: "mt-0.5 text-sm text-[var(--text-secondary)]",
                                            children: "All orchestrator jobs"
                                        }, void 0, false, {
                                            fileName: "[project]/src/app/apps/page.tsx",
                                            lineNumber: 128,
                                            columnNumber: 15
                                        }, this)
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/src/app/apps/page.tsx",
                                    lineNumber: 121,
                                    columnNumber: 13
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                                    type: "text",
                                    value: search,
                                    onChange: (e)=>setSearch(e.target.value),
                                    placeholder: "Search by ID, intent, or gate...",
                                    className: "w-72 rounded-md border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
                                }, void 0, false, {
                                    fileName: "[project]/src/app/apps/page.tsx",
                                    lineNumber: 132,
                                    columnNumber: 13
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/src/app/apps/page.tsx",
                            lineNumber: 120,
                            columnNumber: 11
                        }, this),
                        error && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700",
                            children: error
                        }, void 0, false, {
                            fileName: "[project]/src/app/apps/page.tsx",
                            lineNumber: 142,
                            columnNumber: 13
                        }, this),
                        filtered.length === 0 && !error && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                            className: "text-sm text-[var(--text-muted)]",
                            children: jobs.length === 0 ? "No jobs found." : "No matching jobs."
                        }, void 0, false, {
                            fileName: "[project]/src/app/apps/page.tsx",
                            lineNumber: 149,
                            columnNumber: 13
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "grid gap-3",
                            children: filtered.map((job)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$client$2f$app$2d$dir$2f$link$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["default"], {
                                    href: `/apps/${job.jobId}`,
                                    className: "block rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-5 py-4 transition-shadow hover:shadow-[0_2px_8px_rgba(0,0,0,0.06)]",
                                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "flex items-start justify-between",
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                className: "min-w-0 flex-1",
                                                children: [
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                        className: "flex items-center gap-2",
                                                        children: [
                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                                className: "text-xs font-mono text-[var(--text-primary)]",
                                                                children: job.jobId
                                                            }, void 0, false, {
                                                                fileName: "[project]/src/app/apps/page.tsx",
                                                                lineNumber: 164,
                                                                columnNumber: 23
                                                            }, this),
                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                                className: `rounded-full px-2 py-0.5 text-[10px] font-medium ${gateBadgeClass(job.currentGate)}`,
                                                                children: job.currentGate
                                                            }, void 0, false, {
                                                                fileName: "[project]/src/app/apps/page.tsx",
                                                                lineNumber: 167,
                                                                columnNumber: 23
                                                            }, this)
                                                        ]
                                                    }, void 0, true, {
                                                        fileName: "[project]/src/app/apps/page.tsx",
                                                        lineNumber: 163,
                                                        columnNumber: 21
                                                    }, this),
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                        className: "mt-1.5 text-sm text-[var(--text-secondary)] truncate",
                                                        children: job.intent.length > 80 ? job.intent.slice(0, 80) + "..." : job.intent
                                                    }, void 0, false, {
                                                        fileName: "[project]/src/app/apps/page.tsx",
                                                        lineNumber: 173,
                                                        columnNumber: 21
                                                    }, this)
                                                ]
                                            }, void 0, true, {
                                                fileName: "[project]/src/app/apps/page.tsx",
                                                lineNumber: 162,
                                                columnNumber: 19
                                            }, this),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                className: "ml-4 shrink-0 text-right",
                                                children: [
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                        className: "text-[10px] text-[var(--text-muted)]",
                                                        children: [
                                                            job.features,
                                                            " feature",
                                                            job.features !== 1 ? "s" : ""
                                                        ]
                                                    }, void 0, true, {
                                                        fileName: "[project]/src/app/apps/page.tsx",
                                                        lineNumber: 180,
                                                        columnNumber: 21
                                                    }, this),
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                        className: "mt-0.5 text-[10px] text-[var(--text-muted)]",
                                                        children: new Date(job.createdAt).toLocaleString()
                                                    }, void 0, false, {
                                                        fileName: "[project]/src/app/apps/page.tsx",
                                                        lineNumber: 183,
                                                        columnNumber: 21
                                                    }, this)
                                                ]
                                            }, void 0, true, {
                                                fileName: "[project]/src/app/apps/page.tsx",
                                                lineNumber: 179,
                                                columnNumber: 19
                                            }, this)
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/src/app/apps/page.tsx",
                                        lineNumber: 161,
                                        columnNumber: 17
                                    }, this)
                                }, job.jobId, false, {
                                    fileName: "[project]/src/app/apps/page.tsx",
                                    lineNumber: 156,
                                    columnNumber: 15
                                }, this))
                        }, void 0, false, {
                            fileName: "[project]/src/app/apps/page.tsx",
                            lineNumber: 154,
                            columnNumber: 11
                        }, this)
                    ]
                }, void 0, true, {
                    fileName: "[project]/src/app/apps/page.tsx",
                    lineNumber: 118,
                    columnNumber: 9
                }, this)
            }, void 0, false, {
                fileName: "[project]/src/app/apps/page.tsx",
                lineNumber: 117,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/src/app/apps/page.tsx",
        lineNumber: 62,
        columnNumber: 5
    }, this);
}
}),
];

//# sourceMappingURL=src_7f834762._.js.map