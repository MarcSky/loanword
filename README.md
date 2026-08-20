# Loanword

![loancard](images/2.jpg)

A Claude Code plugin that turns your work sessions into a personal phrasebook.
You write prompts in your own language; Loanword shows how a native speaker
would have said it, and builds flashcards from the words you actually needed.

No API keys — cards are built by a subagent on your own subscription.

## Privacy

- Everything stays local, in `~/.claude/plugins/data/loanword*`. No servers, no
  telemetry, no accounts. The review server binds `127.0.0.1` only.
- Code, diffs and tool output are never captured. From assistant replies only
  candidate words are stored, never the sentence.
- Secrets are stripped before the write, not before the model call — rules in
  [`scripts/scrub.mjs`](scripts/scrub.mjs) (cloud/API keys, JWTs, PEM blocks,
  `TOKEN=…`, emails, IPs, absolute paths, hex digests, high-entropy blobs).
  Removed text leaves a `▮`.
- One scrubbed batch of phrases goes to the same Claude you already work with.
- **Exception you switch on:** an Obsidian vault path makes the deck leave this
  machine via whatever syncs that vault. Empty by default.

Found a leak in `queue.jsonl`? That is a P0 — open an issue.

## Install

```
/plugin marketplace add MarcSky/loanword
/plugin install loanword
```

It asks for your native language, target language, and capture mode. Claude Code
installs the only dependency (`ts-fsrs`); nothing needs native compilation.

## Using it

Work as usual; hooks collect material. When you want cards:

| Command | What it does |
|---|---|
| `/loanword:build` | Builds cards from the queue |
| `/loanword:review` | Opens the trainer at `localhost:4747` |
| `/loanword:stats` | Progress: learned, streak, hardest words |

With `auto_build` on, Claude offers to build at the end of any session with 10+
records.

### The trainer

Four screens — Overview, Deck, Study, Settings — served off disk, no build step,
no framework, no network.

Every card has a CEFR level (A1–C2) and one of six domains:

| Domain | What lands there |
|---|---|
| Engineering | Code, systems, debugging, review |
| Process | Plans, estimates, releases, specs |
| Collaboration | Meetings, feedback, asking, disagreeing |
| Phrasing | Set phrases and idioms that resist translation |
| Connectors | However, in terms of, that said, provided that |
| Everyday | General vocabulary, and anything unplaceable |

**Overview** — what is due, per-domain mastery rings, level pills that re-scope
the screen. **Deck** — search, filters, list or grid, stars (stored beside the
schedule, never touching it).

**Study** has two modes, both writing to the same FSRS schedule:

- **Flashcards** — `space` reveals, `1 2 3 4` are Again / Hard / Good / Easy,
  `d` discards the card as junk.
- **Learn** — four candidates from the same domain and direction; one click
  grades (right and fast = Easy, right and slow = Good, wrong = Again). Better
  for words you have never met.

Keyboard: `1`–`4` switch screens, `/` searches, `t` toggles theme, `?` lists
shortcuts, `esc` leaves a session.

Interface language is a separate setting from the pair you are learning. Russian
ships in the box; `/loanword:review` offers once to translate the rest on your
subscription. Arabic, Hebrew, Persian and Urdu flip the layout to RTL. See
[`ui/i18n/README.md`](ui/i18n/README.md).

Illustration slots ship empty; each `<img>` carries its generation prompt in
`alt` and [`ui/art/README.md`](ui/art/README.md) is the manifest — drop a file
with the right name into `ui/art/`.

### Reading it on your phone

With an Obsidian vault configured, `/loanword:build` mirrors the deck into
`<vault>/Loanword/` — one note per card plus an index. Your vault's sync gets it
to the phone; there is no Obsidian plugin to install.

```
Loanword/
  Loanword.md          progress, per-domain and per-level tables, due, hardest words
  ru-en/
    bottleneck.md      one note per card
```

