# Stop-lists

One file per language in the picker, named by its two-letter code. Each holds the
forms that must never become a flashcard: articles, pronouns, prepositions and
postpositions, conjunctions, auxiliaries and copulas, the commonest adverbs and
quantifiers, question words, and the everyday verbs and nouns a learner owns
before they ever open this trainer.

## Format

One form per line. Lowercase, no digits, no duplicates, sorted. The file is read
verbatim into a `Set` by `frequentWords()` in `scripts/store.mjs`; the passive
capture hook drops any candidate word that is in it, and `commit()` refuses a
word card whose front is in it.

For the character scripts (`zh`, `ja`, `ko`, `th`) the entries are the most
frequent characters, particles and grammatical words rather than lemmas, because
those languages are not written with spaces between words and the builder, not
the hook, picks the vocabulary out of a sentence.

## Where these came from

These lists were written by hand for this repository, language by language, from
the categories above. They are **not** a copy of a licensed frequency corpus —
no such corpus is vendored here, and none is downloaded at build time, because
the plugin fetches nothing from the network.

That is a deliberate trade-off, and it has a known ceiling: a hand-written list
covers the closed classes (which are finite and safe to enumerate) far better
than it covers the open-class tail, where a real corpus would rank by counted
frequency instead of by judgement.

## Replacing one with a real frequency list

If you want a counted list instead, the two that are licensed for this are:

- **OpenSubtitles / `hermitdave/FrequencyWords`** — MIT, ~60 languages, ranked by
  count. Take the first 800 lines of `<code>_50k.txt`, drop the counts.
- **Universal Dependencies treebanks** — CC BY-SA, gives lemmas rather than
  surface forms, better for languages with heavy inflection.

Either way the file must end up in the format above, and `npm test` checks that
every language in `ui/languages.js` still has one with at least 300 lines.

## Adding a language

Add it to `LANGUAGES` in `ui/languages.js`, then add `<code>.txt` here. The test
fails until both exist, so neither can be forgotten.
