import { describe, expect, it } from "vitest";
import { project, tileCenter, unproject } from "../src/render/scene";

describe("isometric projection", () => {
  it("round-trips a tile through its own screen position", () => {
    for (let x = 0; x < 16; x += 1) {
      for (let y = 0; y < 16; y += 1) {
        const tile = { x, y };
        expect(unproject(project(tile))).toEqual(tile);
        expect(unproject(tileCenter(tile))).toEqual(tile);
      }
    }
  });

  it("puts a click at the centre of the nearest tile it lands in", () => {
    const centre = tileCenter({ x: 7, y: 9 });
    expect(unproject({ x: centre.x, y: centre.y })).toEqual({ x: 7, y: 9 });
  });
});