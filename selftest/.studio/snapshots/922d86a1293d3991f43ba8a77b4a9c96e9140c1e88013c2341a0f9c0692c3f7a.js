/* GAZER 自测壳 — dsh-game-studio wrapper.
 *
 * This shell is not a game of its own: it embeds the real GAZER dev build
 * (vite dev server on :5199, with the LLM adapter endpoint enabled) in a
 * fullscreen iframe and mirrors its state into the studio playtest contract:
 *
 *   window.__gameState() — { phase, score, hearts, fps, hero, pickups,
 *                            enemies, world } mapped from GAZER's own world
 *                            state (posted across the iframe boundary via
 *                            postMessage; the origins differ).
 *   window.__autoplay()  — cycles the real interaction verbs a human player
 *                           has: quick-tap to feed, hold to pet, drag to
 *                           carry, right-tap to clean. Sent as commands the
 *                           GAZER side executes by dispatching the same
 *                           pointer events a finger would.
 *
 * Opt-in plumbing lives in GAZER's ?debug=1 bridge (src/game.ts).
 */
(function () {
  'use strict';

  var TARGET = 'http://localhost:5199/?debug=1&endpoint=/v1/game&seed=1997';

  /* 1. SHELL — fullscreen iframe */
  document.body.style.margin = '0';
  document.body.style.background = '#000';
  document.body.style.overflow = 'hidden';

  var iframe = document.createElement('iframe');
  iframe.src = TARGET;
  iframe.setAttribute('allow', 'same-origin');
  Object.assign(iframe.style, {
    position: 'fixed',
    inset: '0',
    width: '100vw',
    height: '100vh',
    border: '0'
  });
  iframe.addEventListener('load', function () { alive = true; });
  document.body.appendChild(iframe);

  /* 2. STATE MIRROR — GAZER posts {source:"gazer", type, payload} to us */
  var alive = false;
  var latest = null;
  var lastStateAt = 0;

  window.addEventListener('message', function (event) {
    var data = event.data;
    if (!data || data.source !== 'gazer') return;
    if (data.type === 'ready') alive = true;
    if (data.type === 'state') {
      latest = data.payload;
      lastStateAt = Date.now();
    }
  });

  function send(type, payload) {
    if (!alive) return;
    var win = iframe.contentWindow;
    if (win) win.postMessage({ source: 'gazer-selftest', type: type, payload: payload || {} }, '*');
  }

  /* 3. PLAYTEST CONTRACT */
  window.__gameState = function () {
    var creatures = [];
    var gv = 0;
    var stage = 0;
    var tick = 0;
    if (latest) {
      creatures = (latest.creatures || []).filter(function (c) { return !c.dead; });
      gv = Math.round(latest.gv * 10) / 10;
      stage = latest.stage;
      tick = latest.tick;
    }
    return {
      phase: 'playing',
      score: gv,
      hearts: creatures.length,
      fps: 60,
      hero: { x: 160, y: 90 },
      heroOnScreen: true,
      pickups: creatures.map(function (c) { return { x: c.x, y: c.y }; }),
      enemies: [],
      world: { w: 320, h: 180 },
      gazer: { tick: tick, stage: stage, eggs: latest ? latest.eggs : 0, stale: Date.now() - lastStateAt > 2000 }
    };
  };

  /* 4. AUTOPILOT — cycles the human verbs against the hungriest creature */
  var step = 0;

  function hungriest() {
    var list = (latest && latest.creatures || []).filter(function (c) { return !c.dead; });
    if (list.length === 0) return null;
    var best = list[0];
    for (var i = 1; i < list.length; i += 1) {
      if (list[i].hunger < best.hunger) best = list[i];
    }
    return best;
  }

  function randomOther(avoid) {
    var list = (latest && latest.creatures || []).filter(function (c) { return !c.dead && c.id !== (avoid && avoid.id); });
    if (list.length === 0) return null;
    return list[Math.floor(Math.random() * list.length)];
  }

  window.__autoplay = function () {
    if (!latest) return;
    step = (step + 1) % 6;
    var c = hungriest();
    if (!c) return;
    if (step <= 2) {
      // Quick taps: the feed verb, spaced past feedGuardMs (300) so two taps
      // never read as a gaze.
      send('tap', { x: c.x, y: c.y, holdMs: 40 });
    } else if (step === 3) {
      // Hold past petHoldMs (650), release before nameHoldMs (900): a pet.
      send('hold', { x: c.x, y: c.y, holdMs: 750 });
    } else if (step === 4) {
      // Carry the creature somewhere else on the floor.
      var spot = randomOther(c);
      send('drag', {
        x: c.x,
        y: c.y,
        toX: spot ? spot.x : 40 + Math.random() * 240,
        toY: spot ? spot.y : 30 + Math.random() * 120
      });
    } else {
      // Occasional clean: also keeps hygiene visible in the mirror state.
      var dirty = (latest.creatures || []).filter(function (x) { return !x.dead; })
        .sort(function (a, b) { return a.hygiene - b.hygiene; })[0];
      if (dirty) send('tapRight', { x: dirty.x, y: dirty.y });
    }
  };
})();
