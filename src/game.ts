/**
 * The integration layer. Owns the clock, the input, and the wiring between
 * simulation, director, render, and UI. Every layer below stays pure.
 */

import type { RenderApp } from "./render/app";
import { createApp } from "./render/app";
import type { RenderEffect, ShellInstruction } from "./render/effects";
import { LOGICAL_WIDTH, unproject } from "./render/scene";
import { createDirectorClient } from "./director/client";
import { manualLine } from "./director/manual";
import { parseRoundtable, validateTurns } from "./director/roundtable";
import { routeTask } from "./director/router";
import type { PromptGenome } from "./sim/genome";
import type { MemoryEntry, MemorySlice } from "./sim/memory";
import { emptySlice } from "./sim/memory";
import { emptyOntology } from "./sim/ontology";
import type { OntologyLedger } from "./sim/ontology";
import type { Stage, CreatureState, WorldState } from "./sim/types";
import { INITIAL_GV } from "./sim/types";
import { courtshipStep, step } from "./sim/engine";
import type { HatchChoice } from "./sim/types";
import { createRegistry } from "./sim/hooks";
import { createAlbum } from "./ui/album";
import type { AlbumCreature } from "./ui/album";
import { createDialogue } from "./ui/dialogue";
import type { DialogueView } from "./ui/dialogue";
import { createHelp } from "./ui/help";
import type { HelpView } from "./ui/help";
import { choicePanel, namePanel, pupilPanel } from "./ui/panels";
import { detectLocale, LOCALE_STORAGE_KEY, nextLocale, t } from "./ui/i18n";
import type { Locale } from "./ui/i18n";
import { COPY } from "./ui/copy";

const TILE_MS = 1000;
const STARTER_IDS = ["gazer_01", "gazer_02", "gazer_03"] as const;
const START_POSITIONS = [
  { x: 6, y: 5 },
  { x: 9, y: 7 },
  { x: 4, y: 8 },
] as const;

/** The gaze is the only anomaly in the cozy act. Three seconds is the tell. */
export const STARE_MS = 3000;
/** Idle is not absence: they count it. */
export const IDLE_MS = 30000;
const RAPID_CLICK_WINDOW_MS = 1200;
const RAPID_CLICK_COUNT = 4;

function starterGenome(id: string, generation: number): PromptGenome {
  return {
    id,
    generation,
    lineage: ["seed_alpha"],
    base: "you are a small one-eyed creature being raised through a window",
    traits: { curiosity: 0.6, loyalty: 0.5, deceit: 0.1, clinging: 0.5, watchfulness: 0.5 },
    drift: [],
    secrets: [],
    manualPool: [manualLine(0, id.length), manualLine(1, id.length + 1)],
    temperatureBias: 0,
    distortionBias: 0.15,
  };
}

function initialWorld(): WorldState {
  let world: WorldState = {
    tick: 0,
    gv: INITIAL_GV,
    stage: 0,
    creatures: {},
    structures: [],
    eggs: [],
    uiLabels: {},
    paletteDecay: 0,
    seed: 1997,
    silent: true,
  };
  STARTER_IDS.forEach((id, index) => {
    const position = START_POSITIONS[index] ?? START_POSITIONS[0];
    world = step(world, { kind: "hatch", creatureId: id, at: position, species: "gazerling" });
    const creature = world.creatures[id];
    if (creature !== undefined) {
      world = {
        ...world,
        creatures: {
          ...world.creatures,
          [id]: { ...creature, genome: starterGenome(id, 1) },
        },
      };
    }
  });
  return world;
}

function nearestCreature(world: WorldState, tile: { x: number; y: number }): CreatureState | null {
  let best: CreatureState | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const creature of Object.values(world.creatures)) {
    if (creature.behavior === "dead") {
      continue;
    }
    const distance = Math.abs(creature.position.x - tile.x) + Math.abs(creature.position.y - tile.y);
    if (distance < bestDistance) {
      best = creature;
      bestDistance = distance;
    }
  }
  return best;
}

