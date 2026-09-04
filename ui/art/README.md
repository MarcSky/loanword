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

## What the trainer reads

Every file here is rendered by a screen; nothing else belongs in this folder.
A name with a `-dark` twin is swapped by `applyTheme` through `data-art`, so
both files must exist or the dark theme shows a broken frame.

| File | Where | Ratio |
|---|---|---|
| `hero.webp` + `-dark` | overview hero, when something is due | 8:5 |
| `caught-up.webp` + `-dark` | overview hero, when nothing is due | 8:5 |
| `tutorial.webp` | the keys promo card (one file, both themes) | 4:3 |
| `empty-deck.webp` + `-dark` | overview and practice with no cards | 4:3 |
| `empty-filter.webp` + `-dark` | deck with no matches | 4:3 |
| `empty-session.webp` + `-dark` | study with nothing due | 4:3 |
| `session-clean.webp` + `-dark` | session summary, 95% and up | 4:3 |
| `session-mixed.webp` + `-dark` | session summary, 70% and up | 4:3 |
| `session-hard.webp` + `-dark` | session summary, below 70% | 4:3 |
| `offline-error.webp` + `-dark` | the trainer cannot be reached (also in `sw.js`) | 4:3 |
| `app-icon-192.png`, `app-icon-512.png` | `manifest.webmanifest`; rendered from the logo by `docs/design/brand/render.sh` | 1:1 |

Slots that no screen reads were removed; add the file back the same day the
screen that renders it lands, never before.
