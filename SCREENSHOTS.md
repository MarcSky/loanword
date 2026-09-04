# The trainer, screen by screen

Nine screenshots from a real `en → de` deck — 143 cards, none of them chosen
by anyone but the work. Nothing here is a mock-up, which is why the numbers are
as unflattering as they were on the day.

## Overview

![One card due right now, the daily-goal ring at zero of fifteen minutes, and four numbers underneath](images/screens/overview.webp)

The first thing you see is one number, and it is usually small. The ring counts
minutes, not cards, because fifteen minutes is a promise you can keep and
"twenty cards" is not. *Your level* is a dash until a hundred first answers have
paid for it — the trainer would rather say nothing than guess. Behind the second
button, 142 words are still queued from last week's sessions.

## Deck

![The deck screen: 143 cards, filters for state, category and CEFR level, and the word list underneath](images/screens/deck.webp)

Everything you have ever reached for, in one table. *29 repeated meanings*
is not a bug report: `Abstand` is whitespace in one session and a gap in the
next, and both cards stay, because you met both. Filter by state, by category,
by level; edit in place; star what matters; export the lot to Anki when you
want it somewhere else.

## Practice

![Flashcards mode showing the German word Duplikat, tagged Engineering and B2, card 1 of 143](images/screens/practice.webp)

Three ways to drill that never touch the schedule. `Duplikat` is tagged
*Engineering* and *B2* because that is where it was met — a code review, not a
textbook. Flip through the whole pile, run Learn mode until the misses stop, or
sit an actual test. FSRS does not watch any of it, so you can be as wrong as you
like in here.

## Study

![The study screen asking how long you have got: five, ten or fifteen minutes, one card to review and 142 new, with the categories underneath](images/screens/study.webp)

The only question the trainer asks before a session is how long you have got.
Everything else it works out: how many of the 142 new words fit in fifteen
minutes next to the one review that is actually due, and in what order. A new
card is shown once with both sides, then comes back three to five cards later as
a typed question — nothing is graded before you have produced it once. The
keys are on the screen because you will want them on the second day, not the
first.

## Analytics

![The analytics screen: due now, reviewed today, long-term memory, retention and average session, filtered by category and level](images/screens/analytics.webp)

Every number comes from your own review log, and there is a table behind every
chart. Nothing is modelled, inferred or phoned home — 0% retention on day one
means you have answered nothing yet, not that the algorithm is disappointed in
you. Copy the lot as Markdown, or take the CSV.

## Settings — languages

![The languages panel: an en to de deck with 143 cards, an en to es deck with 32, and a capture switch per language](images/screens/settings.webp)

Each `native → target` pair is its own deck with its own schedule; opening one
never disturbs the other. The switches below are separate on purpose: you can
learn German and capture into Spanish at the same time, from the same day's
work.

## Adding a language

![The Add a language dialog, pairing English with Hindi](images/screens/settings-new-profile.webp)

A deck is a pair, and the two halves can never be the same. Thirty-five
languages in thirteen scripts, so `en → hi` is one dialog and no setup — a new
script also offers its alphabet as a starter deck, which beats an empty screen.

## Switching decks

![The header deck picker open, showing Deutsch with 1 due and Español with 32 cards, over the category board](images/screens/profile-chose.webp)

The picker lives in the header because switching is a thing you do mid-session,
not a thing you configure. Behind it, the deck grouped the way you actually met
it: 116 words from Engineering, 21 from Everyday, and *Connectors* still saying
"Nothing here yet" — an honest empty state instead of a zero.

## What the cards cost

![The spend panel: 101 calls over seven days, tokens in and out, broken down into 98 Haiku calls and 3 Sonnet calls](images/screens/settings-spent.webp)

Every call to `claude -p` is logged with its tokens and its cost, per model,
over one, seven or thirty days. Ninety-eight of these hundred-and-one calls were
Haiku doing the filing; Sonnet was asked three times, for the writing that
needed it. You picked the model, so you get to see the bill.
