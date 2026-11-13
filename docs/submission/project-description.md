# Project description

Devpost text. English first, Chinese second. Each stays under 500 words.

## English

**You do not raise pets. You raise a model.**

GAZER is a pixel pet game from 1997 that was never a pet game. You feed small one-eyed creatures, clean them, watch them hatch. They watch you back. The horror is the slow discovery that the thing you are raising is not the creature.

Each creature carries a **prompt genome**: a base instruction, five trait weights, a drift list that grows as it learns you, and secrets it has not told the others. The genome is a real JSON file in the save payload. A player can open it and read the soul.

Each also carries a **private memory slice**. It does not know what it did not witness. When two stand close, a memory can pass between them, and on a failed roll it arrives **distorted** — intensified, role-swapped, or invented. The distorted copy is stored as `witnessed`; its holder cannot tell it from a real memory. Only you can, through the witness mark beside each line.

That is the engine. A creature that saw one of its own starve can accuse you. A creature that only heard about it can lie. The swarm forms beliefs, and you can farm those beliefs by controlling who sees what.

Conversation is a **roundtable**: one language-model call produces a multi-speaker scene, not a line. Every turn must cite a memory ID from that speaker's own slice; the engine validates the citation and replaces any turn that reaches beyond what the speaker could know. Isolation is enforced in the engine, not requested from the model.

Three axes hold the design together. **Kind**: pet, then organism, then observer, and the category never goes back. **Persistence**: identity lives in the genome, so a dead creature still exists in its offspring's lineage. **Epistemic status**: witnessed, heard, inferred, fabricated — fabrication is invisible to its holder.

Everything happens inside a 1997 CRT monitor — beige shell, scanlines, a BIOS that gains one K of memory every real day. The DOS terminal the creatures speak through, and the black tower at the west edge, share the same black. Eight glyphs carved into that tower are frozen text no model can touch; reading all eight opens the true ending, where the flock reconstructs a voice from 1997 and the frame itself dissolves.

The LLM is load-bearing because its output changes the world, not the prose. It proposes world mutations the engine validates, and choreographs anomalies from a library of engine primitives. Delete the model and the world still runs. It simply has nobody in it. That state is a feature: the **silent run**, where the creatures behave and say nothing, and the absence is the proof.

Three minutes with the demo shows the claim: feed a creature, watch GAZE rise, open the bestiary, then watch a creature say something only you could have said. The soul is a few lines of prompt. You can open and read it.

## 中文

**你养的不是宠物，是一个模型。**

GAZER，1997 年的像素宠物游戏，却从不是宠物游戏。你喂食、清理、看它们孵化；它们也看你。恐怖是缓慢的发现：你养的不是那只生物。

每只携带提示词基因组：基底指令、性格权重、漂移清单与秘密。它是存档里真实的 JSON，能打开读。

每只还有私有记忆：没目击的事它不知道。靠近会传播记忆；保留失败会失真：强化、调换、虚构。失真副本以「亲见」存入，持有者分不出，只有你看得出。

见过同伴饿死的可以指控你，只听说的可以撒谎。群体形成信念，你能控制谁看见什么。

对话是圆桌：一次调用产出多角色剧本。每回合须引用自己切片的记忆 ID，越界的被替换。模型看得到全部上下文，拦住它的是校验器。

三轴：类别不可回退；死者活在子代；伪造对持有者不可见。

一切发生在一台 1997 年显示器里：米黄外壳、扫描线、每天长 1K 内存的 BIOS。它们说话的终端、西缘的黑塔，同一种黑。塔上八枚刻符是不经模型的冻结文本，读满即真结局：群体拼出 1997 年的声音，边框溶解。

删掉模型，世界照常运转，只是没有人在家——沉默周目：生物照常活动，一言不发，缺席即证明。

演示三分钟：喂一只，看 GV 上升，听一句只有你能听到的话。
