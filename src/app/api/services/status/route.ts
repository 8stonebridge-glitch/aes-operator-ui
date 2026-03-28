import { NextResponse } from "next/server";

interface ServiceCheck {
  id: string;
  name: string;
  up: boolean;
  error?: string;
}

const RAILWAY_URL =
  process.env.NEXT_PUBLIC_AES_API_URL ||
  "https://brave-kindness-production-d283.up.railway.app";

const ORCHESTRATOR_URL =
  process.env.NEXT_PUBLIC_AES_ORCHESTRATOR_URL ||
  "https://brave-kindness-production-d283.up.railway.app";

async function checkService(
  id: string,
  name: string,
  fn: () => Promise<void>
): Promise<ServiceCheck> {
  try {
    await fn();
    return { id, name, up: true };
  } catch (err) {
    return { id, name, up: false, error: err instanceof Error ? err.message : String(err) };
  }
}

async function pingUrl(url: string, timeoutMs = 8000): Promise<void> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal, cache: "no-store" });
    if (!res.ok) throw new Error(`${res.status}`);
  } finally {
    clearTimeout(timer);
  }
}

export async function GET() {
  const checks = await Promise.all([
    checkService("neo4j", "Neo4j", async () => {
      await pingUrl(`${RAILWAY_URL}/api/health`);
    }),
    checkService("registry", "Registry", async () => {
      await pingUrl(`${RAILWAY_URL}/api/health`);
    }),
    checkService("orchestrator", "Orchestrator", async () => {
      await pingUrl(`${ORCHESTRATOR_URL}/api/health`);
    }),
    checkService("hermes", "Hermes", async () => {
      // Hermes runs locally — won't be reachable from Vercel
      // Check if there's a public Hermes URL configured
      const hermesUrl = process.env.HERMES_URL;
      if (hermesUrl) {
        await pingUrl(`${hermesUrl}/health`);
      } else {
        throw new Error("No public Hermes URL configured");
      }
    }),
    checkService("claude", "Claude AI", async () => {
      const key = process.env.ANTHROPIC_API_KEY;
      if (!key) throw new Error("No API key");
      // Just check the API is reachable with a minimal call
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": key,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 1,
          messages: [{ role: "user", content: "ping" }],
        }),
      });
      if (!res.ok && res.status !== 429) throw new Error(`${res.status}`);
    }),
    checkService("openai", "OpenAI", async () => {
      const key = process.env.OPENAI_API_KEY;
      if (!key) throw new Error("No API key");
      const res = await fetch("https://api.openai.com/v1/models", {
        headers: { Authorization: `Bearer ${key}` },
      });
      if (!res.ok && res.status !== 429) throw new Error(`${res.status}`);
    }),
    checkService("perplexity", "Perplexity", async () => {
      const key = process.env.PERPLEXITY_API_KEY;
      if (!key) throw new Error("No API key");
      const res = await fetch("https://api.perplexity.ai/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "sonar",
          messages: [{ role: "user", content: "ping" }],
          max_tokens: 1,
        }),
      });
      if (!res.ok && res.status !== 429) throw new Error(`${res.status}`);
    }),
  ]);

  return NextResponse.json({ services: checks });
}
