import { createGame } from "./game";
// Terminal dot-matrix face (ART-CORE-02 §2, ruling 0012 item 4): the OFL font
// ships via the fontsource package; @font-face css only, no runtime fetch.
import "@fontsource/fusion-pixel-12px-proportional-sc";
import type { GameHandle } from "./game";
import {
  FRAME_BIOS_STORAGE_KEY,
  FRAME_BOOTED_STORAGE_KEY,
  FRAME_DAY_STORAGE_KEY,
  FRAME_NGPLUS_STORAGE_KEY,
  FRAME_SESSION_STORAGE_KEY,
  canonNgPlusLine,
  canonUnexpectedShutdownLine,
  parseFrameBios,
  parseFrameSession,
  unexpectedShutdownFor,
} from "./game";
import { registerServiceWorker } from "./shell/register";
import { showOfflineNotice } from "./shell/offline";
import {
  biosMemoryK,
  dropShadowPxFor,
  glareAlphaForGv,
  installCrtShell,
  isWarmBoot,
  ledDeadFor,
  memoryCreepDays,
  forgettingAgingFor,
} from "./render/crt";
import type { BloomPoint } from "./render/crt";
import { dissolveProgress, isGazeTower } from "./sim/endings";
import { lowpassZoneContains, LOWPASS_VOID_FC, LOWPASS_VOID_RADIUS_TILES } from "./render/audio";
import type { AudioEngine } from "./render/audio";
import { LOGICAL_HEIGHT, LOGICAL_WIDTH, unproject } from "./render/scene";
import { installStyles } from "./ui/theme";
import { detectLocale, LOCALE_STORAGE_KEY } from "./ui/i18n";
import {
  DESKTOP_LAYOUT,
  MOBILE_LAYOUT,
  createTerminal,
  erosionStepForGv,
  installTerminalStyles,
  terminalPathFor,
} from "./ui/terminal";
import {
  createFxShellHost,
  createOsdPanel,
  dispatchShellFx,
  installWebApiWatchers,
  type ShellFxTargets,
} from "./ui/shell";
import type { ShellAudioFxDispatch } from "./sim/fx";
import { canonLine } from "./canon";

// Storage can be refused outright (Safari old private mode, enterprise policy,
// embedded WebViews). The game must still boot (playtest p4 finding F2): every
// access goes through this guard, which degrades to "no stored value" and
// swallows writes.
function safeStorage(): Storage | null {
  try {
    return localStorage;
  } catch {
    return null;
  }
}
function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

// The service worker only exists in production builds; in dev, `/sw.js` falls
// back to index.html and the registration logs a MIME error on every session
// (playtest p4 finding F5), masking real console errors.
if (!import.meta.env.DEV) {
  registerServiceWorker("./sw.js");
}
installStyles(document);
showOfflineNotice(
  document,
  detectLocale(location.search, safeGet(LOCALE_STORAGE_KEY)),
);

const canvas = document.getElementById("canvas");
const root = document.getElementById("ui");

if (!(canvas instanceof HTMLCanvasElement) || root === null) {
  throw new Error("GAZER shell markup is missing #canvas or #ui");
}

const endpoint = new URLSearchParams(location.search).get("endpoint");

// 移动端瘦身(§8):粗指针或窄视口走 12px 瘦身框与 4.0s 缩减冷启动。
const mobile = window.matchMedia("(pointer: coarse)").matches || window.innerWidth < 720;

// 开机幕的 BIOS 面在 createGame 之前起跑,蠕变与强退暗线在安装点从存档
// 直接派生(同一套纯函数,game 层接管后共享同一份记录)。
const bootBiosRecord =
  parseFrameBios(safeGet(FRAME_BIOS_STORAGE_KEY)) ?? { firstDayMs: Date.now(), resetDone: false };
const bootMemoryK = biosMemoryK(
  memoryCreepDays(bootBiosRecord.firstDayMs, Date.now()),
  bootBiosRecord.resetDone,
);
const bootUnexpectedShutdown = unexpectedShutdownFor(
  parseFrameSession(safeGet(FRAME_SESSION_STORAGE_KEY)),
);

