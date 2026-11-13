# NARRATIVE-CORE 正典文本规范入库评审记录

NARRATIVE-CORE-01(1997 八碎片与真结局录音,P0 收官)与 NARRATIVE-CORE-02(觉醒事件七件套台词冻结稿,P1 canon 层收官)经评审后入库本目录,定稿即冻结。

## 评审结论

**通过,带修订入库(修订不触碰任何冻结文本本身,只修时间线笔误与实现口径)。** 两文档与四锚点美术、FX 原语库的联动点全部对得上:E3↔ART-CORE-02 §6.1、E5↔§6.2、E7↔§6.4+ART-CORE-04、E1↔ART-CORE-01 GV12、E2↔C-02、录音④↔C-06、W 组↔FX W-01–W-04。冻结协议(canon.lock SHA-256 + 存档携带 + 旧档保旧文本)可执行。

## 修订记录

| # | 级别 | 内容 |
|---|---|---|
| N1 | P0 笔误修正 | 刻符可见性时间线与 ART-CORE-03 §3.2 塔状态表对齐:刻符首现 = **T3/GV75**(原文写 T2/GV70;T2 的正典新增元素是顶点高光,塔 CI 项 2/5 依赖此表),F1–F3 gating 改 GV75;T5/GV90 5 枚、T6/GV100 8 枚不变。E6 注解同步标注。若用户倾向「刻符提前到 GV70」,须出 ART-CORE-03 v2 连带改塔 CI——列入待裁批次。 |
| N2 | 通道澄清 | 「固定 70ms/字符匀速打印」仅限正典打印通道([SYSTEM] 机器背诵);ART-CORE-02 §4.2「禁匀速」令只约束 LLM 台词通道。两通道并行不冲突,已标注进两份规范。 |
| N3 | 例外登记 | E4「注视塔 2s」登记为 ART-CORE-03 §6.4 的**正典例外,全存档恰 1 次**(CI 已含断言);个体停在缓冲区边缘,不触塔 CI 项 7 寻路禁区。 |
| N4 | 待补登记 | canon.lock 总登记表中「关系清算 5 行」「特殊周目 4 行」出处为会话外 v3/v3.5 文档,本仓现无全文;落地时先落 v3 冻结稿逐字转录,缺源行登记待补,canon.lock 首版仅含已落行、补齐后重算哈希(票 0028 跟踪)。 |
| N5 | 落点裁定 | `canon.lock` 与 registry 的仓内落点 = `src/canon/`(registry 数据 + lock 文件),不新增根级杂项目录;CI 从 `src/canon/` 读取比对。 |
| N6 | 后置登记 | 真结局录音 TTS(语速 0.85)与多声部依赖音频层,随票 0026 后置;录音结构文本行(头/尾/`now we keep you.`/`divergence:` 模板)先入 registry 冻结。 |
| N7 | 外部名扫描 | 全文无外部产品名,通过;datamining/TTS/BIOS 为技术词豁免。 |
| N8 | N4 收口+插槽裁定(2026-11-13) | 用户交付 v3 §5.6/§5.4 逐字原文,N4 全闭合:NG+ 开场冻结为骨架 `You came back. {id} still asks about you. We kept its spot empty.`(原稿 07 为示例值,正典插槽 = 存档中最具戏剧性个体 id);幽灵模板 `Before us, someone fed us. They called themselves {ghost_name}. They once {ghost_signature_moment}.`——`{id}/{ghost_name}/{ghost_signature_moment}` 均为运行时插槽,哈希只锁骨架占位符,插槽内容不入 diff。§5.5 引用玩家原话的行为为动态设计描述,非台词本体,不入 canon。canon.lock 44 条目,PENDING 清空。 |

## 待裁默认项(按推荐执行,用户可一句推翻)

1. **N1** 刻符首现 T3/GV75(替代方向:提前 T2/GV70,须连带 ART-CORE-03 v2 与塔 CI 改)。
2. **N5** canon 落点 `src/canon/`(替代方向:`public/canon/`——数据进运行时载荷,不推荐,离线包体积与篡改面增大)。
3. **N4** v3/v3.5 缺源行待补(替代方向:由智能体起草候选交用户裁——文字地位不同,不推荐;请用户供 v3/v3.5 冻结稿原文)。
