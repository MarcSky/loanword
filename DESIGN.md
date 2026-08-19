---
name: Loanword
description: A private vocabulary notebook whose deck is the residue of your own work week — every line a word you already needed.
colors:
  canvas: "#a7e3c5"
  canvas-deep: "#8ed4b1"
  plate: "#fdf8f3"
  rail: "#f4e6df"
  panel: "#ffffff"
  sunk: "#f6efe8"
  ink: "#17110e"
  ink-2: "#5e514a"
  ink-3: "#7a6a60"
  line: "#e8dcd3"
  line-strong: "#d9c9be"
  rose: "#f8cfc8"
  rose-ink: "#8a3f34"
  peach: "#fbdfb6"
  peach-ink: "#8a5a1c"
  lavender: "#ddd6f6"
  lavender-ink: "#4b3f8c"
  mint: "#c2e8d3"
  mint-ink: "#1f6c48"
  sky: "#cbe0f7"
  sky-ink: "#23558f"
  butter: "#f7ecab"
  butter-ink: "#7a6412"
typography:
  display:
    fontFamily: "General Sans, ui-sans-serif, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "3.75rem"
    fontWeight: 600
    lineHeight: 0.98
    letterSpacing: "-0.04em"
  prompt:
    fontFamily: "General Sans, ui-sans-serif, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "clamp(2rem, 3.4vw, 3.25rem)"
    fontWeight: 600
    lineHeight: 1.08
    letterSpacing: "-0.04em"
  answer:
    fontFamily: "General Sans, ui-sans-serif, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "1.625rem"
    fontWeight: 500
    lineHeight: 1.2
    letterSpacing: "-0.025em"
  tile:
    fontFamily: "General Sans, ui-sans-serif, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 600
    lineHeight: 1.1
    letterSpacing: "-0.03em"
  title:
    fontFamily: "General Sans, ui-sans-serif, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "1.3125rem"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "-0.02em"
  lead:
    fontFamily: "General Sans, ui-sans-serif, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "-0.015em"
  headword:
    fontFamily: "General Sans, ui-sans-serif, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "1.0625rem"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "-0.015em"
  base:
    fontFamily: "General Sans, ui-sans-serif, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "1rem"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "-0.01em"
  body:
    fontFamily: "General Sans, ui-sans-serif, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 400
    lineHeight: 1.55
    letterSpacing: "normal"
    fontFeature: "tabular-nums"
  label:
    fontFamily: "General Sans, ui-sans-serif, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 500
    lineHeight: 1.3
    letterSpacing: "normal"
  meta:
    fontFamily: "General Sans, ui-sans-serif, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 400
    lineHeight: 1.45
    letterSpacing: "normal"
  caption:
    fontFamily: "General Sans, ui-sans-serif, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "0.005em"
  micro:
    fontFamily: "General Sans, ui-sans-serif, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "0.6875rem"
    fontWeight: 600
    lineHeight: 1.35
    letterSpacing: "normal"
  ring-label:
    fontFamily: "General Sans, ui-sans-serif, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "clamp(0.625rem, calc(var(--size) * 0.25), 2rem)"
    fontWeight: 600
    lineHeight: 1
    letterSpacing: "-0.03em"
  code:
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace"
    fontSize: "0.85em"
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: "normal"
rounded:
  xl: "30px"
  lg: "22px"
  md: "15px"
  sm: "10px"
  xs: "6px"
  pill: "999px"
spacing:
  xs: "8px"
  sm: "12px"
  md: "16px"
  lg: "20px"
  xl: "28px"
  page: "34px 40px 44px"
components:
  button:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.pill}"
    padding: "11px 20px"
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.plate}"
    typography: "{typography.body}"
    rounded: "{rounded.pill}"
    padding: "13px 24px"
  button-quiet:
    backgroundColor: "transparent"
    textColor: "{colors.ink-2}"
    typography: "{typography.body}"
    rounded: "{rounded.pill}"
    padding: "11px 20px"
  chip:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.ink-2}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "0 15px 0 11px"
    height: "38px"
  chip-selected:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.plate}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "0 15px 0 11px"
    height: "38px"
  input:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "0 14px"
    height: "44px"
  panel:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: "20px"
  category-tile:
    backgroundColor: "{colors.mint}"
    textColor: "{colors.mint-ink}"
    typography: "{typography.tile}"
    rounded: "{rounded.lg}"
    padding: "18px"
    height: "158px"
  word-card:
    backgroundColor: "#e5f5ed"
    textColor: "{colors.mint-ink}"
    typography: "{typography.headword}"
    rounded: "{rounded.lg}"
    padding: "16px"
  list-row:
    backgroundColor: "transparent"
    textColor: "{colors.mint-ink}"
    typography: "{typography.body}"
    padding: "9px 4px"
  list-row-hover:
    backgroundColor: "color-mix(in srgb, #c2e8d3 26%, transparent)"
    textColor: "{colors.mint-ink}"
    typography: "{typography.body}"
    rounded: "{rounded.sm}"
    padding: "9px 4px"
  group-head:
    backgroundColor: "transparent"
    textColor: "{colors.mint-ink}"
    typography: "{typography.body}"
    padding: "0 4px 10px"
  star:
    backgroundColor: "transparent"
    textColor: "{colors.ink-3}"
    rounded: "{rounded.xs}"
    size: "28px"
  star-on:
    backgroundColor: "transparent"
    textColor: "{colors.butter-ink}"
    rounded: "{rounded.xs}"
    size: "28px"
  due-bar:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.plate}"
    typography: "{typography.lead}"
    rounded: "{rounded.lg}"
    padding: "18px 18px 18px 24px"
  grade-button:
    backgroundColor: "{colors.mint}"
    textColor: "{colors.mint-ink}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "11px 18px"
  tag:
    backgroundColor: "{colors.mint}"
    textColor: "{colors.mint-ink}"
    typography: "{typography.caption}"
    rounded: "{rounded.pill}"
    padding: "0 10px 0 7px"
    height: "24px"
  rail-item:
    backgroundColor: "transparent"
    textColor: "{colors.ink-2}"
    rounded: "{rounded.md}"
    size: "44px"
  rail-item-current:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.plate}"
    rounded: "{rounded.md}"
    size: "44px"
  keycap:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.ink-2}"
    typography: "{typography.caption}"
    rounded: "{rounded.xs}"
    padding: "0 6px"
    height: "22px"
