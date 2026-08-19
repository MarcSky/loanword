---
name: review
description: Open the Loanword trainer — FSRS flashcard review in the browser at localhost:4747. Use when the user asks to review vocabulary, practise, or open the trainer.
disable-model-invocation: false
allowed-tools: Bash, Read, Write
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

## Interface language

The trainer renders in the user's **native** language when a dictionary exists.
Check once, after opening the browser — never before, and never twice in a
session:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/i18n.mjs" audit "$(node "${CLAUDE_PLUGIN_ROOT}/scripts/store.mjs" config | node -pe 'JSON.parse(require("fs").readFileSync(0)).native')"
```

- Clean, or the native language is `en`: say nothing.
- **No dictionary at all:** offer in one line — "the trainer is in English;
  want me to translate it into <language>? about a minute, nothing leaves the
  machine". Only if they say yes:
  1. `node "${CLAUDE_PLUGIN_ROOT}/scripts/i18n.mjs" keys` for the exact list,
  2. translate every key yourself and Write
     `${CLAUDE_PLUGIN_ROOT}/ui/i18n/<code>.json`,
  3. re-run `audit <code>` and fix what it reports.

  Keep `{placeholders}` and inline HTML tags exactly as they appear in the key.
  Plural keys look like `card|cards` and take an object of CLDR categories —
  see [`ui/i18n/README.md`](../../ui/i18n/README.md).
- **Dictionary exists but `audit` reports missing keys:** mention the count in
  one line and offer to fill them. Do not rewrite entries that are already
  translated.

Never offer this twice, and never block opening the trainer on it.
