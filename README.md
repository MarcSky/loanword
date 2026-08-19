# Loanword

A Claude Code plugin that turns your work sessions into a personal phrasebook.
You write prompts in your own language; Loanword shows how a native speaker
would have said it, and builds flashcards from the words you actually needed
today.

No API keys: the cards are built by a subagent on your own subscription.

---

## Privacy first

- Everything stays local, in the plugin data directory
  (`~/.claude/plugins/data/loanword*`). No servers, no telemetry, no accounts.
- **Secrets are stripped before the write, not before the model call.** The
  rules are open in [`scripts/scrub.mjs`](scripts/scrub.mjs): AWS / OpenAI /
  GitHub / Slack / Google / GitLab keys, JWTs, PEM blocks, `TOKEN=…` and
  `password:` pairs, emails, IPs, absolute paths, hex digests, and anything that
  looks like a high-entropy blob. What is removed leaves a `▮` behind.
- **Code, diffs and tool output are never captured at all** — not into the
  queue, not into the model.
- From assistant replies only a list of candidate words is stored, never the
  sentence they came from. The example on a card is written fresh by the agent.
- One scrubbed batch of phrases goes out, to the same Claude you are already
  working with. There is no third-party provider.
- The review server binds `127.0.0.1` only.

Found a leak in `queue.jsonl`? That is a P0 — open an issue.

## Install

```
/plugin marketplace add swiftcoder/loanword
/plugin install loanword
```

It asks for your native language, the language you are learning, and a capture
mode. Claude Code installs the dependency (`ts-fsrs`) itself — the repository
ships a `package-lock.json`, and nothing here needs native compilation.

## Using it

You don't. Work as usual; the hooks quietly collect material.

When you want cards:

| Command | What it does |
|---|---|
| `/loanword:build` | Builds cards from the queue that has piled up |
| `/loanword:review` | Opens the trainer at `localhost:4747` |
| `/loanword:stats` | Progress: learned, streak, hardest words |

With `auto_build` on, Claude offers to build at the end of any session that
collected 10 or more records.

### The trainer

One card per screen, keyboard only:

```
space    show the answer
1 2 3 4  Again / Hard / Good / Easy  (FSRS)
d        throw the card away as junk
esc      quit
```

## Settings

| Option | Default | Meaning |
|---|---|---|
| `native_lang` | `es` | The language you write prompts in |
| `target_lang` | `en` | The language you are learning |
| `mode` | `both` | `active` — your prompts only; `passive` — words from assistant replies only |
| `daily_limit` | `15` | New cards per day (reviews are not capped) |
| `auto_build` | `true` | Offer to build at the end of a session |
| `level` | — | `A2`/`B1`/`B2`/`C1`: words below this level never become cards |

Loanword tells your two languages apart locally, with no model call. Different
alphabets are settled by the alphabet; same-alphabet pairs such as `es` → `en`
are settled by a vote on function words. Supported for that vote: `en`, `es`,
`pt`, `fr`, `it`, `de`, `nl`, `pl` — see
[`scripts/lang.mjs`](scripts/lang.mjs) to add yours.

## Turning it off for client repositories

Loanword does not invent its own per-project allow/deny list. Claude Code
already has the mechanisms:

- install it at `user` scope and disable it where it does not belong:
  `claude plugin disable loanword`;
- or install at `project` scope, only where you want to study;
- or use `mode: active`, so nothing from anyone else's code is captured at all —
  only your own wording.

## Anki export

`/loanword:build` and `GET /export.csv` write `export/loanword.csv` into the
plugin data directory.

1. Anki → **File → Import**
2. Field separator: semicolon `;`
3. Fields in order: `front`, `back`, `example`, `tags`
4. Leave **Allow HTML in fields** off, and treat the first line as a header

Tags look like `loanword lang:en cefr:B1 project:api-server`, so you can build a
subdeck per project.

`.apkg` with the FSRS schedule preserved is v0.2.

## Your own frequency list

Words from the frequency list never become cards. Only English ships with one:
[`data/freq/en.txt`](data/freq/en.txt). For another target language, drop
`<code>.txt` next to it, one word per line. No file simply means no filter.

## Development

```
npm ci
npm test
claude plugin validate . --strict
```

See [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request.

Storage is JSONL. That is a deliberate choice up to ~50k cards: 10 000 cards is
about 2.5 MB, a full read is 10–30 ms, and the hooks never open the card file at
all. Moving to SQLite is a v0.3 decision, triggered by file size.

MIT.
