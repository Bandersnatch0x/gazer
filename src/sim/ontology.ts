import type { Stage } from "./types";

export type EntityKind = "pet" | "organism" | "observer" | "record" | "substrate";

export interface OntologyShift {
  readonly atStage: Stage;
  readonly entity: string;
  readonly from: EntityKind;
  readonly to: EntityKind;
  readonly evidence: string;
}

/**
 * Append-only. An entity's kind never regresses: a stage shift is irreversible
 * knowledge, while GV (expression intensity) may rise and fall freely.
 */
export interface OntologyLedger {
  readonly shifts: readonly OntologyShift[];
  readonly playerKind: "keeper" | "subject" | "record";
  readonly namedAs: string | null;
}

export function emptyOntology(): OntologyLedger {
  return { shifts: [], playerKind: "keeper", namedAs: null };
}

export function recordShift(ledger: OntologyLedger, shift: OntologyShift): OntologyLedger {
  const already = ledger.shifts.some(
    (existing) => existing.atStage === shift.atStage && existing.entity === shift.entity,
  );
  if (already) {
    return ledger;
  }
  return { ...ledger, shifts: [...ledger.shifts, shift] };
}

export function beliefFor(ledger: OntologyLedger, entity: string): EntityKind | null {
  let kind: EntityKind | null = null;
  for (const shift of ledger.shifts) {
    if (shift.entity === entity) {
      kind = shift.to;
    }
  }
  return kind;
}
