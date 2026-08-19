# Art slots

Every image in the trainer ships as an **empty frame**. The `alt` text on each
`<img>` is the generation prompt, so the UI documents its own missing assets:
until a file lands here the frame shows a dashed placeholder with that prompt
inside it, and the moment the file appears it simply renders.

Drop PNG or WebP files with these exact names into this directory. Nothing else
has to change.

## Shared direction

Flat pastel illustration, no gradients steeper than two stops, soft long
shadows, rounded organic shapes, one accent hue per image drawn from the tile it
sits in. **No readable text anywhere in the image** — the UI supplies every
word. Square or 4:3 unless noted. Transparent or matching-tint background.

Palette, matching `app.css`:

| Token | Light | Ink |
|---|---|---|
| rose | `#f8cfc8` | `#8a3f34` |
| peach | `#fbdfb6` | `#8a5a1c` |
| lavender | `#ddd6f6` | `#4b3f8c` |
| mint | `#c2e8d3` | `#1f6c48` |
| sky | `#cbe0f7` | `#23558f` |
| butter | `#f7ecab` | `#7a6412` |

## Slots

| File | Where | Ratio | Prompt |
|---|---|---|---|
| `empty-deck.png` | first-run empty state, and a language pair with no cards yet | 4:3 | An empty index-card box on a desk beside a closed laptop, one blank card standing upright, mint and cream |
| `empty-filter.png` | deck with no matches | 4:3 | A magnifying glass resting on an empty card tray, one card tipped forward, rose and cream |
| `empty-session.png` | study with no session | 4:3 | A single flashcard lying face down on a mint surface with a soft cast shadow |

These three are the only slots the interface currently renders. Each appears
exactly when its state does, so all three are worth having and none is urgent.

## Not currently placed

The interface used to carry a learner avatar in the rail and a per-category
illustration on a feature tile. Both went when the trainer became a notebook
rather than a dashboard: the six category tiles are now identical, and an
illustration inside a pastel field fought the field.

The prompts are kept here because they would be wanted again the moment a
category gets a detail view of its own. Nothing reads these files today — do
not generate them expecting them to appear.

| File | Ratio | Prompt |
|---|---|---|
| `avatar.png` | 1:1 | Portrait avatar of the learner, three-quarter view, warm rose and lavender, calm expression, plain mint background |
| `cat-engineering.png` | 3:4 | A terminal window and a branching cable coiling out of it, sky-blue palette, no text on the screen |
| `cat-process.png` | 3:4 | Three stacked paper cards pinned along a curving route with a small flag at the end, peach palette |
| `cat-collaboration.png` | 3:4 | Two abstract figures across a small round table, speech shapes overlapping between them, dusty rose, no faces |
| `cat-phrasing.png` | 3:4 | A large open quotation mark folded from paper casting a soft shadow over ruled lines, lavender |
| `cat-connectors.png` | 3:4 | Several small dots joined by one continuous looping line threading through them, butter yellow |
| `cat-everyday.png` | 3:4 | A coffee cup, a sticky note and a pair of glasses on a desk corner, mint palette |