Notes carry properties (`category`, `cefr`, `mastery`, `due`, `status`,
`project`, `captured`) and nested tags (`#loanword/engineering`, `#loanword/b2`).

Read-only mirror: grading happens in the trainer against FSRS. Unchanged notes
are not rewritten, discarded cards have their note removed, and nothing outside
`<vault>/Loanword/` is touched.

Set it under **Settings → Your data**, at install time as `obsidian_vault`, or:

```
node scripts/obsidian.mjs /path/to/Vault
```

### One deck per language pair

Each `native → target` pair is its own deck with its own FSRS schedule; changing
target language opens a different deck rather than touching existing cards.
Switch from the chip row in Settings. Known-word lists are per target language.

Cards written before this existed are pinned to whichever pair was open the
first time you switched.

## Settings

Set at install time and changeable from the trainer's Settings screen, which
writes `settings.json` into the plugin data directory. The stored value wins;
both the trainer and the capture hooks read the merged result.

| Option | Default | Meaning |
|---|---|---|
| `native_lang` | `es` | The language you write prompts in |
| `target_lang` | `en` | The language you are learning |
| `mode` | `both` | `active` — your prompts only; `passive` — assistant replies only |
| `daily_limit` | `15` | New cards per day (reviews are not capped) |
| `auto_build` | `true` | Offer to build at the end of a session |
| `level` | — | `A1`…`C2`: words below this level never become cards |
| `obsidian_vault` | — | Path to an Obsidian vault. Empty means nothing is written |
| theme | `system` | Trainer only |
| interface language | your native one | Trainer only |
| default mode | `flashcards` | Which study mode a session opens in. Trainer only |

```
node scripts/store.mjs config    # effective settings, env plus settings.json
```

Language detection is local, no model call: different alphabets by alphabet,
same-alphabet pairs by a function-word vote (`en`, `es`, `pt`, `fr`, `it`, `de`,
`nl`, `pl` — add yours in [`scripts/lang.mjs`](scripts/lang.mjs)).

## Turning it off for client repositories

Use Claude Code's own mechanisms: install at `user` scope and
`claude plugin disable loanword` where it does not belong; or install at
`project` scope; or use `mode: active` so only your own wording is captured.

## Anki export

`/loanword:build` and `GET /export.csv` write `export/loanword.csv` into the
plugin data directory.

1. Anki → **File → Import**
2. Field separator: semicolon `;`
3. Fields in order: `front`, `back`, `example`, `tags`
4. Leave **Allow HTML in fields** off, treat the first line as a header

Tags look like `loanword lang:en from:es cefr:B1 cat:process project:api-server`.
The export covers every deck; `GET /export.csv?deck=current` narrows it to the
open pair.

`.apkg` with the FSRS schedule preserved is v0.2.

## Your own frequency list

Words from the frequency list never become cards. Only English ships with one:
[`data/freq/en.txt`](data/freq/en.txt). Drop `<code>.txt` next to it, one word
per line. No file means no filter.

## Development

```
npm ci
npm test
node scripts/i18n.mjs audit          # dictionaries complete and well-formed
node scripts/obsidian.mjs ~/Vault    # mirror the deck into an Obsidian vault
claude plugin validate . --strict
```

See [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request.

Storage is JSONL, deliberate up to ~50k cards: 10 000 cards is ~2.5 MB, a full
read is 10–30 ms, and the hooks never open the card file. SQLite is a v0.3
decision triggered by file size.

Assets are vendored so the UI works offline:

- [Lucide](https://lucide.dev) icons (ISC) — `ui/icons.svg` holds only the
  symbols used. Rebuild from `lucide-static` if you add one.
- [General Sans](https://fontshare.com/fonts/general-sans) by Indian Type
  Foundry (ITF Free Font License, `ui/fonts/GeneralSans-FFL.txt`).

## Contact

Built by **[@levan_fewnix](https://x.com/levan_fewnix)** on X. The trainer
carries the same link under Settings → Loanword.

MIT.
