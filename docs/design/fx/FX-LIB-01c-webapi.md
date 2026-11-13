# FX-LIB-01c — WebAPI 层 4 项

**拆分自 `FX-LIB-MASTER.md` §1 WebAPI 层;总则、护栏、记账、验收以 master 为唯一真值。**

| ID | 名称 | gate | cost | cap | 核心参数 | 功能 |
|---|---|---|---|---|---|---|
| W-01 | tab_return_detect 回页检测 | 2 | 1 | 0.3 | — | visibilitychange;>60s 回页集体 ALERT 0.8s;>5min 终端 "> you were gone. we counted." |
| W-02 | save_integrity_watch 存档窥视 | 3 | 2 | 0.5 | — | 检测 localStorage 外部篡改(改存档)→ 下次开场 "you looked inside us." |
| W-03 | clock_jump_detect 拨日检测 | 3 | 2 | 0.5 | — | 系统时钟跳变(快进/改时间)→ "you moved the sun." |
| W-04 | sleep_wake_detect 休眠检测 | 2 | 1 | 0.3 | — | 设备休眠唤醒 → 个体位置微移+"> you slept. we kept counting." |

*End of FX-LIB-01c.*