// G-1/G-2(票 0045):跳过解锁与暖/冷启动从存档取——首次启动不可跳;同
// 现实日第二次起走暖启动 2.5s(移动 2.0s);跨日回到冷启动并推进日序。
const bootDayOrdinal = memoryCreepDays(bootBiosRecord.firstDayMs, Date.now());
const storedDayRaw = safeGet(FRAME_DAY_STORAGE_KEY);
const storedDay = storedDayRaw === null ? null : Number.parseInt(storedDayRaw, 10);
const warmBoot = isWarmBoot(Number.isFinite(storedDay) ? storedDay : null, bootDayOrdinal);
safeStorage()?.setItem(FRAME_DAY_STORAGE_KEY, String(bootDayOrdinal));
const firstBoot = safeGet(FRAME_BOOTED_STORAGE_KEY) !== "1";
// NG+ 存档(真·凝视后)BIOS 追加 RESTORED 行;暗线行全部自 canon registry
// 取用,运行时零转写(消 biosLines 双源,票 0045 G-2)。
const bootBiosExtra: string[] = [];
if (bootUnexpectedShutdown) {
  const line = canonUnexpectedShutdownLine();
  if (line !== null) {
    bootBiosExtra.push(line);
  }
}
if (safeGet(FRAME_NGPLUS_STORAGE_KEY) === "1") {
  const line = canonNgPlusLine();
  if (line !== null) {
    bootBiosExtra.push(line);
  }
}

// The LS-97 framing goes up before the world boots: the cold-start sequence
// runs on its own constant timeline while `createGame` spins the world up
// underneath, so at 6.5s the world is already running (ART-CORE-04 §3).
// The audio beats are wired but silent — the sound spec ticket owns voices.
// The hardware buttons resolve through the game handle, which does not exist
// until `createGame` resolves — hence the late-bound ref.
let gameRef: GameHandle | null = null;
const crt = installCrtShell({
  doc: document,
  canvas,
  cold: !warmBoot,
  firstBoot,
  mobile,
  memoryK: bootMemoryK,
  biosExtraLines: bootBiosExtra,
  onAudioBeat: () => {},
  onPowerClick: () => {
    const outcome = gameRef?.powerPress() ?? "denied";
    if (outcome === "restart") {
      crt.shutdown();
    } else if (outcome === "rebound") {
      crt.dimRebound();
    }
    // denied:咔声由 game 层内联;屏幕无任何反应(§4)。
  },
  // SD-3(票 0045):按钮与自发消磁同形——演出统一由 syncFrame 的帧事件
  // 排干落波纹,这里只入账。
  onDegaussClick: () => {
    gameRef?.degaussPress();
  },
});
// 首次启动已记账:此后冷启动 1.4s 后可跳(G-1)。
safeStorage()?.setItem(FRAME_BOOTED_STORAGE_KEY, "1");
// `?lcd=1` is the wiring entry for the accessibility kill switch; the OSD
// settings page flips the same switch through the handle.
if (new URLSearchParams(location.search).has("lcd")) {
  crt.setLcdMode(true);
}

const game = await createGame({
  doc: document,
  canvas,
  root,
  // Absolute http(s) URLs and same-origin relative paths (e.g. `/v1/game`, the
  // dev-server LLM adapter in vite.config.ts) are both accepted; the bridge
  // client re-checks the same-origin rule before any request leaves the page.
  endpoint: endpoint !== null && /^https?:\/\/|^\//.test(endpoint) ? endpoint : null,
  // Stream the guarded storage down (finding F2): the game layer's reads and
  // writes go through the same guard, quota errors included.
  storage: safeStorage(),
});

// ---------------------------------------------------------------------------
// 终端接线(票 0020 Log 签名)与 fx → shell/audio 派发接通(票 0026)。
// DOM/WebAPI 层允许真实事件时间戳作触发源;一切 sim 状态仍只由世界 tick 推进。
// ---------------------------------------------------------------------------

installTerminalStyles(document);
const terminal = createTerminal(document, {
  stage: game.world().stage,
  layout: mobile ? MOBILE_LAYOUT : DESKTOP_LAYOUT,
  // 标题栏路径每存档唯一(ART-CORE-02 §3.1,票 0044):由存档 seed 派生,
  // 同存档恒同,替换此前的硬编码示例。
  path: terminalPathFor(game.world().seed),
});
document.body.append(terminal.root);
gameRef = game;

