# 0013 — 美术实现评审处置批「全部按推荐」定案 + 四项口径裁定

日期:2026-11-13

## 背景

四轴美术实现符合度评审(报告:`.agents/keep/art-review/2026-11-13-implementation-review.md`)核出 P0×4/P1×5/P2×~20。用户对裁决批次「全部按推荐,开工」。

## 裁决内容

1. **口径四项**(R14 已注回规范):血缘链更正(tower_void=term_bg=S4=`#0B0D12`,E 为同族近黑);噪点=相位带帧序噪声;channel established 走 70ms canon 通道(N2 统一);特写触发=双击个体。
2. **处置批次**:0041 衰减体系(sprite 轴)/0042 微帧+锚位节拍+双生魂+EAT 修正(canvas 轴)/0043 塔正典位统一 {0,7}+T0@GV50+禁区+点击反馈(塔轴)/0044 终端运行面(终端轴)/0045 CRT 收尾(第二波)/0046 文档批(lead 直做,本决策 + R14)。
3. **N4 同日终闭合**(canon.lock 44 条目,见票 0028 Log)。
4. **R15 附录**(票 0041,2026-11-13):§5.2 锚点表按公式实算重校(GV60=#7AD155/GV80=#77C853/GV100=#73BF53±),逐字公式为引擎正典,拒绝校准层;详见 art README R15。

## 影响面

票据 0041–0046;`docs/design/art/` 四文件 R14 注;`src/render/`(palette/scene/masks/sprite/app/tower/crt)、`src/game.ts`、`src/sim/`、`src/ui/`、`src/main.ts` 后续落码。
