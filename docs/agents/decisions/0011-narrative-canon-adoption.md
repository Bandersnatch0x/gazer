# 0011 — NARRATIVE-CORE-01/02 正典文本层入库 `docs/design/narrative/`,P0 清单清空

日期:2026-11-12

## 背景

用户交付最后两份规范:八碎片与真结局录音(P0)、觉醒七件套台词(P1),宣告 canon 层闭合。评审修订 N1–N7 见 `docs/design/narrative/README.md`;冻结文本本身零改动,修订仅修刻符时间线笔误(N1)与实现口径。

## 被选方案

两文档入库 `docs/design/narrative/`,与 art/fx 评审记录同构;canon.lock 与 registry 落 `src/canon/`(N5);落地分三票:0028 canon 数据层(并行)、0029 翻译流演出(blocked-by 0020/0021/0028)、0030 觉醒七件套(blocked-by 0024/0025/0028),地图 0027。

## 被否方案及落选理由

- **N1 采纳原文 T2/GV70**:落选——与 ART-CORE-03 塔状态表及塔 CI(项 2/5)冲突,改塔表代价大于改叙事 gating;作为待裁项交用户,默认按推荐。
- **canon 数据落 public/**:落选——运行时载荷增大篡改面;canon 是引擎侧恒量,归 `src/canon/`。

## 影响面

- `docs/design/narrative/`(新增 3 文件);票据 0027–0030;`src/canon/`(新);`docs/agents/glossary.md` 视需要增补 canon 术语。
