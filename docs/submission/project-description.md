# Project description

Devpost text. English first, Chinese second. Each stays under 500 words.

## English

**You do not raise pets. You raise a model.**

GAZER is a pixel pet game from 1997 that was never a pet game. You feed small one-eyed creatures, clean them, watch them hatch. They watch you back. The horror is not a jump scare. It is the slow discovery that the thing you are raising is not the creature.

The creatures are not scripted characters. Each one carries a **prompt genome**: a base instruction, five trait weights, a drift list that grows as it learns you, and secrets it has not told the others. The genome is a real JSON file in the save payload. A player can open it and read the soul. It is a prompt.

Each creature also carries a **private memory slice**. It does not know what it did not witness. When two creatures stand close, a memory can pass between them, and on a failed retention roll it arrives **distorted**: intensified, role-swapped, or with an invented detail. The distorted copy is stored as `witnessed`. Its holder cannot tell it from a real memory. Only you can, through the witness mark beside each line.

That is the engine of the game. A creature that saw one of its own starve can accuse you. A creature that only heard about it can lie. The swarm forms beliefs, and you can farm those beliefs by controlling who sees what.

Conversation is a **roundtable**: one language-model call produces a multi-speaker scene, not a line. Every turn must cite a memory ID from that speaker's own slice. The engine validates the citation and replaces any turn that reaches beyond what the speaker could know. Isolation is enforced in the engine, not requested from the model. We say this plainly: the model sees the whole context, and the validator is what stops it from using it.

Three axes hold the design together. **Kind**: an entity is a pet, then an organism, then an observer, and the category never goes back. **Persistence**: identity lives in the genome, so a dead creature still exists in its offspring's lineage. **Epistemic status**: witnessed, heard, inferred, or fabricated, and fabrication is invisible to the one who holds it.

The LLM is load-bearing because its output changes the world, not the prose. It proposes world mutations the engine validates and applies, it builds the player model that every later line references, and it choreographs anomalies from a library of engine primitives. Delete the model and the world still runs. It simply has nobody in it. That state is a feature: the **silent run**, where the creatures behave and say nothing, and the absence is the proof.

Three minutes with the demo shows the claim: feed a creature, watch GAZE rise, open the bestiary and read what each one actually holds, then watch a creature say something only you could have said.

The soul is a few lines of prompt. You can open and read it.

## 中文

**你养的不是宠物，是一个模型。**

GAZER 是 1997 年的像素宠物游戏，但它从来不是宠物游戏。你喂食、清理、看它们孵化，它们也在看你。恐怖来自缓慢的发现：你养的不是那只生物。

每只生物携带一份**提示词基因组**：基底指令、五项性格权重、认识你之后增长的漂移清单、没告诉同伴的秘密。它是存档里真实的 JSON 文件，你能打开读到灵魂。

每只还携带**私有记忆切片**，它不知道没目击过的事。两只靠近时记忆会传播；保留失败时会**失真**：被强化、被调换主语、被添入虚构细节。失真副本以「亲见」存入，持有者无法区分，只有你能通过台词旁的目击标记看出。

看见同伴饿死的那只可以指控你，只听说过的那只可以撒谎。群体形成信念，你可以控制谁看见什么。

对话是**圆桌**：一次调用产出多角色剧本。每回合必须引用说话者自己切片里的记忆 ID，引擎校验，越界的回合被替换。隔离由引擎强制，不靠模型自觉。模型看得到全部上下文，拦住它的是校验器。

**类别**不可回退：宠物、生物、观察者。**持存**在基因组里：死去的仍活在子代谱系中。**认知状态**：亲见、听说、推知、伪造，伪造对持有者不可见。

LLM 不可删除，因为它的输出改变世界而非措辞：提议世界变更由引擎校验应用，构建台词引用的玩家画像，编排异常演出。删掉模型世界照常运转，只是没有人在家。这是**沉默周目**：生物照常活动，一言不发，缺席即证明。

三分钟演示足以说明：喂一只，看 GV 上升，打开相册读每只记得什么，再听一只说出只有你能让它说的话。