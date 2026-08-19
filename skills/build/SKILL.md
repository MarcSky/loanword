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

Read the effective settings — install-time answers plus anything the user later
changed in the trainer's Settings screen. Never read `CLAUDE_PLUGIN_OPTION_*`
directly; that misses every change made in the UI:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/store.mjs" config
```

Launch Task with `subagent_type: loanword:card-builder`. Pass in the prompt:

- the queue file path (printed by step 1),
- the line range for this batch,
- `NATIVE` = the `native` field,
- `TARGET` = the `target` field,
- `LIMIT` = the `dailyLimit` field,
- `LEVEL` = the `level` field (empty means no level filter).

The agent returns a JSON array of cards, each with a `category` from the six it
is given and a `cefr` level. It is read-only; writing the result is your job.

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

If an Obsidian vault is configured (`vault` in the config from step 2), mirror
the deck into it so it reaches the user's phone. Skip this silently when the
field is empty — it exits non-zero and says why, which is not an error worth
reporting when the feature is simply off:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/obsidian.mjs"
```

If `commit` fails to parse the JSON, do not repair it by hand and do not invent
cards. Tell the user the agent returned an invalid response and offer to retry.

## 4. Show the catch

Print 3–5 of the new cards straight into the chat, short and concrete:

> Today you wanted to say "revertir la migración" → **roll back the migration**
> Today you wanted to say "reconstruir el índice" → **rebuild the index**

Close with one line: how many cards were added in total, and that
`/loanword:review` opens the trainer. Mention the vault only if notes were
actually written there.

## Auto-build

The `SessionEnd` hook writes a `pending` file in the plugin data directory once
the queue holds ≥ 10 records and `auto_build` is on. If you see that file at the
start of a session, offer to run build — one line, no insisting. `commit`
removes the flag itself.
