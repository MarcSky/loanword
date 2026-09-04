# Loanword — the Claude Code plugin

Public repo, github.com/MarcSky/loanword. It captures the English you reach for
during a Claude Code session, turns it into flashcards, and schedules them with
FSRS. Everything stays on the machine.

## Layout

```
scripts/       every .mjs, and its .test.mjs beside it
  serve.mjs    the trainer's HTTP server and the CLI entry point
  db.mjs       SQLite, the numbered migration ladder, the only thing that opens loanword.db
  store.mjs    settings, the queues, commit, the known-word and front snapshots
  capture.mjs  the UserPromptSubmit hook — fast, append-only, never opens the db
  build.mjs    one build per target language, run in parallel
  clone.mjs    copies the concepts of one deck into another language
  session.mjs  the planner: warm-up, present-then-type, the flow channel
  languages.mjs the picker, re-exported from ui/languages.js
  lang.mjs     which script a text is in, and which of two languages
  lexis.mjs    the gate every returned card passes: word counts, scripts, definitions, the met form, the context, the IPA
  level.mjs    the learner's level — Elo over graded reviews, re-exported from ui/level.js
  stem.mjs     one stem per word, Snowball where there is one, a four-letter prefix otherwise
  stem-vendor.mjs generates scripts/vendor/snowball from the Snowball compiler; npm run stem
  tune.mjs     what to change about the next claude call when one fails, and what to remember
  vet.mjs      the same gate over an existing deck, with one repair call per twenty broken cards
  chapters.mjs chapters and topics, re-exported from ui/chapters.js
  speech.mjs   offline voices: Piper, say, eSpeak NG
  alphabet.mjs the letters of a script, for a starter deck
  peek.mjs     the card the hook prints while Claude works
  tidy.mjs     what is safe to delete from the data directory
  tokens.mjs   exports ui/app.css colours as design tokens
  icons.mjs    builds ui/icons.svg from Phosphor; edit MAP, run npm run icons
  vendor.mjs   copies the three Web Awesome components into ui/vendor/
ui/            the trainer: one page, vanilla JS, no build step
  languages.js, answer.js, quiz.js, plan.js, shell.js  pure logic, re-exported
               into scripts/ so the node tests reach it — one implementation, never two
  icons.svg    generated Phosphor sprite, never edited by hand
  vendor/      Web Awesome drawer, tooltip, select — generated, never edited
  sw.js        the service worker that caches the shell and the vendored chunks
data/freq/     one stop-list per language in the picker
data/cefr/     CEFR-graded English lemmas, the anchor for a word card's level
scripts/vendor/snowball/  generated Snowball stemmers, never edited by hand
skills/        start, stats, ticker — what /loanword:* invokes
agents/        card-builder, the brief scripts/build.mjs sends
hooks/         hooks.json
.claude-plugin/ plugin.json and marketplace.json — versions must match package.json
```

## Commands

```bash
npm ci
npm test              # everything
npm run test:perf     # 50k cards, 500k reviews, against the budget
npm run i18n          # dictionaries complete and well-formed
npm run tokens        # export the palette as design tokens
npm run icons         # regenerate ui/icons.svg from the Phosphor map
npm run vendor        # regenerate ui/vendor/webawesome from node_modules
npm run stem          # regenerate scripts/vendor/snowball from the Snowball compiler
node scripts/serve.mjs tidy            # what is safe to delete from the data directory
node scripts/serve.mjs vet [--apply]   # which cards break the lexis rules; --apply repairs them
node scripts/serve.mjs clone --from=en --to=ka
node scripts/serve.mjs speech --lang=ka
claude plugin validate . --strict
make push-with-new-tag text="what changed"
```

## Rules

- **No comments in source files.** A test carries the explanation instead; the
  docs test enforces this across `scripts/` and `ui/`.
- **English only** in code and documentation. `ui/i18n/*.json` and
  `data/freq/*.txt` are data, and exempt.
- Every `.mjs` has a `.test.mjs` next to it, and the docs test fails when one is
  missing. New behaviour arrives with its test.
- Logic the browser and the server both need lives once, in `ui/`, and is
  re-exported from `scripts/`. Never copy a function across that line.
- One runtime dependency, `ts-fsrs`. Adding a second is a decision, not a
  detail. Two dev dependencies feed generators: `@phosphor-icons/core` (the
  sprite) and `@awesome.me/webawesome` (three vendored components: drawer,
  tooltip, select). A fourth component is a decision, not a detail, and
  needs the same argument the first three had.
- Colours come from tokens in `ui/app.css`. Nothing hard-codes a hex value,
  and every `--wa-*` property maps to a token.
