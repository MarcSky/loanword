# Loanword

![loancard](images/2.jpg)

A Claude Code plugin that turns your work sessions into a personal phrasebook.
You write prompts in your own language; Loanword shows how a native speaker
would have said it, and builds flashcards from the words you actually needed
today.

No API keys: the cards are built by a subagent on your own subscription.

---

## Privacy first

- Everything stays local, in the plugin data directory
  (`~/.claude/plugins/data/loanword*`). No servers, no telemetry, no accounts.
- **One exception, and it is yours to switch on:** if you point Loanword at an
  Obsidian vault, the deck is written there as markdown, and whatever syncs that
  vault — iCloud, Dropbox, Obsidian Sync — carries your vocabulary and the
  project names off this machine. Secrets are still scrubbed before the write,
  but that is a real change of blast radius. The field is empty by default and
  nothing is written until you fill it in.
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
/plugin marketplace add MarcSky/loanword
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

`/loanword:review` opens a four-screen local app at `localhost:4747` —
**Overview**, **Deck**, **Study**, **Settings** — served straight off disk with
no build step, no framework and no network access of any kind.

It is a notebook, not a course. There is no streak to protect, no daily goal
ring and no activity graph; the numbers that matter live in `/loanword:stats`
when you actually want them.

**Overview** shows what is due and where your words live. Every card belongs to
one of six domains, each with its own colour and mastery ring:

| Domain | What lands there |
|---|---|
| Engineering | Code, systems, debugging, review |
| Process | Plans, estimates, releases, specs |
| Collaboration | Meetings, feedback, asking, disagreeing |
| Phrasing | Set phrases and idioms that resist translation |
| Connectors | However, in terms of, that said, provided that |
| Everyday | General vocabulary, and anything the builder could not place |

Alongside the domain, every card carries a CEFR level from **A1 to C2**. The
level pills on the Overview re-scope the whole screen, and picking a domain
opens its words as a list you can read straight through.

**Deck** is the same words with search, filters and two views: a **list**
grouped by domain — one line per word, made for reading — and a card grid. Star
anything worth keeping and the **Favourites** filter brings it back. Stars are
stored beside the schedule and never touch it.

**Study** has two modes, and both write to the same FSRS schedule:

- **Flashcards** — recall it yourself, then grade honestly. `space` reveals,
  `1 2 3 4` are Again / Hard / Good / Easy, `d` throws the card away as junk.
- **Learn** — four candidates drawn from the same domain and the same
  translation direction. One click grades the card for you: right and fast is
  Easy, right and slow is Good, wrong is Again. Faster for words you have never
  met, which is where a blank recall prompt only wastes a rep.

The session bar keeps a running *known / still learning* tally, and the session
ends on a summary rather than dumping you back at the start.

Keyboard everywhere: `1`–`4` jump between screens, `/` searches the deck, `t`
switches theme, `?` lists every shortcut, `esc` leaves a session.

The interface language is its own setting under **Settings → Languages**,
independent of the pair you are learning: changing your target language never
changes it. The list holds exactly the languages a dictionary exists for, and
starts on your native one. Russian ships in the box, and `/loanword:review`
offers once to translate the rest on your own subscription. Arabic, Hebrew, Persian and Urdu
flip the whole layout to right-to-left. See
[`ui/i18n/README.md`](ui/i18n/README.md).

The illustration slots ship empty on purpose. Each `<img>` carries its own
generation prompt in `alt`, and [`ui/art/README.md`](ui/art/README.md) is the
manifest — drop a file with the right name into `ui/art/` and it appears.

### Reading it on your phone

Point Loanword at an Obsidian vault and `/loanword:build` mirrors the deck into
`<vault>/Loanword/`, one note per card plus an index. Your vault's own sync gets
it to the phone — **there is no Obsidian plugin to install**, because a vault is
just a directory of markdown.

```
Loanword/
  Loanword.md          progress, per-domain and per-level tables, what is due, the hardest words
  ru-en/
    bottleneck.md      one note per card
```

