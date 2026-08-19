---
name: stats
description: Show Loanword progress — card count, how many are learned, the streak, and the hardest words. Use when the user asks about their language-learning progress.
disable-model-invocation: false
allowed-tools: Bash
---

# /loanword:stats — progress

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/serve.mjs" --stats
```

The command prints JSON and exits; no server is started. Retell it compactly,
without tables and without padding:

- total cards / how many have been shown / learned (`stability` ≥ 21 days);
- how many are due right now;
- streak in days, and how much of today's limit is already reviewed;
- the five hardest — `hardest`, ranked by lapses.

The numbers cover the **open deck** — the language pair currently in the
settings. Other pairs keep their own cards and schedules; say so only if it is
relevant, and never imply they were lost.

If `total` is 0, one line: there are no cards yet, do some work and run
`/loanword:build`.