- **Everything lands on the grid — this is an acceptance rule, not a taste.**
  A new control lines up with what is already around it: the same spacing
  tokens, the same control height, the same left and right edge as the rows
  above and below. Reuse the component (`.segmented`, `.btn`, `.setting`,
  `.section-head`) instead of restyling one instance of it — a one-off height
  or an edge that misses the column by a few pixels fails acceptance. Check it
  in the browser, not in the source: open the screen and compare the edges.
- A change under `ui/` ships only with a bumped `CACHE` in `ui/sw.js`; the
  service worker serves the old files until that string changes.
- **The interface never says "failed to fetch".** Before a change is done,
  every screen and every path the browser calls is exercised, not just the one
  that was touched: `scripts/api.test.mjs` sweeps every `api(...)`/`fetch(...)`
  path found in `ui/` against a live server (a missing route fails, a 5xx
  fails, a business 404 is allowed), `scripts/screens.test.mjs` renders every
  screen against a DOM stub, and a live path missing from `LIVE` in `ui/sw.js`
  fails too. When the trainer is gone, `api()` shows the card that reconnects
  on its own — a raw browser error is never shown to the learner. After
  `npm test`, open the trainer on a copy of a real deck and click through
  Overview, Deck, Study, Practice, Analytics and Settings before reporting
  done.
- Icons are Phosphor, by name, through `scripts/icons.mjs`. Never paste an SVG.
- Capture must stay fast: the prompt hook appends to `queue.<code>.jsonl` and
  returns. It reads plain-text snapshots, never SQLite.
- A schema change is a numbered step in the ladder in `db.mjs`, never an edit to
  an existing one.
- Every SQL change ships with comprehensive tests: a new column or query gets
  tests for the migration from the previous version, the read path, the write
  path, and every endpoint that serves the rows. Run `npm test` before
  reporting done, and start the trainer on a copy of a real deck when the
  change touches `cards` or `fsrs_state`.
- Every language in `ui/languages.js` needs a stop-list in `data/freq/`; the
  tests refuse a picker entry without one.
- **Every input is validated where it lands.** Numbers pass `intIn` (refuse) or
  `clampInt` (pull into range) against a range in `ui/limits.js`, re-exported as
  `scripts/limits.mjs`; text is cut by `MAX_CHARS`; the same range fills the
  `min`/`max`/`maxlength` of the control, so the browser and the server cannot
  drift. `scripts/limits.test.mjs` holds the manifest to the same numbers. A
  value outside its range is refused, never stored.
- `plugin.json` and `package.json` versions are bumped together by the Makefile.
- **A failed model call is tuned, not repeated.** `scripts/tune.mjs` reads
  what the runner actually said — the reason is in the `result` event on
  stdout, not on stderr — and answers with one change: walk down the command
  line (`bare → lean → stream → plain`), wait once when the model is busy, or
  halve the batch when one call cost more than `MAX_CALL_USD`. `--bare` reads
  no login of its own — it wants `ANTHROPIC_API_KEY`, and answers a
  subscription with "Not logged in" — so the build only starts there when a
  key is in the environment, and drops to `lean` if it hears that anyway. What worked is
  remembered in `tuning.json` beside the deck, so the next build starts there;
  delete that file to make the trainer probe again. A build that still cannot
  run says why on the overview instead of silently putting the queue back.
- **The learner pays for every token.** The builder runs `claude -p` as a
  bare completion — `--tools ""`, `--setting-sources ""`,
  `--strict-mcp-config` with an empty `--mcp-config`,
  `--no-session-persistence`, `--max-turns 1`, the brief as
  `--system-prompt` — and every call logs its tokens and cost to
  `usage.jsonl`, which the trainer shows. Nothing is asked twice; only cards
  the gate marked go back for repair, in one call per batch; the filing pass
  runs on Haiku. Saving tokens never lowers a card: Sonnet writes them.
- **The learner's level is arithmetic, never a model call.** `ui/level.js`
  keeps one Elo estimate per deck from the graded reviews. Only a card's **first**
  graded answer is evidence (`reviews.was_new`) — a repeat is learning, not a
  level — no band is named before a hundred such answers, and the label is
  capped at the hardest band the deck has actually tested ten times. A floor
  set by hand always wins over the estimate, and the trainer never calls the
  estimate a certificate.
- **A card-quality rule is written once and implemented twice**, in
  `agents/card-builder.md` (the brief the builder sends) and in
  `scripts/lexis.mjs` (the gate every returned card passes), each with its
  test. The brief and the gate must never disagree.
