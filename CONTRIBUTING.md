# Contributing to Loanword

## Before you open a pull request

```bash
npm ci
npm test
claude plugin validate . --strict
```

All three must pass. A PR that does not is a draft.

## Scope

**One PR, one change.** A bug fix, a feature, or a refactor — never two of them
in the same diff. If a change needs a refactor first, that refactor is its own
PR.

Keep the diff as small as the change allows. Reviewers approve what they can
hold in their head; a 40-line PR gets read, a 400-line PR gets skimmed.

Unrelated fixes you noticed along the way belong in an issue, not in this diff.

## The privacy rules are not negotiable

These are the reason the plugin is installable at all. A PR that weakens any of
them will be closed regardless of what else it does.

1. **Scrubbing happens before the write, not before the model call.** Anything
   that reaches `queue.jsonl` is already redacted. Never reorder this.
2. **Code, diffs and tool output are never captured.** If you add a new capture
   source, it goes through `stripCode` and `scrub` first.
3. **Assistant text is stored as word candidates only** — never the sentence.
   Examples on cards are generated fresh by the agent.
4. **No network calls.** The only thing that ever leaves the machine is the
   batch handed to the user's own Claude subscription. No telemetry, no
   analytics, no third-party endpoints, no "anonymous" usage pings.
5. **The review server binds `127.0.0.1`.** Never `0.0.0.0`.
6. **`card-builder` stays read-only** (`tools: Read`). Writes are done by
   `store.mjs`, so a bad model response cannot damage the deck.

Adding a scrub rule? Add fixtures to `scrub.test.mjs` in the same PR: one that
proves the secret is masked, and one ordinary work phrase that proves the rule
did not start eating vocabulary.

## Code

- Node's standard library first, then an already-installed dependency, then a
  few lines of your own. A new dependency needs a sentence in the PR body
  explaining what it does that a few lines cannot.
- No native-compilation dependencies, ever. Claude Code installs plugins with
  `npm ci --ignore-scripts`, so they would silently fail to build.
- Names say what the thing is. `state`, not `st`. `csvField`, not `field`.
- Comments explain *why*, never *what*. If the code needs a comment to say what
  it does, rename things instead.
- A deliberate shortcut gets a `ponytail:` comment naming its ceiling and the
  upgrade path.
- Every exported function is used or tested. Dead code is deleted, not kept
  "for later".

## Robustness

The hook runs inside someone's real work session, so:

- **`capture.mjs` always exits 0.** Every failure path goes to `log.txt`.
- **Every input is untrusted**: hook events, transcripts, agent replies, HTTP
  bodies, and the plugin's own data files after a crash. Validate types, cap
  lengths, skip corrupt records instead of throwing.
- **Everything unbounded gets a cap**: request bodies, transcript size, queue
  size, words per session, field length. Add the constant next to its use and
  test the limit.
- **No unbounded growth**: buffers are released on the error path, files are not
  read whole when a size check will do, and the parsed deck is reused while its
  file is untouched.
- **Writes that matter are atomic.** `state.json` is rewritten on every grade;
  use `writeJson`, never `writeFileSync` directly.

## Tests

`node --test`, no framework, no fixtures directory, no mocks.

- Every new behaviour gets a test in the matching `scripts/<module>.test.mjs`.
- Test through the public surface: call the exported function, or drive the real
  script over stdin/HTTP the way the plugin does.
- Cover the failure path, not only the happy one: malformed input, missing file,
  wrong type, empty batch, past the cap.
- Tests write to their own `mkdtempSync` directory and never touch the user's
  real plugin data.
- A test that only restates the implementation is not worth the maintenance.

## Commits and PR body

- Imperative subject, under 72 characters: `cap request bodies at 64KB`.
- The body answers *why*, and names anything a reviewer could not guess.
- State explicitly if behaviour, stored data format, or a default changed.
- Rebase on `main`; no merge commits.

## Changing the stored format

`cards.jsonl`, `state.json` and `known_words.json` live on users' machines and
are never migrated automatically. A format change must keep reading the old
shape, or ship the migration in the same PR. Say so in the PR body.
