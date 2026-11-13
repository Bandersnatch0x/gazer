import { describe, expect, it } from "vitest";
import { TREE_NODE_SIZE, edge, node } from "../src/render/tree";

describe("tree: family-tree node primitives (§10.5-6, for the D stream)", () => {
  it("builds a 12x12 node with integer anchors from (x, y)", () => {
    const n = node(40, 20);
    expect(n.kind).toBe("tree_node");
    expect(n.x).toBe(40);
    expect(n.y).toBe(20);
    expect(n.w).toBe(TREE_NODE_SIZE);
    expect(n.h).toBe(TREE_NODE_SIZE);
    expect(n.right).toEqual({ x: 52, y: 26 });
    expect(n.left).toEqual({ x: 40, y: 26 });
    expect(Number.isInteger(n.labelX) && Number.isInteger(n.labelY)).toBe(true);
  });

  it("carries an optional label anchored to the right of the box", () => {
    expect(node(0, 0).label).toBeNull();
    const named = node(10, 10, "gazer_03");
    expect(named.label).toBe("gazer_03");
    expect(named.labelX).toBeGreaterThan(named.x + named.w);
  });

  it("marks the dead grey and the inherited alive", () => {
    expect(node(0, 0).dead).toBe(false);
    expect(node(0, 0).inherited).toBe(false);
    const gone = node(8, 30, "gazer_01", { dead: true, inherited: true });
    expect(gone.dead).toBe(true);
    expect(gone.inherited).toBe(true);
  });

  it("is pure: same input, same node", () => {
    expect(node(3, 4, "a", { dead: true })).toEqual(node(3, 4, "a", { dead: true }));
  });

  it("routes a parent edge as a right-angle elbow", () => {
    const parent = node(10, 10);
    const child = node(30, 40);
    const e = edge(parent.right, child.left);
    expect(e.kind).toBe("tree_edge");
    expect(e.from).toEqual(parent.right);
    expect(e.to).toEqual(child.left);
    expect(e.elbowX).toBe((parent.right.x + child.left.x) / 2);
    expect(Number.isInteger(e.elbowX)).toBe(true);
  });

  it("rounds fractional coordinates instead of carrying them", () => {
    expect(node(2.4, 5.6).x).toBe(2);
    expect(node(2.4, 5.6).y).toBe(6);
    const e = edge({ x: 1.2, y: 3.8 }, { x: 9.5, y: 4.1 });
    expect(e.from).toEqual({ x: 1, y: 4 });
    expect(e.to).toEqual({ x: 10, y: 4 });
  });
});
