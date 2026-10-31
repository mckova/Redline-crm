# Redline CRM

[![CI](https://github.com/mckova/kesher-crm/actions/workflows/ci.yml/badge.svg)](https://github.com/mckova/kesher-crm/actions/workflows/ci.yml)

**A sales CRM with an assistant that asks before it writes.** Paste the notes
from a call and the assistant drafts the CRM changes: the stage, the amount,
the close date, the follow-up task. Nothing is written until you approve each
one. Every morning it writes a short memo of where to start. Under it is an
event-driven core: every change lands on a timeline with its source, can
trigger rules, and feeds lead scores and deal health. English and Hebrew (RTL).


![Deals, with the assistant's changes waiting for approval](docs/screenshots/02-deals.png)

## The assistant (Claude Opus 5.5)

On the deals table, what the assistant took from a call sits in the cells
themselves: the old value struck through, the new one underlined in teal. The
column on the right quotes the notes and lists each change with its own tick,
so you can take the amount and the close date and leave the stage.

| Untick what you don't want | Applied, with the source on the timeline |
|---|---|
| ![Approval](docs/screenshots/03-approval.png) | ![Applied](docs/screenshots/04-applied.png) |

| Today: the morning memo | Product page |
|---|---|
| ![Today](docs/screenshots/05-today.png) | ![Product page](docs/screenshots/01-product-page.png) |

- **Morning memo**: the assistant reads a snapshot of the pipeline (deal health, the largest open deals, overdue tasks, hot leads, forecast) and writes a one-line lede and three to five numbered places to start, each linked to its record. Memos are kept per language.
- **Changes from a call, in the table**: paste call notes on a deal ("Log a call") and the assistant proposes the stage, amount, close date, a note and the next task. Proposals show inline in the deals table and wait in an approval card; each field can be accepted on its own.
- **Assistant panel**: a chat agent with tools over the whole CRM. It searches, lists, reads records with their timelines and checks the pipeline on its own. Every write (create or update records, tasks, notes, lead conversion) pauses as a proposal you approve or discard. Opened from a record, it starts with that record's context.
- **Proactive reads**: when a lead is created or a deal changes stage, a background job prepares the assistant's read, so it is waiting when a rep opens the record.
- **The assistant's read on every record**: a summary, momentum, risks grounded in the timeline, next steps that become tasks in one click, and a follow-up email draft, in English or Hebrew.
- **Rules in plain language**: describe a rule in English or Hebrew, the assistant drafts the trigger, conditions and actions, and the engine validates the draft before you save it.
- **Assistant step in a rule** (`ai_agent`): a rule can hand a record to the assistant with instructions ("write a negotiation brief and a review task"). It runs on a background worker, so saving a record never waits on the model.
- **Provenance**: every change shows who made it, by hand, by a rule, by import or via the assistant, with the field before and after. Anything the assistant wrote names the model that drafted it.
- **Model setup**: `claude-opus-5-5` with adaptive thinking and a set `effort` per feature (`medium` for the panel, reads and memo, `low` for drafting and rule steps). Strict tool schemas, structured outputs via Pydantic, server-side refusal fallbacks (`fallbacks: "default"`) and prompt caching.

**Try it without an API key.** With no `ANTHROPIC_API_KEY`, Redline runs the assistant in *demo mode*: an offline stand-in that speaks the same API shape and drives the real agent loop, approval list, background jobs and structured outputs, using simple rules over your CRM data. Everything it writes is labelled "Drafted by the offline demo assistant". Set a key and the same screens use Claude. The screenshots here were taken in demo mode.

## Features

| Pipeline (drag and drop) | Lead score with reasons |
|---|---|
| ![Pipeline](docs/screenshots/07-pipeline.png) | ![Lead](docs/screenshots/08-lead.png) |
| **Deal with the assistant's read and timeline** | **Rules, written out in plain language** |
| ![Deal](docs/screenshots/06-deal.png) | ![Rules](docs/screenshots/09-rules.png) |

- **Companies, people, leads, deals, tasks, notes**: full CRUD, soft delete, sort and filter, plus global search (Ctrl K or ⌘ K).
- **Deals as a table or a board**: saved views (open, mine, closing this month, gone quiet, won) with the next step and the last touch on every row, late dates in amber, and totals for the view. The board is drag and drop between stages and within a column; fractional positions make every move one write.
- **Timeline on every record**: who changed what, with a field-level diff. Task and note events also appear on every record they're linked to.
- **Lead conversion**: one click turns a lead into a company, a contact and a deal, reusing an existing company and moving the lead's notes and tasks.
- **Lead scoring (0 to 100, grades A to D)**: every point comes with a reason, recomputed on every edit.
- **Deal health**: flags stale deals, a passed close date, a missing contact, no next step, or a deal stuck in one stage, each with a concrete next action.
- **No-code rules**: *when* a deal is updated, *if* the stage changes to Proposal, *then* create a task, add a note, update a field, call a webhook or run an assistant step. Each rule is shown as a plain sentence, with a run log, loop protection and per-action error isolation.
- **Today**: the memo, deals that need attention, open pipeline, weighted forecast, win rate, sales cycle, value by stage, lead-source conversion and 14 days of timeline activity.
- **Hebrew and English**: a full RTL interface from one stylesheet built on logical properties. Switch from the account menu or the product page.
- **Light and dark themes**, or follow the system setting.
- **Product page**: a working copy of the approval flow on a sample deal that runs in the browser, a sample memo, and the real sign-in form.
- **Accessible by default**: focus-trapped dialogs, alert dialogs for destructive actions, keyboard-reachable rows and sort controls, labelled icon buttons, live regions for the assistant, skeleton loading and a distinct state for a failed load. Colour pairs meet WCAG AA in both themes.
- **Auth**: JWT bearer tokens, PBKDF2 password hashing, admin and sales roles.

| Hebrew, right to left | Dark theme | Mobile |
|---|---|---|
| ![Hebrew](docs/screenshots/10-hebrew.png) | ![Dark](docs/screenshots/11-dark.png) | <img src="docs/screenshots/12-mobile.png" width="220" alt="Deals on a phone"> |

## Architecture

```
React (Vite, TS, en/he)  ──REST──►  FastAPI
                                      │
                            services.py  ← the single write path
                                      │ emits RecordEvent(name, record, actor, diff)
       ┌──────────────────┬───────────┼──────────────┬──────────────────────┐
  timeline.py        scoring.py   automations.py   ai.py (proactive insight jobs)
 (activity + diff)  (lead score) (trigger → if → then, ai_agent step)
                                      │
                      AI worker thread ── Claude Opus 5.5 (or demo client)
                                      │
                         SQLAlchemy 2 · SQLite / Postgres
```

Every mutation, whether it comes from the UI, the API, an automation, the AI or
the seed import, goes through `services.py`. That module records the actor and
the diff, then emits an event. The timeline, scoring, automations and the AI's
proactive analysis are independent subscribers. Design decisions are written up
in [docs/design.md](docs/design.md), the interface in [DESIGN.md](DESIGN.md).

```
backend/app/
  models.py       domain model (money in micros, actor source, soft delete, polymorphic targets)
  services.py     CRUD + event bus + kanban positioning
  timeline.py     activity log writer with linked-record fan-out
  scoring.py      explainable lead scoring
  automations.py  rule engine (conditions, actions, templates, loop guard)
  insights.py     deal health + dashboard aggregates
  ai.py           assistant agent, record reads, morning memo, rule drafting, background jobs
  demo_ai.py      offline stand-in used when no API key is set
  ai_api.py       /api/ai/* endpoints
  api.py          generic /api/{type} router + convert / move / pipeline / automations
  seed.py         deterministic demo workspace
backend/tests/    30 end-to-end API tests (CRM, the assistant with a scripted client, demo mode)
frontend/src/     React app: product page, Today, pipeline, lists, record page, rules, assistant panel
```

## Run it

**Docker**

```bash
docker compose up --build
# http://localhost:8000  ·  admin@redline.dev / demo1234
# AI runs in demo mode; export ANTHROPIC_API_KEY first to use Claude
```

**Locally**

```bash
cd frontend && npm install && npm run build && cd ..
cd backend && pip install -r requirements.txt
uvicorn app.main:app --reload            # serves API + built frontend on :8000
```

**On PostgreSQL**

SQLite is the default so the demo starts with nothing installed. For a real database, point the app at Postgres; the tables are created on first start and the demo workspace is seeded once.

```bash
docker compose -f compose.postgres.yaml up --build      # app + Postgres 16
# or, with your own server:
REDLINE_DATABASE_URL=postgresql://user:pass@host:5432/redline uvicorn app.main:app
```

`postgres://` and `postgresql://` URLs are accepted as hosted databases hand them out. The driver (`psycopg`) is in `requirements.txt`.

For frontend hot reload, run `npm run dev` in `frontend/`. It proxies `/api` to `:8000`.

On first start the app seeds a demo workspace: 12 companies, about 25 people, 30 deals, 20 leads, tasks, notes and automation rules. Set `REDLINE_SEED=off` to start empty.

| Env var | Default | Purpose |
|---|---|---|
| `ANTHROPIC_API_KEY` | not set | Turns on Claude for the assistant panel, record reads, memo, rule drafting and assistant steps |
| `REDLINE_AI` | `auto` | `auto` (Claude with a key, demo without), `on`, `demo` or `off` |
| `REDLINE_AI_MODEL` | `claude-opus-5-5` | Claude model for all assistant features |
| `REDLINE_AI_AUTO_INSIGHTS` | `on` | Background analysis of new leads and stage changes |
| `REDLINE_DATABASE_URL` | `sqlite:///./redline.db` | SQLite or PostgreSQL (`postgresql://user:pass@host/db`) |
| `REDLINE_SECRET` | dev value | JWT signing key: **set in production** |
| `REDLINE_WEBHOOKS` | `off` | `on` to actually POST webhook actions (otherwise dry-run, logged) |
| `REDLINE_SEED` | `on` | Seed demo data on an empty DB |

## Tests

```bash
cd backend && python -m pytest -q
```

```bash
REDLINE_TEST_DATABASE_URL=postgresql://postgres@localhost/redline_test python -m pytest -q   # same suite on PostgreSQL
```

31 tests cover CRUD and soft delete, timeline diffs, linked-record fan-out, kanban reordering, scoring, lead conversion, automations (happy path, loop protection, failing-action isolation, validation), dashboard math, search and seeding; the AI layer with a scripted model client (tool loop, approvals and rejections, structured outputs, refusals, background steps, strict tool schemas); and demo mode end to end (the assistant panel in English and Hebrew, record read, memo per language, rule drafting, background reads). CI runs the tests and the frontend build on every push.

**Browser walkthrough.** `e2e/walkthrough.js` drives the whole product in a real browser, 42 steps from the product page and sign-in through deals, the call-notes approval flow, the board, leads and conversion, tasks, rules, search, themes, Hebrew, mobile widths and sign-out, and checks the results through the API. It needs the server running on seeded data (the offline demo assistant is enough) and the `playwright` package:

```bash
BASE=http://localhost:8000 node e2e/walkthrough.js /tmp/redline-e2e/
```

## API sketch

| Method | Path | |
|---|---|---|
| `POST` | `/api/auth/login` | → `{token}` |
| `GET/POST` | `/api/{companies,contacts,leads,deals,tasks,notes}` | list (`q`, `sort`, `filters=stage:WON`) / create (`targets` for tasks/notes) |
| `GET/PATCH/DELETE` | `/api/{type}/{id}` | detail includes related records and deal health |
| `GET` | `/api/{type}/{id}/timeline` | activity feed with diffs |
| `GET` | `/api/pipeline` · `POST /api/deals/{id}/move` | kanban |
| `POST` | `/api/leads/{id}/convert` | lead → company + contact + deal |
| `GET/POST/PATCH/DELETE` | `/api/automations` · `GET /api/automations/runs` | rules and run log |
| `GET` | `/api/dashboard` · `/api/search?q=` | analytics, global search |
| `GET` | `/api/ai/status` | `{enabled, mode, model}` |
| `POST` | `/api/ai/threads` · `/api/ai/threads/{id}/messages` · `/resolve` | assistant conversation, approve or discard proposals |
| `GET/POST` | `/api/ai/briefing?lang=` · `/api/ai/insights/{type}/{id}?lang=` | morning memo, record read |
| `POST` | `/api/ai/automation-draft` · `GET /api/ai/jobs` | rule from plain language, background jobs |

Interactive docs: `http://localhost:8000/docs`.

## License

MIT