// 终端键盘输入通道(票 0039 P4):复用 0020 的 `submitInput` 语义,零新语义
// ——阶段<3 落 `resolveInput` 的 denied 面(`> access denied`,warn_red),
// 阶段≥3 回显白并转 WAIT。击键喂 G7 镜面律(`playerTyped`)。输入框聚焦时
// 不劫持(命名面板等的正常打字优先)。
let terminalInputLine = "";
document.addEventListener("keydown", (event: KeyboardEvent) => {
  const target = event.target;
  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
    return;
  }
  if (event.key === "Enter") {
    if (terminalInputLine.length > 0) {
      terminal.submitInput(terminalInputLine, performance.now());
      terminalInputLine = "";
    }
    return;
  }
  if (event.key === "Backspace") {
    terminalInputLine = terminalInputLine.slice(0, -1);
    terminal.playerTyped(performance.now());
    return;
  }
  if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
    terminalInputLine += event.key;
    terminal.playerTyped(performance.now());
  }
});

const fxShell = createFxShellHost(document);
document.body.append(fxShell.root);

// FX 音频通道(A-01…A-06)。经转发器现读引擎实例——特写 −4dB duck 会重建
// 引擎(dispose+create),任何捕获的实例都会变陈旧,故每次派发都现读。
// 票 0031 项 4:fxEngineSource 换成 `() => game.audio()`,A 层正式并入世界
// BGM 链(RenderApp.audio 是实时 getter,closeup duck 重建后仍旧新鲜)。
const fxEngineSource = (): AudioEngine => game.audio();
const fxAudio: AudioEngine = {
  setStage: (next) => fxEngineSource().setStage(next),
  setSilent: (silent) => fxEngineSource().setSilent(silent),
  dropTrack: (track) => fxEngineSource().dropTrack(track),
  blip: (kind) => fxEngineSource().blip(kind),
  resume: () => fxEngineSource().resume(),
  dispose: () => fxEngineSource().dispose(),
  roomTone: (gain) => fxEngineSource().roomTone(gain),
  stopRoomTone: () => fxEngineSource().stopRoomTone(),
  duckAmbient: (db, rampMs) => fxEngineSource().duckAmbient(db, rampMs),
  unduckAmbient: (rampMs) => fxEngineSource().unduckAmbient(rampMs),
  setLowpass: (active, fc) => fxEngineSource().setLowpass(active, fc),
  heartbeat: () => fxEngineSource().heartbeat(),
  whisperBed: (voices) => fxEngineSource().whisperBed(voices),
  stopWhisperBed: () => fxEngineSource().stopWhisperBed(),
  removeTrack: (trackIdx, durMs) => fxEngineSource().removeTrack(trackIdx, durMs),
};

const fxTargets: ShellFxTargets = { terminal, shell: fxShell, audio: fxAudio };
const applyFx = (dispatch: ShellAudioFxDispatch): void => {
  dispatchShellFx(dispatch, fxTargets);
};
// 执行器请求源(票 0031 项 1):game 层 executeFx 产出的 D/W/A 派发由
// syncFrame 逐帧排干进此路由(见下方接线帧)。

// W 组探测器:被动、事件与接线帧驱动(无 setInterval)。canon 文案经
// canonLine 逐字取用,原文落在终端(不加 [SYSTEM] 前缀)。
const watchers = installWebApiWatchers(
  document,
  {
    onAlert: (ms) => fxShell.alert(ms, performance.now()),
    onCanonLine: (key) => {
      const line = canonLine(key);
      if (line !== null) {
        terminal.appendRaw(line);
      }
    },
    onSleepWake: () => {
      // W-04 的个体位置微移世界写入(票 0031 项 3):确定性 ±1 tile,
      // 网格钳制由 game 层的 move 通道落盘。
      game.nudgeOnSleepWake();
    },
  },
  safeStorage(),
);
watchers.arm("tab_return", true);
watchers.arm("save_integrity", true);
watchers.arm("clock_jump", true);
watchers.arm("sleep_wake", true);

// OSD 设置页戏中戏(ART-CORE-04 §2.3):绿字黑底叠加;三个开关全部戏内化。
const osd = createOsdPanel(document, {
  onScanline: (percent) => crt.setScanlineAlpha(percent / 100),
  onFlicker: (on) => crt.setAperture(!on),
  onLcd: () => crt.setLcdMode(true),
});
document.body.append(osd.root);
const osdToggle = document.createElement("button");
osdToggle.type = "button";
osdToggle.className = "gazer-key";
osdToggle.textContent = "OSD";
const osdBar = document.createElement("div");
osdBar.style.cssText =
  "position:fixed;top:8px;left:50%;transform:translateX(-50%);z-index:20;display:flex;";
osdBar.append(osdToggle);
document.body.append(osdBar);
osdToggle.addEventListener("click", () => {
  osd.root.style.display = osd.root.style.display === "flex" ? "none" : "flex";
});