---

# Design System: Loanword

## Overview

**Creative North Star: "The Warm Notebook"**

Loanword is one person's notebook, not a course. The deck is the residue of a
work week — words its owner actually needed and did not have — and the interface
is built for someone rereading their own notes, not for a student being taught.
That distinction does the design work. There is no progress dashboard, no
streak, no daily goal, no profile: those are instruments for measuring a learner,
and there is no learner here, only a person and their list. What remains is the
list itself, the words due today, and a way to sit down with them.

So the dominant form is a **line, not a card**. A category read straight through
is a column of single-line entries — star, word, translation, level, mastery —
that you can skim the way you skim a page of notes. Cards still exist, as the
Deck's optional grid view and as the study surface, but the notebook is the
default. Density follows from that: rows are close-set at 9px, hairline-divided,
and the only thing that lifts off the page is what you are pressing.

The material is flat, warm and lightly lifted. A mint canvas holds an inset
cream plate; a blush rail runs down its start edge; six pastel fields carry
category meaning. Colour does the structural work that borders and shadows do in
colder systems — a thing is identified by which field it belongs to, not by how
far it floats. But a field does not always fill: on a tile it owns the whole
surface, and in the list it survives as a tinted headword and a soft hover wash.
The confirmed anti-reference is the course catalogue — uniform white cards,
coloured outlines for selection, achievement furniture.

**Key Characteristics:**

- Four screens only: Overview, Deck, Study, Settings.
- The reading list is the default view; the card grid is the alternative.
- Six pastel category fields, each a ground-plus-ink pair, expressed loudly on
  tiles and quietly in lists.
- Ink-solid fills reserved for the selected state and the primary action; in a
  list, selection is a filled glyph instead.
- One type family (General Sans variable) across a sixteen-step ramp, tabular
  numerals throughout.
- Every corner in the stylesheet comes from a radius token; there are no literal
  radii.
- A hairline border or an elevation, never both at rest.
- Exactly one authored motion moment: the card turn.
- Every image is a deliberate empty frame carrying its generation prompt in
  `alt`.

## Colors

Six pastel fields for meaning, a warm neutral spine for structure, and a single
near-black ink that carries every selected state.

The frontmatter values are the light theme, which is the source of truth. A dark
theme swaps ground and ink within each field rather than dimming them: `mint`
becomes a deep forest ground (`#204536`) and `mint-ink` becomes the pale mint
that reads on it (`#9adcbb`), so a category keeps its identity across themes and
no component needs a theme-specific rule. The full dark ramp lives in
`.impeccable/design.json` under `colorMeta[*].dark`.

### Primary

- **Trainer Ink** (`{colors.ink}`): The near-black that carries authority. It
  fills the due-now bar, the primary button, the pressed chip, the current rail
  item and the toast. Nothing else is allowed a solid fill this strong. On the
  plate it is also the default body colour.
- **Cream Plate** (`{colors.plate}`): The application surface. Everything the
  user reads sits on this or on a field drawn over it. It doubles as the text
  colour on every ink-filled element.
- **Mint Canvas** (`{colors.canvas}` → `{colors.canvas-deep}`): The ground
  behind the plate, painted as a radial gradient from the top centre. It is
  visible as a margin, never as a content surface.

### Secondary — the six category fields

Each field is a **pair**: a pastel ground and the ink that reads on it. They are
never used apart. The pair is injected as `--tint` / `--tint-ink` on the tile,
card or row element, so every descendant — icon, tag, meter, ring, border,
headword — picks up the category automatically without a per-category class.

- **Sky** (`{colors.sky}` / `{colors.sky-ink}`): Engineering — code, systems,
  debugging, review.
- **Peach** (`{colors.peach}` / `{colors.peach-ink}`): Process — plans,
  estimates, releases, specs.
- **Dusty Rose** (`{colors.rose}` / `{colors.rose-ink}`): Collaboration —
  meetings, feedback, asking, disagreeing.
- **Lavender** (`{colors.lavender}` / `{colors.lavender-ink}`): Phrasing — set
  phrases and idioms that resist translation.
- **Butter** (`{colors.butter}` / `{colors.butter-ink}`): Connectors — the
  hinge words that join clauses. Butter ink has a second job as the *starred*
  colour, which is why the star reads as a deliberate mark rather than as one
  more category signal.
