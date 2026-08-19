# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

One user: a working developer who ships in a second language. They write Claude
Code prompts in their native language (or in broken target-language), and the
words they *needed* during that session are the words worth learning. They are
not studying at a desk with a textbook — they are between tasks, on the same
machine they just wrote code on, and they will give the trainer five to fifteen
minutes at a time.

Secondary: nobody. There is no teacher role, no class, no shared deck, no
account. The trainer binds to `127.0.0.1` and serves exactly one person.

## Product Purpose

Turn real work sessions into a personal phrasebook, then get those words into
long-term memory. Success is a word the user reached for at work last month
arriving unprompted this month. Failure is a deck full of vocabulary the user
never actually needed.

## Positioning

Every other vocabulary product hands you someone else's deck — Duolingo's
curriculum, a Quizlet set, a frequency list. Loanword has no curriculum at all.
The deck is generated from what the user personally failed to say, captured by
hooks during work they were doing anyway. Nobody else can ship this deck,
because the corpus is the user's own session history.

Second mechanism: the cards are built by a subagent on the user's existing
Claude subscription. No API key, no vendor, no account.

## Operating Context

- Capture is passive: `hooks/hooks.json` scrubs and queues phrases while the
  user works. The user never opens a "add a word" form.
- `/loanword:build` runs a subagent that turns the queue into cards.
- `/loanword:review` starts `scripts/serve.mjs` and opens `localhost:4747`.
- `/loanword:stats` prints progress in the terminal.
- Data lives in `~/.claude/plugins/data/loanword/` as JSONL + JSON. No server,
  no telemetry, no accounts. Everything offline — the UI may not fetch a font,
  an icon, or a script from any CDN.
- Typical session: a browser tab opened next to a terminal, daylight, desktop
  monitor, five to fifteen minutes, keyboard already under the hands.

## Capabilities and Constraints

Confirmed and shipping:

- FSRS scheduling via `ts-fsrs` (Again / Hard / Good / Easy → real intervals).
- Card fields: `type` (`word` | `phrase`), `front`, `back`, `keywords[]`,
  `example`, `pos`, `cefr`, `ts`, `project`. Ids are content hashes.
- Daily new-card limit; reviews are never capped.
- Streak, per-day review counts, learned count (FSRS stability ≥ 21 days),
  hardest cards by lapses.
- CSV export for Anki.
- Junk deletion with a logged reason (feeds a junk-rate metric).

Added by this work:

- `category` on every card, from a fixed taxonomy of six work-life domains:
  `engineering`, `process`, `collaboration`, `phrasing`, `connectors`,
  `everyday`. Cards the builder cannot place fall back to `everyday`.
- CEFR is promoted from a free string to the constrained set A1…C2.
- Settings are editable from the web UI (languages included) and persist to
  `settings.json` in the data directory, overriding the plugin's env config.
- A second study mode, **Learn** (four-choice recognition), alongside
  Flashcards. Both write to the same FSRS state.

Constraints:

- Node's standard library plus `ts-fsrs`. No build step, no bundler, no
  framework — `serve.mjs` reads files off disk and sends them.
- The whole UI must work with zero network access.
- Nothing may leave the machine.

## Brand Commitments

- Name: **Loanword**. A loanword is a word one language borrowed from another
  and kept — the product's whole thesis in one noun.
- Contact: X / Twitter **@levan_fewnix**, present in the web UI and README.
- Visual world is user-pinned to reference `1.jpg`: warm pastel on a mint
  canvas, tight geometric grotesque display type, pill filters, black as the
  selected state. Not the vivid-blue Duolingo register of `2.jpg`.
- Privacy-first is a stated promise, not a feature: the README's privacy
  section is load-bearing and must stay true.

## Evidence on Hand

- Real: the codebase, the FSRS state format, the CSV export, the hook pipeline.
- Synthetic: every word, translation, example sentence, category count, streak
  number, and chart bar in the UI's demo state is authored placeholder data,
  labeled as such where a viewer could mistake it for real progress.
- Absent and not to be invented: user counts, testimonials, benchmarks,
  pricing, any claim about retention rates.
- Imagery: none exists yet. Every `<img>` in the UI ships as an empty frame
  carrying its generation prompt in `alt`; the manifest is `ui/art/README.md`.

## Product Principles

1. **The deck is earned, never assigned.** Nothing enters it that the user did
   not personally need.
2. **The keyboard is the primary input.** Every review action has a key; the
   mouse is a fallback, not the path.
3. **Local means local.** No fetch leaves the machine, including for fonts and
   icons.
4. **Progress must be legible in one glance.** The user is between tasks; if
   they cannot see where they stand in two seconds, the screen failed.
5. **Capture stays invisible.** Any feature that asks the user to maintain the
   deck by hand contradicts the product.

## Accessibility & Inclusion

- Full keyboard operation, visible focus, and no action reachable only by
  pointer.
- Text carries meaning; color never carries it alone (category and CEFR always
  ship a label or icon beside the tint).
- `prefers-reduced-motion` respected.
- Both a light and a dark rendition of the same world — the user may be
  reviewing at 23:00 next to a dark editor.
