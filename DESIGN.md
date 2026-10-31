# KESHER interface

KESHER is a work tool for people who sell. They open it many times a day,
read numbers in it, and need to trust what changed and who changed it. The
interface is built for that: quiet, dense where it has to be, and explicit
about provenance.

## Dials

| | App | Product page |
|---|---|---|
| Energy | 1, calm. Nothing competes with the data. | 2. One authored moment, nothing more. |
| Rhythm | 2. Sections divided by hairlines, not boxes. | 2. Alternating paper and forest bands. |
| Motion | 1. Press feedback, drawers and dialogs, under 300 ms. | 2. Approved changes land on the sample deal with a wash. |

## The shell

A forest-green rail (`#163a2b`) holds navigation, and the work sits on an
inset paper sheet beside it. The sheet is the only large surface, so every
page has the same frame and the eye always knows where the work is. The
product page repeats the motif: the sample memo lies on a forest band the way
the app's sheet lies on the rail.

The monogram is ק (qof), the first letter of קשר, set in the Hebrew companion
of the UI face.

## Colour

| Role | Light | Dark | Why |
|---|---|---|---|
| Rail | `#163a2b` | `#0d1f17` | A deep green reads as steady and financial without the blue of every other dashboard. |
| Sheet | `#f6f7f3` | `#141d18` | Off-white tinted toward the rail, so the two belong together. |
| Ink | `#142019` | `#e4ebe5` | Never pure black or white. |
| Accent | `#1d5a41` | `#5fae86` | One accent only, used for the primary action, the stage meter and the assistant's mark. |
| Warn, loss | `#8a5210`, `#8e3527` | `#d9a058`, `#e08a78` | Used for health scores and overdue items, always with a word beside them. |

Every text and background pair passes WCAG AA in both themes; the faint
caption colour (`#616d66`) was darkened until it did. The theme follows the
system setting unless the user picks one, and an inline script applies it
before first paint.

## Type

IBM Plex Sans with IBM Plex Sans Hebrew, so English and Hebrew share one
design and one set of metrics. IBM Plex Mono is used only for money, scores
and counts, so figures line up and read as data. Dates use the sans with
tabular figures, which keeps them aligned without making them look like code.
Fonts are self-hosted and subset to Latin and Hebrew.

## Signature: the stage meter

Five ticks fill as a deal advances from New to Won, always with the stage name
beside them. It appears on pipeline lanes, deal cards, record titles and the
product page, so a deal's progress reads the same everywhere. A lost deal
shows empty ticks in the loss colour.

## Provenance

The assistant never borrows decorative colour or sparkle icons. What it wrote
is marked in words: "via assistant" on the timeline, "Drafted by" and the model
name under its read and its memo, and an approval list before any write. Rules
and imports are marked the same way ("via rule", "via import"), so the
assistant is one source among several, not a special effect.

## Rules for new screens

- Divide with hairlines and whitespace before reaching for a card. Cards are
  for things you can pick up: pipeline deals, dialogs.
- Two radii only: 6 px for controls, 10 px for sheets.
- Labels in sentence case, values capitalised as data. No em dashes in copy.
- Counts go through the plural helper; empty, first-run, loading and failed
  states are four different screens.
- Layout uses logical properties only, so every screen mirrors for Hebrew.
- Hover effects only on fine pointers. Under reduced motion, movement stops
  and colour feedback stays.
