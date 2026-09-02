---
name: review
description: Open the Loanword trainer — FSRS flashcard review in the browser at localhost:4747. Use when the user asks to review vocabulary, practise, or open the trainer.
disable-model-invocation: false
allowed-tools: Bash, Read, Write
---

# /loanword:review — the trainer

One command: it serves the trainer and opens the browser itself. It exits by
itself if the port is already serving a trainer.

```bash
CLAUDE_PLUGIN_DATA="${CLAUDE_PLUGIN_DATA}" node "${CLAUDE_PLUGIN_ROOT}/scripts/serve.mjs"
```

Use `run_in_background: true` — the server has to stay up while the user works
through the deck. It closes itself after 30 minutes with no requests, so a
finished session never leaves the port held.

Say it in one line: opened http://localhost:4747 — `space` reveals the answer,
`1–4` grade, `esc` quits.

To close it before then:

```bash
CLAUDE_PLUGIN_DATA="${CLAUDE_PLUGIN_DATA}" node "${CLAUDE_PLUGIN_ROOT}/scripts/serve.mjs" stop
```

`LOANWORD_PORT` overrides the port, `--idle=<minutes>` the timeout (`0` disables
it), `--no-open` skips the browser. The server binds `127.0.0.1` only.

If there are no cards the UI says so itself. Do not check that up front and do
not run build unless asked.

## Interface language

The trainer renders in the user's **native** language when a dictionary exists.
Check once, after opening the browser — never before, and never twice in a
session:

```bash
CLAUDE_PLUGIN_DATA="${CLAUDE_PLUGIN_DATA}" node "${CLAUDE_PLUGIN_ROOT}/scripts/i18n.mjs" audit "$(CLAUDE_PLUGIN_DATA="${CLAUDE_PLUGIN_DATA}" node "${CLAUDE_PLUGIN_ROOT}/scripts/store.mjs" config | node -pe 'JSON.parse(require("fs").readFileSync(0)).native')"
```

- Clean, or the native language is `en`: say nothing.
- **No dictionary at all:** offer in one line — "the trainer is in English;
  want me to translate it into <language>? about a minute, nothing leaves the
  machine". Only if they say yes:
  1. `CLAUDE_PLUGIN_DATA="${CLAUDE_PLUGIN_DATA}" node "${CLAUDE_PLUGIN_ROOT}/scripts/i18n.mjs" keys` for the exact list,
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
