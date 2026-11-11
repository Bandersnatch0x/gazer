---
name: benchmark
description: Measure and explain a performance change with a comparable baseline, controlled workload, repeated samples, and a real bottleneck. Use before acting on a reported slowdown or speedup.
---
<!-- scaffold-stamp: agent-scaffold/skills/workflow/benchmark/SKILL.md@502e930+dirty -->

# Benchmark

## When to use

- A task reports a measurable slowdown, latency problem, throughput limit, or resource increase.
- A change is being justified by a claimed speedup or regression.
- The likely bottleneck or measurement boundary is not yet established.

## How to use

1. Record the version, workload, data size, environment, warm-up, sampling method, and baseline.
2. Verify that the measurement performs the real work instead of a cache hit, error short circuit, or changed workload.
3. Form one falsifiable bottleneck hypothesis and measure the observation that distinguishes it.
4. Change one causal variable, rerun under the same conditions, and report variance and limits.
5. Keep the conclusion proportional to the evidence. If the runs do not separate the candidates, report an unknown result.

## Boundaries

- Do not report a percentage without a comparable baseline and repeatable method.
- Do not optimize from a guess when a trace, query plan, or focused measurement can identify the limit.
- Do not call benchmark noise a product improvement.