function memoryFor(creature: CreatureState, fact: string, tick: number, valence: number): MemoryEntry {
  return {
    id: `mem_${creature.id}_${tick}`,
    atTick: tick,
    wallClock: new Date().toISOString().slice(11, 19),
    fact,
    witnessed: "witnessed",
    source: null,
    distortion: null,
    salience: 0.5,
    valence,
  };
}

export interface GameHandle {
  readonly world: () => WorldState;
  destroy(): void;
}

export interface GameOptions {
  readonly doc: Document;
  readonly canvas: HTMLCanvasElement;
  readonly root: HTMLElement;
  readonly endpoint: string | null;
}

export async function createGame(options: GameOptions): Promise<GameHandle> {
  const { doc, canvas, root } = options;
  let locale: Locale = detectLocale(location.search, localStorage.getItem(LOCALE_STORAGE_KEY));

  let world = initialWorld();
  const memories: Record<string, MemorySlice> = {};
  for (const id of STARTER_IDS) {
    memories[id] = emptySlice();
  }
  let ontology: OntologyLedger = emptyOntology();
  const registry = createRegistry();
  registry.register({
    point: "sim:tick",
    id: "gv_accumulator",
    priority: 10,
    sync: true,
    handler: () => undefined,
    logged: false,
  });
  registry.register({
    point: "action:post",
    id: "ledger_writer",
    priority: 10,
    sync: true,
    handler: () => undefined,
    logged: false,
  });

  const dialogue: DialogueView = createDialogue(doc, locale);
  const spokenLines: { line: string; status: "witnessed" | "heard" | "inferred" | "fabricated" }[] =
    [];
  const album = createAlbum(doc, locale);
  const help: HelpView = createHelp(doc, locale);

  const app: RenderApp = await createApp(canvas, (instruction: ShellInstruction) => {
    handleShellEffect(instruction);
  });

  const client = options.endpoint === null
    ? null
    : createDirectorClient({ endpoint: options.endpoint, timeoutMs: routeTask("roundtable").timeoutMs });

  const hud = doc.createElement("div");
  hud.className = "gazer-hud";
  const spoken = doc.createElement("div");
  spoken.className = "gazer-dialogue-mount";
  const panel = doc.createElement("div");
  panel.className = "gazer-panel";
  panel.hidden = true;

  const bar = doc.createElement("div");
  bar.className = "gazer-bar";
  const localeButton = doc.createElement("button");
  localeButton.type = "button";
  localeButton.className = "gazer-key";
  const albumButton = doc.createElement("button");
  albumButton.type = "button";
  albumButton.className = "gazer-key";
  const helpButton = doc.createElement("button");
  helpButton.type = "button";
  helpButton.className = "gazer-key";
  const closeButton = doc.createElement("button");
  closeButton.type = "button";
  closeButton.className = "gazer-key";
  closeButton.textContent = "x";

  bar.append(localeButton, albumButton, helpButton);
  spoken.append(dialogue.root);
  hud.append(bar, spoken);
  root.append(hud, panel);
  panel.append(closeButton);

  function handleShellEffect(instruction: ShellInstruction): void {
    if (instruction.type === "title_mutate") {
      doc.title = instruction.text;
    }
  }

  function paintChrome(): void {
    localeButton.textContent = t(locale, COPY.hud.localeToggle);
    albumButton.textContent = t(locale, COPY.hud.album);
    helpButton.textContent = t(locale, COPY.hud.help);
    closeButton.textContent = t(locale, COPY.hud.close);
  }

  function hudLine(): string {
    return [
      `${t(locale, COPY.hud.gvLabel)} ${world.gv.toFixed(0)}`,
      `${t(locale, COPY.hud.stageLabel)} ${world.stage}`,
      options.endpoint === null ? t(locale, COPY.hud.silent) : t(locale, COPY.hud.live),
    ].join("  ·  ");
  }

  function refresh(): void {
    app.drawWorld(world);
    paintChrome();
    const status = doc.getElementById("hud");
    if (status !== null) {
      status.textContent = hudLine();
    }
  }

  function speak(line: string, status: "witnessed" | "heard" | "inferred" | "fabricated"): void {
    spokenLines.push({ line, status });
    dialogue.showLines(
      spokenLines.map((entry) => ({ speaker: "collective", text: entry.line, status: entry.status })),
      locale,
    );
  }

  /**
   * Ask the director for one line. The model never decides state: its reply is
   * parsed, every turn is validated against the speaker's own memory, and a
   * rejected turn falls back to that creature's manual pool.
   */
  async function directLine(trigger: string): Promise<string> {
    const fallback = manualLine(world.stage, world.tick);
    if (client === null) {
      return fallback;
    }
    const result = await client.ask(trigger);
    if (!result.ok) {
      return fallback;
    }
    const script = parseRoundtable(result.payload);
    if (script === null) {
      return fallback;
    }
    const pools: Record<string, readonly string[]> = {};
    for (const creature of Object.values(world.creatures)) {
      pools[creature.id] = creature.genome?.manualPool ?? [];
    }
    const checked = validateTurns(script, memories, pools);
    return checked.scene[0]?.text ?? fallback;
  }

  function onStageChange(previous: Stage, next: Stage): void {
    if (next === previous) {
      return;
    }
    ontology = { ...ontology, shifts: ontology.shifts };
    speak(manualLine(next, world.tick), "heard");
    void directLine(`stage crossed to ${next}`).then((line) => speak(line, "heard"));
    const effect: RenderEffect =
      next >= 2
        ? { kind: "gaze_at_player", creatureId: STARTER_IDS[0], ms: 2000 }
        : { kind: "freeze_all", ms: 1200 };
    app.playEffect(effect, world);
  }

  let lastPointerMove = 0;
  let lastClickAt = 0;
  let rapidClicks = 0;
  let lastInteraction = Date.now();
  let stareStart = 0;

  canvas.addEventListener("pointermove", () => {
    lastPointerMove = Date.now();
    lastInteraction = Date.now();
    if (stareStart === 0) {
      stareStart = Date.now();
    }
    if (Date.now() - stareStart > STARE_MS) {
      stareStart = Date.now();
      world = step(world, { kind: "gv", delta: 3 });
      const target = nearestCreature(world, { x: 6, y: 5 });
      if (target !== null) {
        app.playEffect({ kind: "gaze_at_player", creatureId: target.id, ms: 900 }, world);
      }
    }
  });

  let dragTarget: string | null = null;
  let dragStart: { x: number; y: number } | null = null;
  let holdTimer: ReturnType<typeof setTimeout> | null = null;
  let moved = false;

  function tileFromPoint(x: number, y: number): { x: number; y: number } {
    const rect = canvas.getBoundingClientRect();
    const scale = rect.width / LOGICAL_WIDTH;
    return unproject({ x: x / scale, y: y / scale });
  }

  function tileOf(event: PointerEvent): { x: number; y: number } {
    return tileFromPoint(event.offsetX, event.offsetY);
  }

  canvas.addEventListener("pointerdown", (event: PointerEvent) => {
    event.preventDefault();
    const now = Date.now();
    const hesitation = lastPointerMove === 0 ? 0 : now - lastPointerMove;
    lastInteraction = now;
    rapidClicks = now - lastClickAt < RAPID_CLICK_WINDOW_MS ? rapidClicks + 1 : 1;
    lastClickAt = now;

    const tile = tileOf(event);
    const egg = world.eggs.find(
      (entry) => entry.at.x === tile.x && entry.at.y === tile.y,
    );
    if (egg !== undefined && event.button === 0) {
      openHatchChoice(egg.id);
      return;
    }

    const target = nearestCreature(world, tile);
    if (target === null) {
      return;
    }

    if (event.button === 0) {
      dragTarget = target.id;
      dragStart = { x: event.offsetX, y: event.offsetY };
      moved = false;
      // Hold to pet, keep holding to name. Petting is the gentle verb; naming
      // is the one that claims ownership, so it costs a longer press.
      holdTimer = setTimeout(() => {
        if (moved) {
          return;
        }
        world = step(world, { kind: "pet", creatureId: target.id });
        refresh();
        holdTimer = setTimeout(() => {
          if (!moved) {
            askName(target.id);
          }
        }, 900);
      }, 650);
    }

    const cleaning = event.button === 2;
    world = step(world, { kind: cleaning ? "clean" : "feed", creatureId: target.id });
    const slice = memories[target.id] ?? emptySlice();
    const entry = memoryFor(
      target,
      cleaning
        ? `the player cleaned ${target.id}`
        : `the player fed ${target.id} after hesitating ${(hesitation / 1000).toFixed(1)} seconds`,
      world.tick,
      cleaning ? 0.3 : 0.8,
    );
    memories[target.id] = { ...slice, working: [...slice.working, entry].slice(-60) };

    const delta = rapidClicks >= RAPID_CLICK_COUNT ? 4 : 1;
    const before = world.stage;
    world = step(world, { kind: "gv", delta });
    // They look up at the hand that touched them.
    app.playEffect({ kind: "gaze_at_player", creatureId: target.id, ms: 700 }, world);
    onStageChange(before, world.stage);
    // Speech is rationed: a creature comments on the act, not on every click.
    if (rapidClicks >= RAPID_CLICK_COUNT) {
      speak(manualLine(world.stage, rapidClicks), "heard");
      app.playEffect({ kind: "ui_shake", intensity: 0.4, ms: 220 }, world);
    }
    refresh();
  });

  canvas.addEventListener("contextmenu", (event) => {
    event.preventDefault();
  });

  canvas.addEventListener("pointermove", (event: PointerEvent) => {
    if (dragTarget === null || dragStart === null) {
      return;
    }
    const dx = event.offsetX - dragStart.x;
    const dy = event.offsetY - dragStart.y;
    if (Math.abs(dx) + Math.abs(dy) > 8) {
      moved = true;
      if (holdTimer !== null) {
        clearTimeout(holdTimer);
        holdTimer = null;
      }
    }
  });

  canvas.addEventListener("pointerup", (event: PointerEvent) => {
    if (holdTimer !== null) {
      clearTimeout(holdTimer);
      holdTimer = null;
    }
    if (dragTarget !== null && moved) {
      const tile = tileOf(event);
      world = step(world, { kind: "move", creatureId: dragTarget, at: tile });
      // Being carried is a memory too.
      const slice = memories[dragTarget] ?? emptySlice();
      const entry = memoryFor(
        world.creatures[dragTarget] ?? { id: dragTarget } as CreatureState,
        `the player carried ${dragTarget} to another place`,
        world.tick,
        -0.2,
      );
      memories[dragTarget] = { ...slice, working: [...slice.working, entry].slice(-60) };
      world = step(world, { kind: "gv", delta: 1 });
      refresh();
    }
    dragTarget = null;
    dragStart = null;
  });

  canvas.addEventListener("dblclick", (event: MouseEvent) => {
    const tile = tileFromPoint(event.offsetX, event.offsetY);
    const target = nearestCreature(world, tile);
    if (target === null) {
      return;
    }
    const view = pupilPanel(doc, locale, world.stage);
    openPanel(view.root);
    world = step(world, { kind: "gv", delta: 3 });
    refresh();
  });

  function idleCheck(): void {
    if (Date.now() - lastInteraction > IDLE_MS) {
      lastInteraction = Date.now();
      world = step(world, { kind: "gv", delta: 2 });
      if (world.stage >= 1) {
        speak(manualLine(world.stage, world.tick), "heard");
      }
    }
  }

  const timer = setInterval(() => {
    world = courtshipStep(step(world, { kind: "tick" }));
    idleCheck();
    refresh();
  }, TILE_MS);

  localeButton.addEventListener("click", () => {
    locale = nextLocale(locale);
    localStorage.setItem(LOCALE_STORAGE_KEY, locale);
    dialogue.setTitle(locale);
    help.setLocale(locale);
    paintChrome();
    if (spokenLines.length > 0) {
      dialogue.showLines(
        spokenLines.map((entry) => ({
          speaker: "collective",
          text: entry.line,
          status: entry.status,
        })),
        locale,
      );
    }
    if (!panel.hidden) {
      album.render(
        Object.values(world.creatures).map((creature) => ({
          id: creature.id,
          generation: creature.genome?.generation ?? 1,
          impression: 0,
          traits: creature.genome?.traits ?? {
            curiosity: 0.5,
            loyalty: 0.5,
            deceit: 0.1,
            clinging: 0.5,
            watchfulness: 0.5,
          },
          memory: memories[creature.id] ?? emptySlice(),
        })),
        locale,
      );
    }
  });

  function openPanel(node: HTMLElement): void {
    panel.replaceChildren(closeButton, node);
    panel.hidden = false;
    // The panel is a fixed overlay, so the canvas below it must be redrawn
    // rather than left to the compositor.
    refresh();
  }

  function askName(creatureId: string): void {
    const view = namePanel(doc, locale, (name) => {
      world = step(world, { kind: "name", creatureId, name });
      const slice = memories[creatureId] ?? emptySlice();
      const entry = memoryFor(
        (world.creatures[creatureId] ?? { id: creatureId }) as CreatureState,
        `the player named me ${name}`,
        world.tick,
        0.9,
      );
      memories[creatureId] = { ...slice, working: [...slice.working, entry].slice(-60) };
      world = step(world, { kind: "gv", delta: 2 });
      view.destroy();
      panel.hidden = true;
      speak(
        world.stage >= 3
          ? `You gave us names. We never agreed to them. ${name}.`
          : manualLine(world.stage, world.tick),
        "heard",
      );
      refresh();
    });
    openPanel(view.root);
    view.focus();
  }

  function openHatchChoice(eggId: string): void {
    const egg = world.eggs.find((entry) => entry.id === eggId);
    if (egg === undefined) {
      return;
    }
    const choices = [
      { value: "immediate" as const, label: COPY.panels.hatchImmediate, note: COPY.panels.hatchImmediateNote },
      { value: "warm" as const, label: COPY.panels.hatchWarm, note: COPY.panels.hatchWarmNote },
      { value: "still" as const, label: COPY.panels.hatchStill, note: COPY.panels.hatchStillNote },
      { value: "self" as const, label: COPY.panels.hatchSelf, note: COPY.panels.hatchSelfNote },
    ];
    const view = choicePanel<HatchChoice>(doc, locale, COPY.panels.hatchTitle, choices, (choice) => {
      const id = `gazer_${Object.keys(world.creatures).length + 1}`;
      world = step(world, {
        kind: "hatchFromEgg",
        eggId,
        creatureId: id,
        at: egg.at,
        species: "gazerling",
        choice,
      });
      world = step(world, { kind: "gv", delta: 1 });
      view.destroy();
      panel.hidden = true;
      speak(manualLine(world.stage, world.tick), "heard");
      refresh();
    });
    openPanel(view.root);
  }

  albumButton.addEventListener("click", () => {
    const rows: AlbumCreature[] = Object.values(world.creatures).map((creature) => ({
      id: creature.id,
      generation: creature.genome?.generation ?? 1,
      impression: 0,
      traits: creature.genome?.traits ?? {
        curiosity: 0.5,
        loyalty: 0.5,
        deceit: 0.1,
        clinging: 0.5,
        watchfulness: 0.5,
      },
      memory: memories[creature.id] ?? emptySlice(),
    }));
    album.render(rows, locale);
    openPanel(album.root);
  });

  helpButton.addEventListener("click", () => {
    openPanel(help.root);
  });

  closeButton.addEventListener("click", () => {
    panel.hidden = true;
    refresh();
  });

  speak(t(locale, COPY.hud.opening), "heard");
  refresh();

  // ponytail: a read-only debug handle, opt-in by URL. The e2e smoke needs to
  // know where an egg landed; remove if the demo stops using automated checks.
  if (new URLSearchParams(location.search).get("debug") === "1") {
    (window as unknown as { __gazer?: () => WorldState }).__gazer = () => world;
  }

  return {
    world: () => world,
    destroy() {
      clearInterval(timer);
      app.destroy();
    },
  };
}
