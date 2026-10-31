# Redline interface

Redline is a work tool for people who sell. They open it many times a day,
read numbers in it, and need to trust what changed and who changed it. The
interface is calm and light so the numbers carry the page, and it is explicit
about what the assistant wants to change before anything is written.

## The frame

A horizontal bar on top: the mark, the product name, the sections as pills,
and four round glass buttons on the right (search, changes to review, the
assistant, the account menu). The section you are in is a lifted white pill.
Under it, the work sits on frosted white glass cards with a 28 px radius, over
a cool gray ground with soft light falling across it. There is no sidebar, so
the table gets the full width.

The mark is a short teal stroke on a glass tile: the red line a reviewer draws
through the old value.

## Colour

| Role | Light | Dark | Why |
|---|---|---|---|
| Ground | `#eceef3` with four soft radial lights | `#111317` | Cool and neutral, so glass reads as glass and colour is reserved for meaning. |
| Glass card | white at 68%, 30 px blur, a bright 1 px rim | `rgb(34 37 44 / 0.62)` | Depth without boxes or heavy borders. |
| Ink | `#17181c`, `#5f626b`, `#868994` | `#eceef2`, `#a5a9b3`, `#7f838d` | Three steps, never pure black. |
| Accent | `#0e6b66` | `#5cbcb2` | One deep teal for the primary action, the assistant, approval and proposed values. Calm and positive; red was rejected because it reads as a warning. |
| Late | `#a8641c` | `#dba062` | Amber, only for overdue dates, quiet deals and deal health. |

Every text pair passes WCAG AA. The theme follows the system setting unless
the user picks one in the account menu.

## Type

Instrument Sans at 400 and 500, with 600 only for the product name and for
values in the approval list. Headings are large and light (32 px, weight 500,
tight tracking) rather than bold. Hebrew uses Heebo. Figures use tabular
numerals in the same face, never a monospace.

## The deals screen

This is the screen the rest follows.

- **Saved views** as text pills: Open, Mine, Closing this month, Gone quiet,
  Won, each with its count. "N changes to review" sits at the end as teal text
  with a dot, not a badge.
- **Proposed values in the cells.** When the assistant has a pending change,
  the old value is struck through in gray and the new one is underlined with
  a 1.5 px teal line, in the stage, amount, close date and next step columns.
  No avatars, no icons in rows.
- **The selected row lifts**: an opaque white rounded row with a soft shadow.
  No tint and no coloured bar.
- **The approval card**: a teal glass card that quotes the call notes, then a
  white inner list with one teal square tick per change. Each field can be
  taken or left on its own. "Apply N changes" is a light pill with teal text;
  "Discard" is outlined.
- **The info card** under it: contact, company, owner, win chance, stage and
  the last few timeline events, with a teal dot on what the assistant did.
- With nothing waiting, the same column offers "Log a call": paste notes, and
  the assistant drafts the changes into the card above.

## Controls

- Buttons are pills. The primary action is a teal gradient pill with a soft
  coloured shadow; secondary actions are white glass pills; quiet actions are
  text that gains a glass pill on hover.
- Icons are thin (light weight) and sit in 42 px glass circles in the top bar.
- Stage is a glass pill with a hairline border. Won is teal, lost is gray.
- Segmented controls (Table / Board, theme) are a glass track with a white
  lifted segment.

## Provenance

What the assistant wrote is marked in words and in teal: "via assistant" on
the timeline, "Drafted by" and the model name under its read and its memo, and
the approval card before any write. Rules and imports are marked the same way
("via rule", "via import").

## Rules for new screens

- Put a page on one glass card; divide inside it with hairlines and spacing.
  Nested surfaces (side columns, figure tiles, lanes) are lighter glass with
  an 18 to 22 px radius.
- Radii: 28 px cards, 18 to 22 px inner surfaces, 12 px fields, pills for
  buttons, chips and tabs.
- Teal means action, assistant or approval. Amber means late. Nothing else is
  coloured.
- Labels in sentence case. No em dashes in copy.
- Counts go through the plural helper; empty, first-run, loading and failed
  states are four different screens.
- Layout uses logical properties only, so every screen mirrors for Hebrew.
- Hover effects only on fine pointers. Under reduced motion, movement stops
  and colour feedback stays.
