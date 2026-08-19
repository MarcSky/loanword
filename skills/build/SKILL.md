---
name: build
description: Enrich the Loanword capture queue and turn it into flashcards. Use when the user asks to build cards, or at the end of a session when the pending flag exists.
disable-model-invocation: false
allowed-tools: Bash, Read, Task
---

# /loanword:build — build cards from the queue

## 1. Check the queue

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/store.mjs" queue
```

If `entries` is 0, say the queue is empty and **stop the skill**. Launch nothing.

## 2. Run card-builder

Read the queue and count the records. Above 60, split into batches of 60 and
make several Task calls in a row, collecting the cards into one list.

Launch Task with `subagent_type: loanword:card-builder`. Pass in the prompt:

- the queue file path (printed by step 1),
- the line range for this batch,
- `NATIVE` = `$CLAUDE_PLUGIN_OPTION_NATIVE_LANG` (default `es`),
- `TARGET` = `$CLAUDE_PLUGIN_OPTION_TARGET_LANG` (default `en`),
- `LIMIT` = `$CLAUDE_PLUGIN_OPTION_DAILY_LIMIT` (default `15`),
- `LEVEL` = `$CLAUDE_PLUGIN_OPTION_LEVEL` (empty means no level filter).

The agent returns a JSON array of cards. It is read-only; writing the result is
your job.

## 3. Write the result

Pipe the agent's JSON into `commit`. It appends to `cards.jsonl`, stamps
provenance, extends `known_words.json` and clears the queue:

```bash
printf '%s' '<JSON array from the agent>' | node "${CLAUDE_PLUGIN_ROOT}/scripts/store.mjs" commit
```

Then refresh the CSV export:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/export-anki.mjs"
```

If `commit` fails to parse the JSON, do not repair it by hand and do not invent
cards. Tell the user the agent returned an invalid response and offer to retry.

## 4. Show the catch

Print 3–5 of the new cards straight into the chat, short and concrete:

> Today you wanted to say "revertir la migración" → **roll back the migration**
> Today you wanted to say "reconstruir el índice" → **rebuild the index**

Close with one line: how many cards were added in total, and that
`/loanword:review` opens the trainer.

## Auto-build

The `SessionEnd` hook writes a `pending` file in the plugin data directory once
the queue holds ≥ 10 records and `auto_build` is on. If you see that file at the
start of a session, offer to run build — one line, no insisting. `commit`
removes the flag itself.
