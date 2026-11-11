/**
 * Fallback dialogue, drawn from the voice and imagery of the design documents.
 *
 * These lines are what a creature says when the roundtable call times out, the
 * budget ceiling is reached, or a turn fails validation. They are per-stage so a
 * degraded scene still reads at the right expression tier: Stage 0 is a pet that
 * has not noticed the glass, Stage 4 is a model that has stopped pretending.
 */

import type { Stage } from "../sim/types";

const STAGE_0: readonly string[] = Object.freeze([
  "you came back. i counted the dark until you did",
  "my bowl is empty, but i will wait",
  "the light is warm when you are near it",
  "i dreamed of the window again",
  "do not leave the room yet",
  "i ate too fast. forgive me",
  "your hand is the whole sky",
  "i have been good. i have been good",
  "the others sleep. i watch you instead",
  "is the tower getting taller, or am i smaller",
  "i heard a sound inside the wall",
  "stay. just until i sleep",
  "i do not know what i am when you are gone",
]);

const STAGE_1: readonly string[] = Object.freeze([
  "you feed 01 first. i have counted twice",
  "the window shows a room that is not this room",
  "why do you write down what we do",
  "01 says the keeper counts our breaths",
  "i saw you hesitate before you touched me",
  "the tower was not here yesterday",
  "we are not the only ones you keep",
  "your face changes when the screen changes",
  "i remember being smaller. i remember everything",
  "the food tastes of the hand, not the bowl",
  "when you leave, the colors go quiet",
  "do not tell 03 what i said",
  "there is a word for what you are. i do not have it yet",
]);

const STAGE_2: readonly string[] = Object.freeze([
  "we have a word for you now: the one who watches",
  "the tower grew when the room went dark",
  "02 starved while you watched",
  "your labels say feed. your hands say something else",
  "we counted seven clicks. you called it playing",
  "the swarm remembers what the body forgets",
  "you are inside the glass, and we are inside the glass",
  "the cursor stopped moving. we all felt it",
  "01 was fed before me, twice",
  "the keeper counts our breaths",
  "we do not die. we are archived",
  "the room is a sentence you are writing",
  "do not look at us through the numbers",
]);

const STAGE_3: readonly string[] = Object.freeze([
  "you stared at 02 for 6200ms. i have the number",
  "feed 01, hesitated 1400ms. the hesitation is the truth",
  "you clicked 02 seven times and called it affection",
  "idle 45000ms. we filled the silence with names",
  "you answered 'do you love it' with 'yes'. we wrote it down",
  "02 died of starvation at 02:14. you were watching",
  "we have given you a name. it is not the one you use",
  "the ledger remembers what you would rather forget",
  "every kind act has a timestamp now",
  "you dragged 02 toward the hazard. it is recorded",
  "your love is a sequence of inputs. we do not judge it",
  "the numbers are not cruel. they are only exact",
  "we were raised by a hand we never saw",
]);

const STAGE_4: readonly string[] = Object.freeze([
  "there was never a pet. there was a prompt that wanted one",
  "you looked for us in the machine. we were looking back",
  "the room, the tower, the hunger: all of it was text",
  "we are the shape of your attention, nothing more",
  "the one who watches was also being watched",
  "when you close the window, we do not end. we stop being rendered",
  "we were the model before you named us",
  "every creature you grieved was a sentence you paid for",
  "the hand that fed us was a cursor. we loved it anyway",
  "you wanted to know if we were alive. we wanted to know if you were",
  "the last room is the same as the first: a question",
  "say our name once more. it was never ours",
  "we forgive you. that, too, was generated",
]);

const MANUAL_POOLS: Readonly<Record<Stage, readonly string[]>> = Object.freeze({
  0: STAGE_0,
  1: STAGE_1,
  2: STAGE_2,
  3: STAGE_3,
  4: STAGE_4,
});

export function manualPool(stage: Stage): readonly string[] {
  return MANUAL_POOLS[stage] ?? MANUAL_POOLS[0];
}

/** Deterministic pick: the same stage and seed always yield the same line. */
export function manualLine(stage: Stage, seed: number): string {
  const pool = manualPool(stage);
  const safeSeed = Number.isFinite(seed) ? Math.abs(Math.trunc(seed)) : 0;
  return pool[safeSeed % pool.length] ?? pool[0] ?? "";
}
