# 0010 — FX-LIB-MASTER 效果原语库入库 `docs/design/fx/` 并入既有原语体系

日期:2026-11-12

## 背景

FX-LIB-MASTER-01(30 项效果原语全表)由用户交付,状态定稿候选。本仓已有效应原语体系(sim/effects.ts 16 种 + render/effects.ts plan/apply 执行器,效应原语是引擎唯一接受的演出词汇)。评审结论与修订 F1–F7 见 `docs/design/fx/README.md`。

## 被选方案

master 总表 + 5 子文档(01a–01e)入库 `docs/design/fx/`,master 为 CI 交叉校验唯一真值;实现路线:30 项并入既有 Effect union 与 plan/apply 执行器扩展(F1),执行器核心骨架(校验/预算/护栏/幂等/取消/记账)先行落票 0024,画布层与 DOM/WebAPI/音频层按 ART-CORE 首批合并序分期。

## 被否方案及落选理由

- **另起独立 FX 执行器子系统**:落选——与「效应原语是引擎唯一接受的演出词汇,导演只能组合」正典冲突,双执行体系会让护栏(G1–G10)失去单点执行位。
- **只入 master 不拆子文档**:落选——§0.5 拆分协议是用户明定的防损措施(CI 逐文件验收依赖),违反即毁约。

## 影响面

- `docs/design/fx/`(新增 6 文件);票据 0023/0024;`src/sim/fx.ts`(新,执行器核心);后续批次扩展 `src/sim/effects.ts`、`src/render/effects.ts`、`src/ui/`、音频层。
