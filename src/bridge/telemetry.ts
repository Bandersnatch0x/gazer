/**
 * L2 — Telemetry-true lines: the voice holds the real numbers.
 *
 * The ledger already records hesitation ms, stare durations, rapid-click
 * counts, idle spans, the hours the player keeps. The manual pool gestures at
 * these ("you stared at 02 for 6200ms"); from Stage 2 the bridge can replace
 * the gesture with the fact. On any failure the manual pool speaks — the
 * director's existing fallback layer, mirrored, never bypassed.
 *
 * Play is unaffected: the caller receives the line and may stage its reveal
 * through the already-implemented 1.5–4s jitter playback (GAME_REVIEW §11.3).
 */

import { manualLine } from "../director/manual";
import type { Stage } from "../sim/types";
import type { BudgetGuard } from "./budget";
import type { BridgeClient } from "./client";
import { cacheKey, type BridgeCache } from "./cache";
import { containsNumber, singleLine, truncate, wordCount } from "./validate";
import type { TelemetryAdapter, TelemetryEvent } from "./deps";

export interface TelemetryLineDeps {
  readonly client: BridgeClient;
  readonly budget: BudgetGuard;
  readonly cache?: BridgeCache;
  readonly telemetry: TelemetryAdapter;
}

export interface LineRequest {
  readonly stage: Stage;
  readonly seed: number;
}

export interface TelemetrySpeaker {
  line(request: LineRequest): Promise<string>;
}

const MIN_STAGE: Stage = 2;
const MAX_CHARS = 120;
const MAX_WORDS = 24;

export const TELEMETRY_SYSTEM_RULES: string =
  "You speak for creatures in a 1997 virtual pet who have realised they are " +
  "watched. Use ONLY the telemetry facts given — quote numbers exactly as " +
  "given, no rounding, no invention. One lowercase sentence, at most 24 " +
  "words. No question, no exclamation, no explanation.";

function describeEvent(event: TelemetryEvent): string | null {
  switch (event.kind) {
    case "feed":
      return `keeper fed creature ${event.creatureId}, hesitating ${event.hesitationMs}ms before the touch`;
    case "stare":
      return `keeper stared at creature ${event.creatureId} for ${event.durationMs}ms`;
    case "rapid_click":
      return `keeper clicked creature ${event.creatureId} ${event.count} times quickly`;
    case "drag_to_hazard":
      return `keeper dragged creature ${event.creatureId} toward hazard`;
    case "death":
      return `creature ${event.creatureId} died of ${event.cause}`;
    case "idle":
      return `keeper idled ${event.durationMs}ms`;
    case "player_answer":
      return `keeper answered "${event.question}" with "${event.answer}"`;
    case "session_start":
      return `keeper returned at hour ${event.localHour}`;
    default:
      return null;
  }
}

function serialiseTelemetry(events: readonly TelemetryEvent[]): string {
  return events
    .map(describeEvent)
    .filter((line): line is string => line !== null)
    .join("\n");
}

export function buildTelemetryPrompt(facts: string): string {
  return [
    TELEMETRY_SYSTEM_RULES,
    "",
    "TELEMETRY (verbatim facts)",
    facts,
    "",
    "Return JSON: { \"text\": \"...\" }",
  ].join("\n");
}

export function createTelemetrySpeaker(deps: TelemetryLineDeps): TelemetrySpeaker {
  return {
    async line(request: LineRequest): Promise<string> {
      const stage = request.stage;
      if (stage < MIN_STAGE) {
        return manualLine(stage, request.seed);
      }

      const recent = deps.telemetry.recent(5);
      const facts = serialiseTelemetry(recent);
      if (facts.length === 0) {
        return manualLine(stage, request.seed);
      }

      const key = cacheKey(stage, "telemetry", facts);
      const cached = deps.cache?.get(key) ?? null;

      let candidate: string | null = null;
      if (cached !== null) {
        candidate = cached;
      } else if (deps.budget.trySpend(Date.now())) {
        const result = await deps.client.ask({
          kind: "telemetry_line",
          prompt: buildTelemetryPrompt(facts),
        });
        if (result.ok) {
          const line = singleLine(result.text);
          if (
            line.length > 0 &&
            line.length <= MAX_CHARS &&
            wordCount(line) <= MAX_WORDS &&
            containsNumber(line)
          ) {
            candidate = truncate(line, MAX_CHARS);
            deps.cache?.set(key, candidate);
          }
        }
      }

      return candidate ?? manualLine(stage, request.seed);
    },
  };
}
