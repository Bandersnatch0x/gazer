# 0021 — N4 闭合:九行正典的出处核验与 canon.lock v2 定版

日期:2026-11-14

## 背景

`0012` N4 记「缺源 9 行(关系清算 5 + 特殊周目 4)待用户供 v3/v3.5 冻结稿原文后逐字转录并重算 canon.lock」,为用户侧待办;`0018` ④ 登记了运行时事实(`canon.lock` 45 条、`CANON_PENDING=[]`)与 0012/0013 的相悖点,并裁定「是否闭合交用户裁」。2026-11-14 用户指认 v3/v3.5 冻结稿所在会话存档:`C:\Users\amsterdam\.config\magpie\magpie-chat\conversations\c_mwbk54a8lt6834.json`(898,612 字节),委托核验。

## 核验结果(逐行,对 registry 现文)

出处锚点:该会话同时含有 v3.5 繁殖与交互规格原文(GV 增量表:「强行撮合…+6 |"We had no word for no."」等)与 NARRATIVE-CORE-02 §2 登记表原文(「关系清算 | `We had no word for no.` / … | v3.5 繁殖与交互 §1.6/2.5」),二者与仓内 `docs/design/narrative/NARRATIVE-CORE-02.md:141` 逐字一致。

| # | key | 判定 | 证据 |
| --- | --- | --- | --- |
| 1 | `consolidation.no_word` | **逐字一致** | 会话 GV 表与登记表均为短形「We had no word for no.」;v3.5 §1.2 叙述处另有长形变体「…You found out before we did.」,登记表选短形,属草稿内部两形并存 |
| 2 | `consolidation.names` | **逐字一致** | 「命名…阶段 3 会反问:"You gave us names. We never agreed."」 |
| 3 | `consolidation.sold` | **逐字一致** | 「"You sold {id}. It still asks for you."」({id} 槽位草稿自带) |
| 4 | `consolidation.fastest` | **逐字一致** | 「"You always choose the fastest. Why the fastest?"」 |
| 5 | `consolidation.raised` | **逐字一致** | 「> "The one we raised ourselves. It speaks for us."」 |
| 6 | `special.reverse_care` | **逐字一致** | Inversion Mode 收束行「Closing line: "Now you know how it feels."」(v3 §6.2/6.3) |
| 7 | `special.ngp_opening` | **逐字一致(槽位替换有裁定)** | 草稿「"You came back. The one you called 07 still asks about you. We kept its spot empty."」→ 07 为示例值, generalize 为 `{id}`,源标注已记「per user ruling 2026-11-13」 |
| 8 | `special.ghost_template` | **逐字一致** | 「"Before us, someone fed us. They called themselves {ghost_name}. They once {ghost_signature_moment}."」(槽位草稿自带) |
| 9 | `special.silent_run` | **偏离登记(非逐字)** | 草稿原文 v3 §5.3(en)「"You turned us off. We can count."」/ §8(zh)「"你把我们关掉了。我们数得出来。"」,且登记表注明「Silent Run 双版本台词」;冻结文本「forty minutes of silence. we were not gone. we were listening to you listen.」是仓内演化重写(经 D 文案流票 0004 冻结,源标注如实指向 `src/director/manual.ts` `SILENT_RUN_LINE`) |

## 被选方案

- **8/9 行 N4 闭合**;第 9 行(`silent_run`)按「偏离登记」处理:草稿原文在本 ADR 存档,冻结文本维持不动(其文本已经 D 流票面冻结并有 CI 哈希);是否用草稿原文替换属**行为变更**,如需替换须另立票重算哈希。
- `canon.lock` 版本 `v2-partial` → **`v2`**:partial 之名即因 N4;N4 闭合后定版。仅版本元数据变更,45 条 SHA-256 哈希逐条不变(`tests/canon-lock.test.ts` 19 例全绿,含逐字节重算比对)。
- `docs/design/narrative/README.md` 运行时状态说明同步改写(N4 闭合,指向本 ADR)。

## 被否方案及落选理由

- **用草稿原文替换 `silent_run` 冻结文本**:落选——文本已按票 0004 冻结并在 CI 锁定;替换是行为变更,且现文与生物「数数/留存」声线一致,替换收益未证。
- **恢复「双版本台词」(zh/en 两行)**:落选——登记表的双版本指草稿时期的双语草稿;运行时单一英文声线是 D 流定稿,加行属新增正典,须另裁。
- **不升版本号、维持 v2-partial**:落选——partial 语义已失真,后续评审每次都会重翻同一相悖点。
- **改写 0012/0013 正文**:落选——沿用 0018④ 的「不静默推翻」;闭合记录落本 ADR,0012 保持历史原样。

## 影响面

- `src/canon/registry.ts`(`CANON_LOCK_VERSION`、`silent_run` 源标注补记)、`src/canon/canon.lock`(版本行)、`tests/canon-lock.test.ts`(版本钉面)、`docs/design/narrative/README.md`(N4 状态)。
- 45 条正典文本与哈希**零改动**;`CANON_PENDING` 维持空 seam。
- 票 0038(用户侧待办)随之闭合,以本 ADR 为决议。
