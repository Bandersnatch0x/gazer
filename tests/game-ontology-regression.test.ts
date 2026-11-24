import { describe, expect, it } from "vitest";
import { beliefFor, emptyOntology, recordShift } from "../src/sim/ontology";
import { ontologyShiftFor } from "../src/game";

describe("R2.4 · GV cannot rewrite ontology", () => {
  it("a stage drop does not record a backward kind", () => {
    // The real history always records the rise first: 2→3 then 3→4.
    let ledger = emptyOntology();
    ledger = recordShift(ledger, ontologyShiftFor(2, 3, 60));
    ledger = recordShift(ledger, ontologyShiftFor(3, 4, 80));
    expect(beliefFor(ledger, "creature")).toBe("record");

    // GV falls, so stage falls. The shift table can compute 4→3, but the
    // append-only ledger refuses to restate an already-recorded boundary.
    const afterDrop = recordShift(ledger, ontologyShiftFor(4, 3, 70));
    expect(afterDrop).toBe(ledger);
    expect(beliefFor(afterDrop, "creature")).toBe("record");
  });

  it("the same stage boundary is idempotent", () => {
    let ledger = emptyOntology();
    const shift = ontologyShiftFor(1, 2, 40);
    ledger = recordShift(ledger, shift);
    expect(recordShift(ledger, shift)).toBe(ledger);
  });
});