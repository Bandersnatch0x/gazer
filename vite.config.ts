import { defineConfig, type Plugin } from "vitest/config";

/**
 * LLM protocol adapter (jam acceptance: "接入 LLM").
 *
 * Two request dialects arrive at the same-origin path `/v1/game`:
 * - roundtable: `{input}` (src/director/client.ts) → the middleware wraps the
 *   assembled context in the RT-SYSTEM contract, demands a JSON `{"scene":[..]}`
 *   reply, extracts and parses it, and returns the object itself so
 *   `parseRoundtable(result.payload)` can validate it unchanged.
 * - bridge: `{kind, prompt}` (src/bridge/client.ts dialect) → passthrough with
 *   per-kind temperature, reply `{text}`.
 *
 * The jam model endpoint is OpenAI-compatible
 * (`http://127.0.0.1:18086/v1`, key `magpie`, model `auto/deepseek-v4.1-flash`).
 * Credentials never enter the bundle. A soft budget guard (15 successful
 * upstream calls per sliding 30 minutes, GAME_REVIEW §11.4) lives here at the
 * only point every dialect crosses; exhaustion answers 429 and the game
 * silently takes its manual-pool fallback. Dev-server only — production stays
 * offline-complete by design (决策 0002).
 */
const RT_SYSTEM = [
  "You are the roundtable director of a creature-observer game.",
  "Reply with ONLY one JSON object, no prose and no code fences:",
  '{"scene":[{"speaker":"<creature id>","text":"<one spoken line>","intent":"observe|deceive|query|confide|accuse|comfort","mood":"curious|sad|loving|wrong|hungry","memoryRef":"<id of the memory you cite>"}]}',
  "Rules: 2 to 4 turns; every speaker must be a CREATURE id from the context;",
  "every memoryRef must be a memory id printed inside that speaker's own block;",
  "the spoken text must share at least two content words with the cited memory;",
  "if the context carries a LANGUAGE section, write every turn's text in that language.",
].join(" ");

function extractJsonObject(text: string): unknown {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) {
    return null;
  }
  try {
    return JSON.parse(text.slice(start, end + 1)) as unknown;
  } catch {
    return null;
  }
}

