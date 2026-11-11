import { Application, Container, Graphics, Text } from "pixi.js";
import { DEFAULT_MASK, step } from "./sim/engine";
import type { CreatureState, TilePos, WorldState } from "./sim/types";

const TILE = 24;
const COLS = 16;
const ROWS = 12;
const START: TilePos = { x: 6, y: 5 };

const app = new Application();
await app.init({ width: COLS * TILE, height: ROWS * TILE, background: "#0a0f0c", antialias: false });
document.getElementById("stage")?.append(app.canvas);

const world = new Container();
app.stage.addChild(world);

let state: WorldState = {
  tick: 0,
  gv: 0,
  stage: 0,
  creatures: {},
  structures: [],
  uiLabels: {},
  paletteDecay: 0,
  seed: 1997,
  silent: true,
};
state = step(state, { kind: "hatch", creatureId: "gazer_01", at: START, species: "gazerling" });

const grid = new Graphics();
for (let y = 0; y < ROWS; y += 1) {
  for (let x = 0; x < COLS; x += 1) {
    grid.rect(x * TILE, y * TILE, TILE, TILE).stroke({ width: 1, color: 0x18241c });
  }
}
world.addChild(grid);

const body = new Graphics();
const label = new Text({ text: "", style: { fill: "#7ef0a6", fontSize: 10, fontFamily: "monospace" } });
world.addChild(body, label);

function draw(creature: CreatureState | undefined): void {
  body.clear();
  if (creature === undefined) {
    label.text = "";
    return;
  }
  const shade = creature.behavior === "dead" ? 0x3a2f3a : creature.behavior === "hungry" ? 0xb8a06a : 0x7ef0a6;
  const rows = creature.mask.length;
  const cols = creature.mask[0]?.length ?? 0;
  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < cols; x += 1) {
      if (creature.mask[y]?.[x] === "#") {
        body.rect((creature.position.x + x) * TILE + 6, (creature.position.y + y) * TILE + 6, 2, 2).fill(shade);
      }
    }
  }
  label.text = `${creature.id} · ${creature.behavior}`;
  label.position.set(creature.position.x * TILE, (creature.position.y + DEFAULT_MASK.length) * TILE + 4);
}

const hud = document.getElementById("hud");
function render(): void {
  draw(state.creatures["gazer_01"]);
  if (hud) {
    hud.textContent = `tick ${state.tick}  gv ${state.gv.toFixed(1)}  stage ${state.stage}  silent ${state.silent ? "yes" : "no"}`;
  }
}

setInterval(() => {
  state = step(state, { kind: "tick" });
  render();
}, 1000);

app.canvas.addEventListener("pointerdown", () => {
  state = step(state, { kind: "feed", creatureId: "gazer_01" });
  state = step(state, { kind: "gv", delta: 2 });
  render();
});

render();