// A-04 塔周低通:读塔位,区域绑定自动执行,非 LLM 触发。
let playerTile: { x: number; y: number } | null = null;
canvas.addEventListener("pointermove", (event: PointerEvent) => {
  const rect = canvas.getBoundingClientRect();
  const scale = rect.width / LOGICAL_WIDTH;
  playerTile = unproject({ x: event.offsetX / scale, y: event.offsetY / scale });
});

let lastStage = -1;
let lastLed: "green" | "amber" | "cursor_beat" | "off" | null = null;
let lastShadow = -1;
let lastEndingKey: string | null | undefined = undefined;
let desyncRevert = false;
/**
 * G-4(票 0045):终端光标页坐标 → 逻辑屏投影。光标行在终端窗底部,多数
 * 视口落在屏幕矩形之外——落在屏外时该点自然缺席(bloom 只点亮屏内两点)。
 */
function terminalCursorBloomPoint(
  terminal: { readonly root: HTMLElement },
  worldCanvas: HTMLCanvasElement,
): BloomPoint | null {
  const rect = terminal.root.getBoundingClientRect();
  const canvasRect = worldCanvas.getBoundingClientRect();
  const scale = canvasRect.width / LOGICAL_WIDTH;
  if (!(scale > 0)) {
    return null;
  }
  const pageX = rect.left + 24;
  const pageY = rect.bottom - 8;
  const lx = (pageX - canvasRect.left) / scale;
  const ly = (pageY - canvasRect.top) / scale;
  if (lx < 0 || lx > LOGICAL_WIDTH || ly < 0 || ly > LOGICAL_HEIGHT) {
    return null;
  }
  return { kind: "terminal_cursor", x: Math.round(lx), y: Math.round(ly) };
}
const syncFrame = (nowMs: number): void => {
  const world = game.world();
  // 台词回合 → 终端 TYPE 运行面(票 0044):LLM 回合带真实到达间隔
  // (game 层从请求延迟摊布),无上游的回合走假打字机(meta.fake_typing
  // 标记随轮携带)。先于 render 排干,字符揭示由 render 同帧起步。
  for (const turn of game.drainTerminalTurns()) {
    if (turn.intervals === null) {
      terminal.startFakeType(turn.speaker, turn.text, nowMs);
    } else {
      terminal.startTokenType(turn.speaker, turn.text, turn.intervals, nowMs);
    }
  }
  // 真结局录音演出链(票 0050):线索排干——canon 走 70ms 正典通道,
  // reconstructed 走重构面,spoken 齐声落 collective 说话者行。
  for (const cue of game.drainRecordingCues()) {
    if (cue.kind === "canon") {
      terminal.startCanonPrint(cue.text, nowMs);
    } else if (cue.kind === "reconstructed") {
      terminal.appendReconstructed(cue.text);
    } else {
      terminal.appendSpeaker("collective", cue.text);
    }
  }
  // 演出纪律(§5.2):录音窗内世界时钟暂停漂移——计数停摆,不补跑。
  terminal.setErosionFrozen(game.recordingActive(), world.tick);
  // 翻译流正典打印转发(票 0029,lead 扩权项):game 层的打印队列逐帧
  // 排干,多条按 70ms/字符链式排队——F8 的前置行先落,正文接续。
  let printAt = nowMs;
  for (const line of game.drainCanonPrints()) {
    terminal.startCanonPrint(line, printAt);
    printAt += line.length * 70;
  }
  // 帧回显(票 0036):`> no.` 等 canon 正文经 appendRaw 原文呈现。
  for (const line of game.drainEchoes()) {
    terminal.appendRaw(line);
  }
  // 执行器 D/W/A 派发排干(票 0031 项 1):E7 的 dom_erosion/title_mutate
  // 与一切 shell 面经此落终端/壳/音频。
  for (const dispatch of game.drainShellFx()) {
    applyFx(dispatch);
  }
  terminal.render(nowMs);
  fxShell.frame(nowMs);
  // G4:眨眼时钟挂模拟 tick——书签眼/越界眼与游戏内个体同帧。
  fxShell.tick(world.tick);
  if (world.stage !== lastStage) {
    lastStage = world.stage;
    terminal.setStage(world.stage);
    // 阶段门控(ART-CORE-02 §6.0/§6.1,票 0044):0–1 不出现;3+ 常驻;
    // 阶段 2 的幽灵面由下方 takeTerminalGhost 事件驱动(首次圆桌浮现)。
    terminal.setPresence(world.stage >= 3 ? "resident" : "hidden");
    fxShell.setStage(world.stage);
  }
  // GV40 首次圆桌(§6.1):40% 不透明度浮现 3s 整窗淡出,无任何常驻迹象。
  if (game.takeTerminalGhost()) {
    terminal.setPresence("ghost", nowMs);
  }
  // E7 LED 面:电源 LED 绿(<80)/琥珀(≥80);结局 B 以光标节拍闪烁、
  // C 遗忘熄灭(§7/§10.8,同一条接线面)。
  const ending = world.ending;
  const gazeReached = isGazeTower(world.glyphsRead);
  const endingKey: string | null =
    gazeReached ? "gaze" : (ending?.kind ?? null);
  const led: "green" | "amber" | "cursor_beat" | "off" =
    endingKey === "judgment"
      ? "cursor_beat"
      : endingKey === "forgetting" && ledDeadFor(game.sessionCount())
        ? "off"
        : world.gv >= 80
          ? "amber"
          : "green";
  if (led !== lastLed) {
    lastLed = led;
    crt.setLed(led);
  }
  crt.tickLed(nowMs);
  // GV80 起落影逐会话加深(§6)。
  const shadow = world.gv >= 80 ? dropShadowPxFor(game.sessionCount()) : 8;
  if (shadow !== lastShadow) {
    lastShadow = shadow;
    crt.setShadowDepth(shadow);
  }
  // GV96 眩光消退(§6/CI 项 6):与终端输入劫持(GV96)同帧触发——
  // 本块与 advanceErosion 同在 syncFrame 内先后落定,时间戳进 glareLog。
  crt.setGlare(glareAlphaForGv(world.gv), nowMs);
  // 四结局框体(§7):溶解进度从结局 tick 派生;C 遗忘老化由会话计数推进
  // (SD-4,票 0045);真·凝视 = 框体侧 1s 撤走序列(G-7)。
  const endingProgress =
    ending !== undefined && ending.kind === "fusion"
      ? dissolveProgress(ending.atTick, world.tick)
      : endingKey === "forgetting"
        ? forgettingAgingFor(game.sessionCount())
        : gazeReached
          ? 1
          : 0;
  if (endingKey !== lastEndingKey || endingKey === "fusion") {
    lastEndingKey = endingKey;
    crt.setEnding(endingKey, endingProgress, game.sessionCount());
  }
  // SD-3(票 0045):消磁帧事件排干——按钮与自发同形:波纹 + 16ms 反射性
  // 闭眼(G4 通道,壳面眼与游戏内个体同拍)。
  for (const event of game.drainFrameEvents()) {
    void event;
    crt.degauss(nowMs);
    fxShell.blinkFlash(nowMs);
  }
  // G-4(票 0045)两点辉光(G9 白名单):G 高光自世界取,终端光标页坐标
  // 投影进逻辑屏(光标在屏外则该点自然缺席);crt 层变位才重绘。
  const bloom = [...game.bloomPoints()];
  const cursorPoint = terminalCursorBloomPoint(terminal, canvas);
  if (cursorPoint !== null) {
    bloom.push(cursorPoint);
  }
  crt.setBloom(bloom);
  // GV20–40 失步(§6):整屏内容横移 1px 持续 1 帧 + 嗒声位。
  if (game.takeDesync()) {
    canvas.style.transform = "translateX(1px)";
    desyncRevert = true;
    fxAudio.blip("frame_tick");
  } else if (desyncRevert) {
    desyncRevert = false;
    canvas.style.transform = "";
  }
  // 侵蚀 step 3 的个体名来源:首个有名个体,退而取首个个体 id。
  const creatures = Object.values(world.creatures).sort((a, b) => (a.id < b.id ? -1 : 1));
  const named = creatures.find((c) => c.name !== null && c.name.length > 0) ?? creatures[0];
  if (named !== undefined) {
    terminal.setErosionName(named.name ?? named.id);
    fxShell.setPlayerName(named.name);
  }
  // D-04 GV 表:按序逐帧排干,不跳步。
  terminal.advanceErosion(erosionStepForGv(world.gv), world.tick);
  const tower = world.structures.find((s) => s.kind === "black_tower");
  fxAudio.setLowpass(
    tower !== undefined && playerTile !== null && lowpassZoneContains(playerTile, tower.at, LOWPASS_VOID_RADIUS_TILES),
    LOWPASS_VOID_FC,
  );
  watchers.poll(Date.now(), nowMs, document.visibilityState === "visible");
  requestAnimationFrame(syncFrame);
};
requestAnimationFrame(syncFrame);
