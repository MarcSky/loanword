---
name: ticker
description: Show one Loanword card at a time in the Claude Code status line — the weakest words of the open deck, a new one every few seconds. Use when the user asks for words in the status line, a vocabulary ticker, or to turn it off.
disable-model-invocation: false
allowed-tools: Bash, Read, Edit
---

# /loanword:ticker — a card in the status line

Claude Code's status line re-runs a command every `refreshInterval` seconds and
prints its first line under the prompt. Loanword has a command that prints one
card from the open deck's snapshot — weakest first, cycling on a fixed clock,
never opening the database:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/peek.mjs" --line --interval=10
```

It prints `Loanword · front — back · reading · 63%` (or `· new`, `· leech`),
or an empty line when there is nothing to show. `--pick=` narrows it like the
peek setting (`starred,slipping,B2`).

## Turning it on

1. Resolve `${CLAUDE_PLUGIN_ROOT}` to an absolute path now — `settings.json`
   does not substitute variables.
2. Read `~/.claude/settings.json` (create `{}` if missing). Ask the user once,
   in one line, before writing to it.
3. Merge — never overwrite other keys:

```json
"statusLine": {
  "type": "command",
  "command": "node <absolute plugin root>/scripts/peek.mjs --line --interval=10",
  "refreshInterval": 10
}
```

If a `statusLine.command` already exists, offer to chain it instead of
replacing it, and remember the previous command in `statusLine.loanwordPrevious`:

```json
"command": "<existing command> | tr -d '\n'; printf ' · '; node <absolute plugin root>/scripts/peek.mjs --line --interval=10"
```

`/loanword:ticker 30` uses 30 seconds for both `--interval` and
`refreshInterval` (the minimum Claude Code accepts is 1).

## Turning it off

`/loanword:ticker off` removes the `statusLine` key Loanword added. If
`loanwordPrevious` is present, restore that command instead of removing the
key. Say in one line what was restored.

Nothing here spends a model call: the line comes from the snapshot the trainer
already writes after every commit.
