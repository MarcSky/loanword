# Interface language

The trainer speaks your **native** language — the one you write prompts in. It
reads `native_lang` from the settings, looks for `<code>.json` in this
directory, and falls back to English when there is none.

## How the dictionaries work

They are gettext-style: **the English sentence is the key**.

```json
{
  "Start session": "Начать",
  "{n} due right now": "{n} к повторению прямо сейчас"
}
```

That has three consequences worth knowing:

- A missing entry renders the English sentence, not a broken `overview.cta.label`
  placeholder. A half-finished dictionary is usable.
- There is no `en.json`. English lives in the source.
- Changing the English copy invalidates that one entry, and `audit` says so.

`{name}` placeholders are substituted verbatim and must all survive the
translation. Some strings carry inline HTML (`<b>`, `<code>`); keep the tags.

### Plurals

Two English forms are not enough for Russian, Polish or Arabic, so plural keys
look like `"card|cards"` and map to the CLDR categories that
`Intl.PluralRules` selects for your language:

```json
"card|cards": { "one": "карточка", "few": "карточки", "many": "карточек", "other": "карточки" }
```

Give every category your language actually uses; `other` is the fallback.

## Adding a language

```
node scripts/i18n.mjs keys           # every string the interface renders
node scripts/i18n.mjs audit          # what each dictionary is missing or has broken
node scripts/i18n.mjs audit de       # just one
```

Write `<code>.json` with those keys and run `audit` until it is clean. Or ask
Claude to do it — `/loanword:review` offers once when the dictionary for your
native language is missing, and the translation is done by the same
subscription that builds your cards. No API key, nothing leaves the machine.

`audit` exits non-zero when anything is missing, unused or broken, so it works
as a check in CI.

## Right-to-left

`ar`, `he`, `fa` and `ur` switch the whole interface to `dir="rtl"`. The
stylesheet is written with logical properties (`margin-inline`,
`inset-inline-start`, `text-align: start`), so the mirroring is automatic —
only the progress bar's fill direction and the arrow glyphs are flipped by hand
in `app.css`.

If you add an RTL language, add its code to `RTL_LANGUAGES` in
`scripts/serve.mjs`.

Present: `ru`.