- **Mint** (`{colors.mint}` / `{colors.mint-ink}`): Everyday — general
  vocabulary and everything unplaced. Mint also serves as the system's
  affirmative: the correct answer, the revealed answer, the "known" tally, the
  switch-on state and the dark theme's focus ring.

The four grading buttons reuse four of these pairs rather than introducing a
semantic red/amber/green ramp: Again→rose, Hard→peach, Good→mint, Easy→sky.

### Neutral

- **Rail Blush** (`{colors.rail}`): The 76px navigation rail only. A warmer,
  pinker step off the plate that reads as a different room, not a different app.
- **Panel White** (`{colors.panel}`): Cards and panels that sit *on* the plate —
  inputs, chips, unselected buttons, the shortcuts dialog. The one pure white in
  the system, and it only appears above the cream.
- **Sunk Cream** (`{colors.sunk}`): Recessed wells — keyword pills, the study
  progress track, the segmented control's trough, the language-pair block, the
  Learn choice's key badge. Anything that reads as carved *into* the plate.
- **Ink 2** (`{colors.ink-2}`) / **Ink 3** (`{colors.ink-3}`): The two secondary
  text steps on neutral grounds. Ink 2 is prose that still wants reading (ledes,
  descriptions, examples, the list row's translation); Ink 3 is metadata that
  does not (group counts, origin lines, key hints, the unstarred star, the
  de-emphasised word inside the display headline).
- **Line** (`{colors.line}`) / **Line Strong** (`{colors.line-strong}`): The two
  hairline weights. Line divides content inside a surface (list rows, group
  heads, settings rows, the rail's edge, panel borders); Line Strong outlines
  interactive controls at rest (buttons, chips, inputs, `kbd`) and paints
  scrollbar thumbs.

### Named Rules

**The Whole-Tile Field Rule.** A category's colour owns its surface — ground
*and* ink — never a coloured outline, a left stripe, or a dot on a white card.
On the deck grid, where cards must stay legible in bulk, the field is diluted
into the panel (`color-mix(in srgb, var(--tint) 42%, var(--panel))`, and 55% in
dark) but it is still the ground, not an accent.

**The Quiet Field Rule.** In the reading list the same field identifies without
filling: the headword takes `--tint-ink`, the group icon takes the pale field as
a 24px plate, and the row washes to 26% of the field only on hover. A field must
always say *which category*; it does not always have to say it loudly. Reach for
the quiet expression whenever the surface is a line of text rather than an
object — a filled row would turn a page of notes into a stack of cards.

**The Ink-Solid Selection Rule.** A solid `{colors.ink}` fill means *selected or
primary* and nothing else: the pressed filter chip, the current rail item, the
active deck chip, the primary button, the due-now bar, the toast. Selection is
never expressed as a coloured outline, and a coloured field is never used to
mean "chosen".

**The Filled-Glyph Rule.** Where selection lives on a line rather than a
surface, it is a *filled glyph*, not a filled background: the star sets both
`color` and `fill` to `{colors.butter-ink}` when on. It is deliberately filled
with the ink and not with the pale `butter` field — an on state has to read as
on from across the row, and a pale fill at 16px does not. Any future in-row
toggle follows this, not the chip's ink pill.

**The Six-Field Scale Rule.** When something needs six graduated steps it walks
the six category fields in order rather than repeating ink six times, because ink
is spoken for. Category-keyed marks always use that category's own field, so a
mark's colour is a fact about what it measures.

## Typography

**Display Font:** General Sans (variable, 200–700), self-hosted, with
`ui-sans-serif` / `-apple-system` / `Segoe UI` fallbacks
**Body Font:** General Sans — the same face at the same axis
**Mono:** `ui-monospace, SFMono-Regular, Menlo` — inline `code` only

**Character:** A single geometric grotesque doing everything, cut hard at the
top of the scale and left plain at the bottom. Large sizes are set at 600 with
aggressive negative tracking so the headline reads as a drawn object; body text
is 400 at a comfortable 1.55 leading and gets no tracking at all. The contrast
between the two ends of the ramp is the whole typographic idea — there is no
second family, no italic, no small caps.

### Hierarchy

The ramp is sixteen steps and this list is exhaustive: every distinct font-size
that ships appears here, and a new size is a change to this system, not a local
choice.

- **Display** (600, **3.75rem** → 2.75rem ≤860px → 2.25rem ≤620px, 0.98,
  -0.04em): The page headline, one per screen, capped at 15ch and balanced.
  Those three sizes are *one role at three breakpoints*, not three roles. A
  shaded word inside it uses `{colors.ink-3}` via `em` (with `font-style` reset
  to normal). Its one authored exception is the session-summary headline at
  2.5rem, which shares the stage with a 96px ring and would otherwise crowd it.
- **Prompt** (600, **clamp(2rem, 3.4vw, 3.25rem)**, 1.08, -0.04em): The study
  card's word. The only fluid size in the system, because it is the only element
  whose length the design does not control.
- **Answer** (500, **1.625rem**, 1.2, -0.025em): The revealed translation, set
  in mint ink. The one place a large size is set at 500 rather than 600 — it is
  a reward, not a headline — and the reason it is tracked looser than the
  smaller tile title.
- **Tile** (600, **1.5rem**, 1.1, -0.03em): The small category tile's line,
  pushed to the bottom of the tile by `margin-top: auto`.
- **Title** (600, **1.3125rem**, 1.2, -0.02em): `h2` — panel and section
  headings.
- **Lead** (600, **1.125rem**, -0.015em): The due bar's headline. The largest
  step that is still a label rather than a heading.
- **Headword** (600, **1.0625rem**, 1.25, -0.015em): The deck card's front, the
  only role that carries the Toward-Ink mix as its default colour.
- **Base** (600 at -0.01em for `h3`; 400 at 1.55 for examples and Learn choices,
  **1rem**): The boundary between heading and prose.
- **Body** (400, **0.9375rem**, 1.55): Default text, buttons, inputs, the list
  row and its group head. Ledes cap at 46ch, examples at 52ch, setting
  descriptions at 56ch.
- **Label** (500, **0.875rem**): The interactive voice — chips, segmented
  control, deck chips, toast, setting descriptions, the shortcuts list.
- **Meta** (400/500, **0.8125rem**, 1.45): The workhorse and the most-used size
  in the app by a wide margin. Field labels and hints, sub-lines, tallies, group
  counts, keyword pills, origin lines, key hints, the small CEFR chip.
- **Caption** (600, **0.75rem**, 0.005em): Tags, due counts, counters, the
  word-card footer, the grade hint, the deck-chip count. Small, and heavy enough
  to survive on a pastel ground.
- **Micro** (600, **0.6875rem**): The CEFR level pill and the art placeholder's
  prompt text. Nothing that must be read to use the app is set at this size.
- **Ring Label** (600, **clamp(0.625rem, calc(var(--size) * 0.25), 2rem)**,
  -0.03em): Bound to the ring's own size so one component covers 40px to 96px.
- **Code** (**0.85em**, platform mono): Inline `code`. Em-relative, so it tracks
  whatever role it is embedded in rather than adding a seventeenth absolute
  step.

### Named Rules

**The One Family Rule.** General Sans covers display through micro. A second
family may only appear where the content is literally code, and then only as
the platform mono stack at the `code` role's `0.85em`.

**The Tighten-As-It-Grows Rule.** Tracking is a band that tightens with size and
never runs positive above 1rem: -0.01em at 1rem and below, -0.015em at
1.0625–1.125rem, -0.02em at 1.3125rem, -0.03em at 1.5rem, -0.04em at display and
prompt. The only positive tracking in the system is the +0.005em on caption. The
band's one deliberate inversion is the answer, set at 1.625rem but only
-0.025em, because it is the sole large size cut at 500 and lighter weight needs
less tightening than heavier weight at the same size.

**The Tabular Rule.** `font-variant-numeric: tabular-nums` is set on `body` and
never overridden. Every count in this app changes between visits; none of them
may shift the layout when it does.

**The Closed-Ramp Rule.** The sixteen steps above are the whole ramp. Before
adding a size, check whether an existing step is within half a pixel — two steps
have already been collapsed for exactly that reason. Near-duplicates are drift,
not hierarchy.

## Layout

The application is a single **plate**: a `max-width: 1440px` grid inset 20px
from the viewport on a mint canvas, with an `xl` radius and the system's deepest
elevation. Inside it, a fixed 76px rail and a `minmax(0, 1fr)` content column.
Pages are swapped by a `[data-active]` attribute rather than unmounted, and each
carries `34px 40px 44px` of padding — asymmetric, with the extra weight at the
bottom so a scrolled page never ends flush.

**The rail** holds the logo mark, four nav items, and — pushed to the bottom by
a flexible spacer — theme and shortcuts. That is the whole of it.

**Overview** is a single column that changes shape with the filter. With no
category chosen it runs headline → lede → mode switch → due bar → category and
CEFR filter rows → the category tile grid, `repeat(auto-fill, minmax(320px,
1fr))` at 16px, six identical tiles three across. With a category chosen the tiles
are replaced by that category's reading list, because a single tile would only
repeat the heading directly above it.

**Deck** offers both forms through a segmented control: the reading list
(default) or a self-sizing card grid, `repeat(auto-fill, minmax(268px, 1fr))` at
14px. It and the category grid are the app's two auto-fill grids.

**Study** is the exception: a two-column, three-row grid pinned to
`calc(100dvh - 40px)` with zero page padding. The bar and the key hints span
`1 / -1`; the stage takes the first column and the session panel a fixed 300px
second. Inside the stage the card face is itself two equal columns — **ask** on
the start edge, right-aligned against a hairline, and **tell** on the end edge,
left-aligned — because a word and what it means are a pair, and one centred
block left most of the screen doing nothing. Grades span the stage below both.

When no session is running the page carries `data-idle`, which collapses it to
one column and one row so the empty state centres rather than perching at the
top of a frame built for three. The stage takes `min-height: 0` and
`overflow-y: auto`, so a short window scrolls the card instead of clipping it.
Its selector is deliberately `.page.study[data-active]`; a bare `.study` rule
would outrank `.page { display: none }` and leave an inactive study screen
occupying a viewport under every other page.

Below 1120px the session panel drops under the card and its log turns from a
column into a wrapping row; below 860px the ask/tell pair stacks and both sides
return to the start edge.

**Settings** is a 760px-capped column of `.setting` rows — copy on the start
edge, a 220px control block on the end edge, divided by hairlines with the last
row's border removed. It stacks to full-width controls below 860px.

Spacing runs on a 4px grain with a small set of recurring steps: 8px between
peer controls, 12px inside a row, 14px across a list row's columns, 16px between
cards, 20px of panel padding and body inset, 26px between list groups.

**Breakpoints.** Three. `860px` drops the display to 2.75rem, tightens page
padding to `26px 22px 36px`, makes the category grid single-column with the lead
tile's image moving above its text, single-columns the Learn choices, and stacks
settings rows. `620px` removes the body inset entirely — the plate goes
edge-to-edge with square corners, and the rail becomes a sticky horizontal top
bar. `480px` turns the filter rows into a horizontally scrolling, snap-aligned
strip that bleeds 18px past the page padding on both sides.

> The `FIRST VIEWPORT` line in `ui/index.html`'s direction contract still
> describes a right column carrying profile, goal ring and activity chart. That
> column was removed when the product turned from a trainer into a notebook.
> The contract is stale on that point; this file describes what ships.

### Named Rules

**The Plate Rule.** Above 620px the app is an object on a canvas, not a page:
the mint ground shows on all four sides and the plate keeps its `xl` corners.
Below 620px the plate is the page — inset 0, radius 0, rail on top. There is no
intermediate state where the plate is inset on some sides only.

**The Logical Property Rule.** Every directional value in the stylesheet is
logical — `inset-inline-start`, `margin-inline`, `padding-inline-end`,
`border-inline-end`, `text-align: start/end` — so `dir="rtl"` mirrors the whole
interface without a second stylesheet. Exactly two things are flipped by hand,
because CSS gives them no logical form: `transform-origin` on the progress fill
and the switch knob's translate, and a `scale(-1, 1)` on the chevron glyph in a
chip. Any new directional value must be logical or must join that list
explicitly.

**The No-Instrument Rule.** This is a notebook, not a course. Streaks, daily
goals, activity heatmaps, mastery dashboards, profile blocks and any other
furniture that exists to measure a learner do not belong on these screens. A
per-item mastery meter is a property of the word and stays; an aggregate score
of the person does not. When a new surface is proposed, ask whether it tells the
user something about *their words* or something about *themselves*.

## Elevation & Depth

Hybrid, weighted toward tonal. Depth is normally communicated by which of four
warm neutrals a surface is painted in — canvas below plate below panel, with
`sunk` reading as carved into the plate — and shadow is added only where
something genuinely rises off the surface below it. Shadows are two-layer and
warm-tinted (`rgb(60 40 30)`) in light, so they read as a warm object's shadow
rather than as grey haze; in dark they become pure black at much higher alpha,
since a warm shadow on a dark warm ground is invisible.

### Shadow Vocabulary

- **Lift 1** (`0 1px 2px rgb(60 40 30 / 0.05), 0 6px 16px -10px rgb(60 40 30 / 0.28)`):
  The response to a cursor. Buttons and Learn choices on hover, the pressed
  segment of the segmented control, the switch knob.
- **Lift 2** (`0 2px 4px rgb(60 40 30 / 0.06), 0 18px 40px -22px rgb(60 40 30 / 0.4)`):
  Things that are already raised. The primary button and the due-now bar at
  rest; category tiles, word cards, grade buttons and the contact link on hover
  (always paired with a 2–3px `translateY`).
- **Lift 3** (`0 3px 8px rgb(60 40 30 / 0.08), 0 40px 80px -40px rgb(60 40 30 / 0.5)`):
  Reserved for the two surfaces that float above the whole app — the plate and
  the toast.

### Named Rules

**The Border-Or-Lift Rule.** A resting surface carries a hairline border **or**
an elevation, never both. Panels, inputs, chips and unselected buttons are
bordered and flat; the plate, the primary button, the due bar and the toast are
borderless and lifted. Where a lifted element does declare a border, the border
is set to its own fill colour (the primary button's `border-color: var(--ink)`)
so it exists for box-model consistency and reads as no line at all. Shadows may
join a bordered surface on hover — hover is not rest.

**The Flat-List Rule.** The reading list takes no elevation at any state. A row
responds to the cursor with a tint wash and a rounded corner, never with a lift;
raising one line of a page of notes off the page is a card's gesture, and the
list exists precisely because cards were too heavy for this content.

**The Warm-Shadow Rule.** Light-theme shadows are tinted `rgb(60 40 30)`, never
neutral black. A grey shadow on cream reads as dirt.

## Shapes

Corners come from a six-step token scale and nothing else. From largest to
smallest:

- **`xl` (30px)** — the plate. One user; the app's outermost silhouette.
- **`lg` (22px)** — every content surface: panels, category tiles, word cards,
  the due bar, the language-pair block.
- **`md` (15px)** — controls that hold a value or an icon: inputs, selects,
  grade buttons, Learn choices, art frames, and the rail's icon buttons.
- **`sm` (10px)** — the small icon plate inside a category tile's header, and
  the hovered list row.
- **`xs` (6px)** — the smallest containers: keycaps, inline `code`, the Learn
  choice's key badge, the list's group icon, the star's hit target, and the
  global focus ring's own corner.
- **`pill` (999px)** — everything pressable that is not a card, plus every track
  and meter.

The scale is six steps and closed. A seventh existed briefly — `--r-bar`, for
the activity chart's caps — and was deleted with the chart rather than kept
around as a spare: a token with no user is not part of a system, it is an
invitation to reach for the wrong corner.

Borders are always 1px hairlines. On a neutral ground they use `line`
(structural division) or `line-strong` (interactive outline). On a tinted ground
the hairline is derived from the field's own ink — `color-mix(in srgb,
var(--tint-ink) 16–18%, transparent)`, rising to 42% on hover — so a coloured
tile is never outlined in a foreign grey. Dividers inside lists are bottom
borders removed on the last child rather than drawn as separate rules; a hovered
row also clears its own divider so the wash reads as one continuous shape.

Icons are a vendored Lucide subset in a single sprite, 20px at 1.75 stroke, 16px
for the `icon-sm` variant, 13px inside tags and chip dots. Because `<use>`
clones a symbol into a shadow tree and the sprite root's presentation attributes
never reach it, the stroke is declared in CSS on `.icon`, not in the sprite — any
new icon inherits the weight automatically. Icons take `currentColor`, which on
a tinted surface is that field's ink. `fill` stays `none` everywhere except the
starred star.

### Named Rules

**The Tokenized Radius Rule.** Every `border-radius` in the stylesheet resolves
to `--r-xl`, `--r-lg`, `--r-md`, `--r-sm`, `--r-xs` or `--pill`.
`grep -E 'border-radius: *[0-9]+px' ui/app.css` must keep returning nothing. A
corner that does not fit a step is a signal that the element belongs to a
different tier, not that the scale needs another step.

**The Pill Rule.** Anything the user presses that is not a card is a pill:
buttons, filter chips, tags, deck chips, counters, the toast, the switch, every
progress track and meter. Rectangular radii belong to surfaces that *hold*
content. There is no in-between radius for a button.

**The Dashed-Frame Rule.** A dashed border appears in exactly one place — the
empty art frame — and therefore always means "an asset belongs here and has not
arrived". It is never decorative.

## Components

### Reading List (signature)

The notebook view and the app's default way of showing words. A category read
straight through as one line per word.

- **Row:** `grid-template-columns: 32px minmax(0, 1.1fr) minmax(0, 1.4fr) auto
  56px` at a 14px gap — star, headword, translation, CEFR badge, mastery meter.
  The translation column is the widest because it is the one that runs long;
  both text columns take `overflow-wrap: anywhere` rather than truncating, since
  a clipped word in a notebook is useless.
- **Rhythm:** 9px vertical padding with a `line` hairline between rows, removed
  on the last. Close-set on purpose: this is meant to be skimmed.
- **Colour:** the row inherits `--tint` / `--tint-ink` from its category exactly
  as a card does, but spends it quietly — the headword takes the field's ink at
  600, the translation stays `ink-2`, and the field only becomes a ground on
  hover, at 26% with an `sm` corner and its own divider suppressed.
- **Grouping:** grouped under a `group-head` when the list spans more than one
  category, flat when it does not. The head is a `body`-size row of icon, label
  and an `ink-3` count, with the icon on a 24px `xs`-radius plate of the pale
  field and a `line` hairline beneath. Groups are separated by 26px.
- **Star:** a 28px `xs`-radius hit target holding a 16px glyph. Off is `ink-3`
  with a 7% ink wash on hover; on sets both `color` and `fill` to butter ink.
  See the Filled-Glyph Rule.
- **Meter:** the same 5px pill the word card uses, fixed at 56px in the row's
  last column so every mastery bar in the list starts and ends at the same x.

### Buttons

- **Shape:** Full pill, inline-flex with a 9px icon gap, never wrapping.
- **Primary:** Ink fill, plate text, `13px 24px`, carrying Lift 2 at rest.
  Hover shifts the fill 12% toward mint ink (`color-mix(in srgb, var(--ink) 88%,
  var(--mint-ink))`) and drops the border — a warming, not a lightening.
- **Default:** Panel fill, ink text, `11px 20px`, 1px `line-strong` border.
  Hover darkens the border to `ink-3` and adds Lift 1.
- **Quiet:** Transparent, `ink-2` text, no border. Hover washes 6% ink over the
  ground and takes no shadow.
- **Active:** `translateY(1px)` on every variant — the whole system's press
  gesture.
- **Disabled:** `opacity: 0.45` and `pointer-events: none`. This and the
  eliminated Learn choice are the only two opacity fades in the system, and both
  mean *out of play* rather than *less important*.
- **Counter:** A button may carry a `.count` pill filled with 16% of its own
  `currentColor`, so it inverts correctly inside a primary button without a
  second rule.

### Chips

- **Style:** 38px pill (32px for the `chip-sm` CEFR variant), panel ground,
  `ink-2` text, `line-strong` hairline. Asymmetric padding (`0 15px 0 11px`)
  because a leading dot needs less room than the trailing text edge.
- **Dot:** A 20px circle filled with the category's `--tint` and carrying its
  icon in `--tint-ink` — the field appears at chip scale as a swatch, never as
  the chip's own background.
- **Selected:** Ink fill, plate text, ink border. The dot becomes 22% plate over
  transparent so it stays visible against the ink. No coloured outline, ever.
- **Deck chips** (language pairs) follow the same pattern with a `9px 15px`
  pill and a count badge tinted from `currentColor`.

### Segmented Control

A `sunk` trough with a `line` hairline and 4px of padding, holding pill buttons
at 34px. The pressed segment lifts to `panel` with Lift 1 — the one place a
raised surface is used to mean *current* rather than *pressable*, because the
trough already reads as the resting plane. It carries the Overview's study-mode
choice and the Deck's list/grid view choice.

**The CEFR badge sits beside what it labels.** Its default is to follow the
category tag immediately; only `.word-top` pins it to the far edge with an auto
inline-start margin, because there it balances the tag across a card header. A
global auto margin pushed it to the opposite end of the study card's tag row and
left a gap wide enough to read as a mistake.

### Session Panel

The 300px column beside the study card. It reports **this sitting** and nothing
else — the No-Instrument Rule applies here more sharply than anywhere, because
a progress column is exactly where a streak would try to move in.

- Divided from the stage by a `line` hairline on the start edge, 28px padding.
- Head: position as `title`-size numerator with a `label`-size `/ total` in
  `ink-3`, beside the shared progress track.
- The known / still-learning tally, in the grade fields.
- **Log**, newest first: one `xs`-radius row per answered card, tinted by what
  was pressed — `grade-good` at 42% for Good and Easy, `grade-again` at 42% for
  Again and Hard, each with its field's ink. The row ellipsizes; the log scrolls
  and nothing else in the column does.
- A muted count of what is left, pinned to the end with `margin-top: auto`.

Before the first answer the log is replaced by one line of `meta` copy. An
empty container with a heading and no content is worse than a sentence.

### Cards / Containers

- **Panel:** `lg` radius, panel white, 1px `line` hairline, 20px padding, flat
  at rest per the Border-Or-Lift Rule. Stacks at 16px.
- **Category tile:** `lg` radius, the field as ground, the field's ink as text,
  a hairline of 16% that ink, min-height 158px. One shape only — there is no
  feature variant, and the six sit in `repeat(auto-fill, minmax(320px, 1fr))`,
  three across on a wide screen. Its header icon sits on an `sm`-radius plate of
  12% field ink. Hover lifts 3px with Lift 2. The tile is a `<button>` that
  scopes the Overview to that category.
- **Word card:** `lg` radius, 16px padding, ground `color-mix(in srgb,
  var(--tint) 42%, var(--panel))` in light and 55% in dark. The headword takes
  the Toward-Ink mix; the translation and the footer stay at full field ink. A
  5px meter at the bottom reports mastery in the field's ink over a 16% track.
  Hover lifts 2px and strengthens the hairline to 42%.
- **Sunk well:** no border, no shadow, on `sunk`. For keyword pills, the Learn
  choice's key badge, and any container that should read as recessed.

### Inputs / Fields

- **Style:** 44px tall, `md` radius, panel ground, `line-strong` hairline, 14px
  inline padding. The search variant is 38px and fully pilled with a 42px
  leading inset for its icon.
- **Focus:** Border goes to `ink` and a 3px ring of 12% ink appears outside it —
  a soft halo, not a browser outline. The global `:focus-visible` fallback is a
  2px `ink` outline at 2px offset with an `xs` corner (mint ink in dark).
- **Select:** Native appearance removed; the chevron is drawn with two
  `linear-gradient` triangles in `currentColor`, so it recolours with the field
  instead of shipping an icon.
- **Switch:** 48px × 28px pill, `line-strong` when off, mint ink when on, with a
  22px panel knob carrying Lift 1 and translating 20px (mirrored under RTL).

### Navigation

- **Rail:** 76px, blush ground, hairline on its inline end, items centred in a
  vertical stack: the logo mark at the top, four nav items, then a flexible
  spacer pushing theme and shortcuts to the bottom.
- **Items:** 44px squares at `md` radius — the same corner as an input, so the
  rail reads as a column of controls rather than a column of tiles. `ink-2`
  icons; hover washes 7% ink; the current page is a solid ink square with plate
  icon. An unread badge is an 8px rose-ink dot ringed 2px in the rail's own
  colour so it punches out of the surface.
- **Mobile (≤620px):** The rail becomes a sticky horizontal bar at the top of
  the plate with a bottom hairline, items shrinking to 40px and the spacer
  removed.

### Settings Row

A single repeated pattern: copy block on the start edge (a `body`-size title at
600 over an `ink-2` description capped at 56ch), a fixed 220px control block on
the end edge, a `line` hairline underneath, and no border on the last row. It
takes whatever control the setting needs — select, input, switch, or a button —
and adds no vocabulary of its own. Both recent additions are built entirely from
it: the interface-language selector is one row with a `select`, and the Obsidian
export block is a path input in one row and a default button in the next, with
the explanation carried by each row's own description slot rather than by a
callout. Anything new in Settings should be expressible this way; a setting that
needs a bespoke surface is a sign the setting is really a screen.

### Grade Buttons

The four FSRS grades, in an `md`-radius row. Each takes one of four category
fields as ground rather than a semantic red/amber/green ramp. Within the button
the label mixes toward ink and the hint stays at full field ink — the same
Toward-Ink pairing the deck card uses, so the two-line hierarchy is carried by
weight and mix rather than by fading the hint into its own background. Hover
lifts 2px with Lift 2.

### Mastery Ring

A `conic-gradient` in `currentColor` over an 18% track, with an absolutely
positioned hole inset at 11% of the ring's own size so the arc keeps its visual
weight as the ring scales. Two sizes ship: 40px on a category tile and 96px on
the session summary. The label uses the `ring-label`
role, which is bound to the ring's own size, and is z-indexed above the hole
because the hole is a later sibling.

The hole is the ring's one required decision: it must be painted with whatever
surface the ring sits on, passed in as `--ring-hole`. It defaults to `--tint`
so a ring dropped into a category tile is correct without configuration; on the
study plate it takes `--plate`. A ring inherits its arc colour from its parent's
text colour, which means a ring inside a tinted tile is that category's ink and
needs no colour of its own.

### Art Frame

Every `<img>` in the app ships as a deliberate empty frame: a dashed border in
35% of the surrounding field's ink over a 45% wash of that field, with the
image's *generation prompt* as its `alt` text so the placeholder displays what
belongs there. The moment a file lands in `ui/art/` it simply renders and the
frame disappears behind it. Prompts and slot names are catalogued in
`ui/art/README.md`; the shared direction is flat pastel illustration, one accent
hue drawn from the tile the image sits in, and no readable text anywhere in the
image — the UI supplies every word.

### Motion

One authored moment and a uniform state layer. `cubic-bezier(0.22, 1, 0.36, 1)`
is the only easing curve in the system; state transitions are 160ms, surfaces
that move are 180–220ms, and the progress fill is 300ms.

- **The card turn** (the authored moment): the card face drops to `opacity: 0`,
  `translateY(10px) scale(0.985)` while the next card is built, then returns —
  opacity over 180ms, transform over 320ms. It is a transition, not an
  animation.
- **`rise`** is the only `@keyframes` in the stylesheet: a 420ms lift from 12px
  below, applied through `.enter` on exactly two surfaces — the empty state and
  the session summary. It is not a general entrance animation.
- The study progress bar animates `transform: scaleX()`, never `width`, because
  it runs on every card.
- `prefers-reduced-motion: reduce` collapses every animation and transition in
  the sheet to 0.01ms.

## Do's and Don'ts

### Do:

- **Do** reach for a line before a card. The reading list is the default way to
  show words; the grid is the alternative the user asks for.
- **Do** give a category its field by setting `--tint` and `--tint-ink` on the
  element and letting descendants inherit — loudly on a tile, quietly on a row.
  Never write a per-category class.
- **Do** reserve solid `{colors.ink}` for the selected state and the single
  primary action on a screen, and use a filled glyph where selection lives on a
  line.
- **Do** rank two lines on the same tinted ground by mixing the senior one 72%
  toward `{colors.ink}` and leaving the junior one at full `--tint-ink`.
- **Do** take every corner from a radius token, and pick the token that matches
  the element's tier rather than its pixel size.
- **Do** check the sixteen-step ramp before adding a font size; if an existing
  step is within half a pixel, use it.
- **Do** pick a hairline **or** an elevation for a resting surface. Lift 1–3
  belong on hover, on borderless surfaces, and on the plate.
- **Do** write every directional value as a logical property, and mirror by hand
  only what CSS gives no logical form.
- **Do** ship every `<img>` as an empty frame whose `alt` is the generation
  prompt, and register the slot in `ui/art/README.md`.
- **Do** build new settings out of the existing `.setting` row.
- **Do** let a scroll container carry `min-height: 0` alongside `overflow-y`, or
  a grid row will refuse to shrink and the content clips instead of scrolling.

### Don't:

- **Don't** add streaks, daily goals, activity charts, profile blocks or any
  other instrument that scores the person rather than describing their words.
  That furniture was removed on purpose.
- **Don't** fade text toward `transparent` on a tinted ground, by `opacity` or
  by `color-mix` with transparent. It measured 2.88–3.48:1 across these six
  fields and fails contrast on all of them. The codebase currently has zero
  instances; keep it that way. (`opacity: 0.45` remains legitimate for the
  *disabled* button and the *eliminated* Learn choice, where the point is that
  the element is out of play.)
- **Don't** fill a list row with its category field. The field belongs in the
  headword and the hover wash; a filled row turns notes back into cards.
- **Don't** lift a list row on hover. The list is flat at every state.
- **Don't** write a literal `border-radius` value. Six tokens cover every corner
  in the app.
- **Don't** add a font size that is within half a pixel of an existing step.
- **Don't** express selection as a coloured outline, a coloured border, or a
  tinted background. Selection is ink, or a filled glyph.
- **Don't** put a hairline border and a shadow on the same surface at rest.
- **Don't** repeat ink to build a scale — if six steps are needed, the six
  fields provide them.
- **Don't** add a second authored motion moment, or a second `@keyframes`.
  Anything new is a 160ms state transition on the shared curve.
- **Don't** introduce a second type family, an italic, or an uppercase
  letter-spaced label. General Sans at 200–700 covers the entire ramp.
- **Don't** use an emoji or a glyph where an icon belongs — take a symbol from
  `ui/icons.svg`, or add one to the sprite at 1.75 stroke.
- **Don't** set `fill` on an icon. The only filled glyph in the app is the
  starred star, and it fills with ink rather than with a pale field.
- **Don't** paint a ring's hole a fixed colour — pass `--ring-hole` to match the
  surface it lands on.
- **Don't** animate `width` or `height` on anything that updates per interaction;
  use `transform`.
- **Don't** put readable text inside a generated illustration. The interface
  supplies every word, in the user's own interface language.