Each note carries Obsidian properties — `category`, `cefr`, `mastery`, `due`,
`status`, `project`, `captured` — and nested tags (`#loanword/engineering`,
`#loanword/b2`), so the vault is searchable and sortable on the phone without
any community plugin.

It is a **read-only mirror**: grading still happens in the trainer, on your
machine, against FSRS. Notes are rewritten only when their content actually
changes, so re-exporting an untouched deck writes nothing and your sync stays
quiet. A card you throw away as junk has its note removed; nothing outside
`<vault>/Loanword/` is ever touched.

Set the path under **Settings → Your data → Read it on your phone**, at install
time as `obsidian_vault`, or run it by hand:

```
node scripts/obsidian.mjs /path/to/Vault
```

### One deck per language pair

Changing your target language does not touch the cards you already have. Each
`native → target` pair is its own deck: the cards keep the pair they were built
with and the FSRS schedule they earned, and switching simply opens a different
one. Learn `en`, `pl` and `es` side by side, and switch between them from the
chip row in Settings.

Cards written before this existed are pinned to whichever pair was open the
first time you switched, so nothing is orphaned and nothing is rewritten.
Known-word lists are per target language too — meeting a word in English says
nothing about Polish.

## Settings

Everything below can be set at install time **and** changed later from the
trainer's Settings screen, which writes `settings.json` into the plugin data
directory. The stored value wins over the install-time answer, and both the
trainer and the capture hooks read the merged result — so switching your target
language in the browser changes what gets captured in the next session.

| Option | Default | Meaning |
|---|---|---|
| `native_lang` | `es` | The language you write prompts in |
| `target_lang` | `en` | The language you are learning |
| `mode` | `both` | `active` — your prompts only; `passive` — words from assistant replies only |
| `daily_limit` | `15` | New cards per day (reviews are not capped) |
| `auto_build` | `true` | Offer to build at the end of a session |
| `level` | — | `A1`…`C2`: words below this level never become cards |
| `obsidian_vault` | — | Path to an Obsidian vault. Empty means nothing is written |
| theme | `system` | Light, dark, or follow the system. Trainer only |
| interface language | your native one | Which dictionary the UI renders in. Trainer only |
| default mode | `flashcards` | Which study mode a session opens in. Trainer only |

```
node scripts/store.mjs config    # the effective settings, env plus settings.json
```

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

Tags look like `loanword lang:en from:es cefr:B1 cat:process project:api-server`,
so you can build a subdeck per project, per domain, per level, or per language
pair. The export covers every deck; `GET /export.csv?deck=current` narrows it to
the pair you have open.

`.apkg` with the FSRS schedule preserved is v0.2.

## Your own frequency list

Words from the frequency list never become cards. Only English ships with one:
[`data/freq/en.txt`](data/freq/en.txt). For another target language, drop
`<code>.txt` next to it, one word per line. No file simply means no filter.

## Development

```
npm ci
npm test
node scripts/i18n.mjs audit          # dictionaries complete and well-formed
node scripts/obsidian.mjs ~/Vault    # mirror the deck into an Obsidian vault
claude plugin validate . --strict
```

See [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request.

Storage is JSONL. That is a deliberate choice up to ~50k cards: 10 000 cards is
about 2.5 MB, a full read is 10–30 ms, and the hooks never open the card file at
all. Moving to SQLite is a v0.3 decision, triggered by file size.

### The trainer's assets

Both are vendored, because the UI must work with the network unplugged:

- [Lucide](https://lucide.dev) icons (ISC) — `ui/icons.svg` holds only the
  symbols this UI actually uses. Rebuild it from `lucide-static` if you add one.
- [General Sans](https://fontshare.com/fonts/general-sans) by Indian Type
  Foundry (ITF Free Font License, bundled as `ui/fonts/GeneralSans-FFL.txt`) —
  one variable file, one family for the whole interface.

## Contact

Built by **[@levan_fewnix](https://x.com/levan_fewnix)** on X — bugs, ideas, or
a word the card-builder mangled, that is the fastest way to reach me. The
trainer carries the same link under Settings → Loanword.

MIT.
