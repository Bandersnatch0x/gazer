import { describe, expect, it } from "vitest";
import { createTelemetryRecorder } from "../src/director/telemetry";

describe("telemetry recorder", () => {
  it("starts empty: no hesitation, no counts, no names, zero idle", () => {
    const recorder = createTelemetryRecorder({ now: () => 1000 });
    const snapshot = recorder.getTelemetry();
    expect(snapshot.hesitationMs).toBeNull();
    expect(snapshot.rapidClicks).toBe(0);
    expect(snapshot.idleMs).toBe(0);
    expect(snapshot.stareMs).toBe(0);
    expect(snapshot.namedNames).toEqual([]);
    expect(snapshot.feeds).toBe(0);
    expect(snapshot.cleans).toBe(0);
    expect(snapshot.deaths).toBe(0);
  });

  it("samples idleMs against the injected clock since the last interaction", () => {
    let now = 1000;
    const recorder = createTelemetryRecorder({ now: () => now });
    now = 1160;
    expect(recorder.getTelemetry().idleMs).toBe(160);
    recorder.recordInteraction();
    expect(recorder.getTelemetry().idleMs).toBe(0);
    now = 1250;
    expect(recorder.getTelemetry().idleMs).toBe(90);
  });

  it("keeps the most recent feed hesitation, null when unknown", () => {
    const recorder = createTelemetryRecorder();
    recorder.recordFeed(null);
    expect(recorder.getTelemetry().hesitationMs).toBeNull();
    recorder.recordFeed(1400);
    expect(recorder.getTelemetry().hesitationMs).toBe(1400);
    expect(recorder.getTelemetry().feeds).toBe(2);
  });

  it("passes the pointer-down telemetry through untouched", () => {
    const recorder = createTelemetryRecorder();
    recorder.recordPointerDown({ hesitationMs: 350, rapidClicks: 4 });
    const snapshot = recorder.getTelemetry();
    expect(snapshot.hesitationMs).toBe(350);
    expect(snapshot.rapidClicks).toBe(4);
  });

  it("accumulates stare time and ignores non-finite or negative durations", () => {
    const recorder = createTelemetryRecorder();
    recorder.recordStare(3000);
    recorder.recordStare(3200);
    recorder.recordStare(-1);
    recorder.recordStare(Number.NaN);
    expect(recorder.getTelemetry().stareMs).toBe(6200);
  });

  it("counts cleans, deaths, and only real names, in order", () => {
    const recorder = createTelemetryRecorder();
    recorder.recordClean();
    recorder.recordClean();
    recorder.recordDeath();
    recorder.recordName("moss");
    recorder.recordName("   ");
    recorder.recordName("02");
    const snapshot = recorder.getTelemetry();
    expect(snapshot.cleans).toBe(2);
    expect(snapshot.deaths).toBe(1);
    expect(snapshot.namedNames).toEqual(["moss", "02"]);
  });

  it("hands out a fresh copy of namedNames every call", () => {
    const recorder = createTelemetryRecorder();
    recorder.recordName("moss");
    const snapshot = recorder.getTelemetry();
    snapshot.namedNames.push("forged");
    expect(recorder.getTelemetry().namedNames).toEqual(["moss"]);
  });
});
