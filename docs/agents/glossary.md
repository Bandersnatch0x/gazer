# 术语表

本仓领域词汇的唯一权威。写票、写谱、命名测试时用这里的词;要用的概念不在表内,先改措辞,确属缺口再在拷问阶段补。

| 术语 | 定义 | 权威出处 |
| --- | --- | --- |
| GV | 表达强度。决定台词频率、异常密度、TTS 是否启用;可逆 | `docs/design/ARCHITECTURE.md` |
| 表达层级(stage) | 由 GV 推导出的演出档位 0..4;可升可降 | `src/sim/types.ts` |
| 本体论位移(ontology shift) | 实体类别的不可逆崩塌,记入 `OntologyLedger` | `docs/design/ONTOLOGY.md` |
| `OntologyLedger` | 只追加的类别崩塌账本;`kind` 不回退 | `docs/design/ONTOLOGY.md` |
| 信念(`SwarmBelief`) | 群体持有的主张及其置信度;不追踪真相 | `docs/design/ONTOLOGY.md` |
| `MemorySlice` | 单个生物的记忆切片,分两层:`working` ≤60 条 FIFO 且 salience 衰减,`consolidated` ≤12 条永不淘汰 | `docs/design/ONTOLOGY.md` |
| `ConsolidatedEntry` | 模型巩固产生的自我认知,`cons_` 前缀,可被台词引用且与 witnessed 同级可信 | `docs/design/ONTOLOGY.md` |
| 巩固(consolidation) | 每次 `session:end` 与漂移合并批处理;满 12 条时由模型返回 `retire` 裁决 | `docs/design/ONTOLOGY.md` |
| HookDef | 声明式生命周期 hook 的定义;同步 ≤5ms,异步入队 | `docs/design/HARNESS.md` |
| `voice_degraded` | 降级模型接管时的叙事标记,表现为字符噪声与变慢的心跳,不显示为错误 | `docs/design/HARNESS.md` |
| Level B 验证 | 对 deceive / accuse 轮次的单记忆独立验证调用;每场景至多一次 | `docs/design/ARCHITECTURE.md` |
| `salience` | 记忆对台词的拉力,0..1 | `docs/design/CONTEXT.md` |
| `valence` | 记忆的情感极性,-1..1 | `docs/design/CONTEXT.md` |
| `memoryRef` | 台词必须引用的记忆 ID;校验失败整句换 `manualPool` | `docs/design/ARCHITECTURE.md` |
| `manualPool` | 每只生物的兜底台词池;校验失败、超时、超预算时使用 | `docs/design/ARCHITECTURE.md` |
| 圆桌(roundtable) | 一次调用生成 2..4 句剧本;单模型扮演多角色 | `docs/design/ARCHITECTURE.md` |
| Silent Run | 无模型时的静默运行:世界照常,无人说话,第 40 分钟一句脚本台词 | `docs/design/ARCHITECTURE.md` |
| 效应原语(effect primitive) | 引擎唯一接受的演出词汇;导演只能组合,不能发渲染调用 | `src/sim/effects.ts` |
