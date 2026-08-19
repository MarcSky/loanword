---
name: review
description: Open the Loanword trainer — FSRS flashcard review in the browser at localhost:4747. Use when the user asks to review vocabulary, practise, or open the trainer.
disable-model-invocation: false
allowed-tools: Bash
---

# /loanword:review — the trainer

Start the server in the background. It exits by itself if the port is already
serving a trainer:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/serve.mjs"
```

Use `run_in_background: true` — the server has to stay up while the user works
through the deck.

Then open the browser:

```bash
open http://localhost:4747 2>/dev/null || xdg-open http://localhost:4747
```

Say it in one line: opened http://localhost:4747 — `space` reveals the answer,
`1–4` grade, `esc` quits.

`LOANWORD_PORT` overrides the port. The server binds `127.0.0.1` only.

If there are no cards the UI says so itself. Do not check that up front and do
not run build unless asked.
