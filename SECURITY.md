# Security

## Reporting

Report privately through
[GitHub Security Advisories](https://github.com/MarcSky/loanword/security/advisories/new).
If that form is closed to you, open an issue saying only that you have a
security report — no details — and you will be given somewhere to send them.

Expect a first reply within a week.

## What counts here

The plugin reads what you type into Claude Code and writes it to disk. A bug
that widens either side of that is a vulnerability, not a defect:

- Text reaching `queue.<code>.jsonl`, `loanword.db` or `usage.jsonl` that
  `scripts/scrub.mjs` should have stripped — an API key, a token, a password.
- Code, a diff or tool output ending up in a card. Only prose is ever captured.
- The trainer answering on an interface other than `127.0.0.1` without
  `--host=lan`, or the `--host=lan` token being guessable or absent.
- A card, a deck export or a crash report leaving the machine.
- Anything the plugin executes that came from a captured phrase or a model
  reply rather than from this repository.

A card with a wrong definition is a bug. Open an issue.

## Supported

The latest tag. Older versions are not patched — the deck migrates forward.
