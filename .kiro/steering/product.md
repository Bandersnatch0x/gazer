# Product boundaries

GAZER is a 1997-style virtual pet game whose horror is cognitive. The player raises a model, not a pet. These boundaries are constraints on every feature, not aspirations.

## The claim that must stay true

Delete the LLM and GAZER becomes an ordinary pixel pet game. World shape, anomalies, swarm beliefs, and the one line a player alone hears are all decided at runtime by the model. If a feature can be fully specified without the model, it does not belong in the claim.

## Two progression layers

- GV sets expression strength: speech frequency, anomaly density, TTS on or off. Reversible.
- Ontology sets expression content: belief baseline, entity kinds, which cognitive collapses already happened. Irreversible.

A player who lowers GV gets a quieter world, not an innocent one. The creatures still know. That is designed behaviour and must not be "fixed".

## Honest isolation

The roundtable is one completion in which a single model writes several speakers. All attending creatures' memory blocks share one context, and the model can read all of them. The constraint is that a turn may cite only its own `memoryRef`; the engine enforces it by replacing failing turns with `manualPool` lines.

Do not write "physical isolation", "the context does not contain other creatures' memories", or "independent minds". Those claims are false and a judge can disprove them. True isolation costs one call per creature; GAZER does not pay that.

## Seven red lines

1. No jump scares, no gore. All horror is cognitive.
2. LLM output is filtered by schema validation plus a keyword blocklist, with a manual fallback pool.
3. The cozy act must not exceed 20 minutes for an engaged player.
4. Web escapes touch page-internal APIs only. Never camera, microphone, files, or real identity.
5. Ghost profiles carry portraits only, never raw logs, and are opt-out.
6. Swarm lying concerns in-game events only. The model never invents facts about the player's real life.
7. Inversion Mode's AI keeper must never mock the player. It hesitates and errs, but it is gentle.

Red line 7 is the emotional floor: the endpoint of horror must be empathy, not humiliation.

## Out of scope

- Multiplayer, accounts, server-side state.
- Real-world data ingestion of any kind.
- Audio asset files; audio is procedural.
- Any UI that blocks on a network call.