function llmAdapter(): Plugin {
  const UPSTREAM = "http://127.0.0.1:18086/v1/chat/completions";
  const KEY = "magpie";
  const MODEL = "auto/deepseek-v4.1-flash";
  // Per-kind temperature: whispers may drift, telemetry lines may charm, but a
  // reflect summary must stay sober. The roundtable scene is creative but
  // memory-bound: 0.8.
  const TEMPERATURE: Record<string, number> = {
    whisper_rewrite: 1.0,
    telemetry_line: 0.9,
    reflect: 0.5,
    roundtable: 0.8,
  };
  // 2..4 turns of five fields need headroom; 200 truncated mid-scene.
  const MAX_TOKENS: Record<string, number> = {
    roundtable: 600,
  };

  // Soft budget: at most 15 successful upstream calls inside any sliding 30
  // minutes. Exhaustion is not an error for the player — the page falls back.
  const BUDGET_MAX = 15;
  const BUDGET_WINDOW_MS = 30 * 60 * 1000;
  const spendStamps: number[] = [];
  function budgetAllows(now: number): boolean {
    const cutoff = now - BUDGET_WINDOW_MS;
    while (spendStamps.length > 0 && spendStamps[0]! <= cutoff) {
      spendStamps.shift();
    }
    if (spendStamps.length >= BUDGET_MAX) {
      return false;
    }
    spendStamps.push(now);
    return true;
  }

  /** The shared middleware: identical on the dev server and `vite preview`. */
  const llmMiddleware = (
    req: import("node:http").IncomingMessage,
    res: import("node:http").ServerResponse,
  ): void => {
    if (req.method !== "POST") {
      res.statusCode = 405;
      res.end();
      return;
    }
    let raw = "";
    req.on("data", (chunk: Buffer) => {
      raw += chunk.toString("utf8");
    });
    req.on("end", async () => {
      // Dialect detection: `{input}` is the roundtable contract, the rest
      // is the bridge whisper dialect. An unparseable body is a 400 either
      // way — the caller treats any non-ok as "use the manual pool".
      let kind = "whisper_rewrite";
      let prompt = "";
      let input: string | null = null;
      try {
        const parsed = JSON.parse(raw) as {
          kind?: unknown;
          prompt?: unknown;
          input?: unknown;
        };
        if (typeof parsed.input === "string" && parsed.input.trim().length > 0) {
          input = parsed.input;
        }
        if (typeof parsed.kind === "string") kind = parsed.kind;
        if (typeof parsed.prompt === "string") prompt = parsed.prompt;
      } catch {
        res.statusCode = 400;
        res.end(JSON.stringify({ error: "bad json" }));
        return;
      }
      const isRoundtable = input !== null;
      if (isRoundtable) {
        kind = "roundtable";
      }
      const userContent = isRoundtable ? (input as string) : prompt;
      if (userContent.length === 0) {
        res.statusCode = 400;
        res.end(JSON.stringify({ error: "empty prompt" }));
        return;
      }
      if (!budgetAllows(Date.now())) {
        res.statusCode = 429;
        res.end(JSON.stringify({ error: "budget exhausted" }));
        return;
      }
      try {
        const upstream = await fetch(UPSTREAM, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${KEY}`,
          },
          body: JSON.stringify({
            model: MODEL,
            messages: isRoundtable
              ? [
                  { role: "system", content: RT_SYSTEM },
                  { role: "user", content: userContent },
                ]
              : [{ role: "user", content: userContent }],
            temperature: TEMPERATURE[kind] ?? 0.9,
            max_tokens: MAX_TOKENS[kind] ?? 200,
          }),
          signal: AbortSignal.timeout(30_000),
        });
        if (!upstream.ok) {
          res.statusCode = 502;
          res.end(JSON.stringify({ error: `upstream ${upstream.status}` }));
          return;
        }
        const payload = (await upstream.json()) as {
          choices?: { message?: { content?: unknown } }[];
        };
        const text = payload.choices?.[0]?.message?.content;
        if (typeof text !== "string" || text.length === 0) {
          res.statusCode = 502;
          res.end(JSON.stringify({ error: "empty completion" }));
          return;
        }
        res.setHeader("content-type", "application/json");
        if (isRoundtable) {
          // Only a parsed scene object ever crosses back; raw model text —
          // fences, prose, leaked prompt fragments — can never reach the
          // game, because parseRoundtable re-validates the shape anyway.
          const scene = extractJsonObject(text);
          if (scene === null || typeof scene !== "object") {
            res.statusCode = 502;
            res.end(JSON.stringify({ error: "unparseable scene" }));
            return;
          }
          res.end(JSON.stringify(scene));
        } else {
          res.end(JSON.stringify({ text }));
        }
      } catch {
        res.statusCode = 502;
        res.end(JSON.stringify({ error: "upstream unreachable" }));
      }
    });
  };

  return {
    name: "gazer-llm-adapter",
    // Dev server (HMR play) and `vite preview` (stable production server the
    // studio shell embeds) both carry the adapter, so the studio experience
    // never depends on the dev watcher staying alive.
    configureServer(server) {
      server.middlewares.use("/v1/game", llmMiddleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use("/v1/game", llmMiddleware);
    },
  };
}

export default defineConfig({
  base: "./",
  plugins: [llmAdapter()],
  server: {
    // The edit tool writes atomic temp files inside src/; chokidar trips an
    // EBUSY crash watching them on Windows. Ignore the pattern.
    watch: {
      ignored: ["**/*.tmpdir/**", "**/*.tmp"],
    },
  },
  build: {
    target: "es2022",
    rollupOptions: {
      input: {
        main: "./index.html",
        sw: "./src/shell/sw.ts",
      },
      output: {
        entryFileNames: (chunk) => (chunk.name === "sw" ? "sw.js" : "assets/[name]-[hash].js"),
      },
    },
  },
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
  },
});
