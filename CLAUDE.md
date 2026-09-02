# Loanword — the Claude Code plugin

Public repo, github.com/MarcSky/loanword. It captures the English you reach for
during a Claude Code session, turns it into flashcards, and schedules them with
FSRS. Everything stays on the machine.

The landing page at loanwords.com is a separate, private repository; the shared
design notes live in `../docs`, outside this repo.

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
  speech.mjs   offline voices: Piper, say, eSpeak NG
  alphabet.mjs the letters of a script, for a starter deck
  peek.mjs     the card the hook prints while Claude works
  tidy.mjs     what is safe to delete from the data directory
  tokens.mjs   exports ui/app.css colours to ../docs/design/tokens.json
  icons.mjs    builds ui/icons.svg from Phosphor; edit MAP, run npm run icons
  vendor.mjs   copies the three Web Awesome components into ui/vendor/
ui/            the trainer: one page, vanilla JS, no build step
  languages.js, answer.js, quiz.js, plan.js, shell.js  pure logic, re-exported
               into scripts/ so the node tests reach it — one implementation, never two
  icons.svg    generated Phosphor sprite, never edited by hand
  vendor/      Web Awesome drawer, tooltip, select — generated, never edited
  sw.js        the service worker that caches the shell and the vendored chunks
data/freq/     one stop-list per language in the picker
skills/        review, stats — what /loanword:* invokes
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
npm run tokens        # export the palette to ../docs/design/tokens.json
npm run icons         # regenerate ui/icons.svg from the Phosphor map
npm run vendor        # regenerate ui/vendor/webawesome from node_modules
node scripts/serve.mjs tidy            # what is safe to delete from the data directory
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
  tooltip, select). A fourth component goes through the table in
  `../DESIGN.md` §5.1.
- Colours come from tokens in `ui/app.css`. Nothing hard-codes a hex value,
  and every `--wa-*` property maps to a token.
- Icons are Phosphor, by name, through `scripts/icons.mjs`. Never paste an SVG.
- Capture must stay fast: the prompt hook appends to `queue.<code>.jsonl` and
  returns. It reads plain-text snapshots, never SQLite.
- A schema change is a numbered step in the ladder in `db.mjs`, never an edit to
  an existing one.
- Every language in `ui/languages.js` needs a stop-list in `data/freq/`; the
  tests refuse a picker entry without one.
- `plugin.json` and `package.json` versions are bumped together by the Makefile.
