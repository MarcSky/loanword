# Art slots

Every image in the trainer ships as an **empty frame**. The `alt` text on each
`<img>` is the generation prompt, so the UI documents its own missing assets:
until a file lands here the frame shows a dashed placeholder with that prompt
inside it, and the moment the file appears it simply renders.

Drop WebP files with these exact names into this directory. Nothing else has to
change. The full prompt for every one of them — with palette, composition and
export settings — is in [`prompt.txt`](../../prompt.txt) at the repository root;
this file is the list of what the interface actually reads.

## Shared direction

Flat pastel illustration, no gradients steeper than two stops, soft long
shadows, rounded organic shapes, one accent hue per image drawn from the surface
it sits on. **No readable text anywhere in the image** — the UI supplies every
word. Transparent or matching-tint background. Palette in
[`DESIGN.md`](../../DESIGN.md) §2.

## Rendered today

| File | Where | Ratio | prompt.txt |
|---|---|---|---|
| `empty-deck.webp` | first run, and a language pair with no cards yet | 4:3 | T01 |
| `empty-deck-dark.webp` | the same, dark theme | 4:3 | T02 |
| `empty-filter.webp` | deck with no matches | 4:3 | T03 |
| `empty-filter-dark.webp` | the same, dark theme | 4:3 | T04 |
| `empty-session.webp` | study with nothing due | 4:3 | T05 |
| `empty-session-dark.webp` | the same, dark theme | 4:3 | T06 |
| `caught-up.webp` | overview, nothing due | 4:3 | T07 |
| `caught-up-dark.webp` | the same, dark theme | 4:3 | T08 |
| `queue-building.webp` | the build banner | 4:3 | T09 |
| `queue-building-dark.webp` | the same, dark theme | 4:3 | T10 |
| `first-run.webp` | first launch | 8:5 | T11 |
| `first-run-dark.webp` | the same, dark theme | 8:5 | T12 |
| `session-clean.webp` | clean session summary | 4:3 | T13 |
| `session-mixed.webp` | mixed session summary | 4:3 | T14 |
| `session-hard.webp` | difficult session summary | 4:3 | T15 |
| `long-term.webp` | a word crossing into long-term memory | 4:3 | T16 |
| `streak-week.webp` | weekly rhythm panel | 12:5 | T17 |
| `junk-removed.webp` | junk confirmation | 4:3 | T18 |
| `offline-error.webp` | server connection failure | 4:3 | T19 |
| `cat-engineering.webp` | engineering domain spot | 3:4 | T20 |
| `cat-process.webp` | process domain spot | 3:4 | T21 |
| `cat-collaboration.webp` | collaboration domain spot | 3:4 | T22 |
| `cat-phrasing.webp` | phrasing domain spot | 3:4 | T23 |
| `cat-connectors.webp` | connectors domain spot | 3:4 | T24 |
| `cat-everyday.webp` | everyday domain spot | 3:4 | T25 |
| `cefr-ramp.svg` | CEFR legend and documentation | 6:1 | T26 |
| `canvas-grain.webp` | body texture, tileable | 1:1 | G01 |
| `app-icon-192.png` | `manifest.webmanifest` | 1:1 | B03 |
| `app-icon-512.png` | `manifest.webmanifest` | 1:1 | B04 |
| `app-icon-maskable-512.png` | `manifest.webmanifest`, maskable | 1:1 | B05 |

The domain spot illustrations are generated and reserved for the future domain
detail view; current trainer screens do not render them yet.
