# Design decisions

## Data model

| Decision | Why | Where |
|---|---|---|
| Money as integer micros + ISO currency | Pipeline sums and forecasts never suffer float drift | `Deal.amount_micros`, `models.py` |
| Float `position` per deal | Drag-and-drop inserts a card between two neighbours with one write, no column renumbering | `services.move_deal` |
| `created_by_source` on every record (manual / api / automation / ai / import) | The timeline can say *who or what* made a change, which matters once AI and automations write data | `AuditMixin`, `Actor` |
| Soft delete via `deleted_at` | Deletes are reversible and the history stays intact | `AuditMixin` |
| Polymorphic `ActivityTarget` table | A task or note can attach to any number of records of any type | `ActivityTarget` |
| Append-only `TimelineActivity` with field-level diffs; task/note events fan out as `linked-task.created` | Each record page shows a complete, readable history | `timeline.py` |
| Leads separate from contacts, with a conversion step | Unqualified inbound stays out of the customer base until it's real; conversion reuses existing companies and moves notes/tasks to the new contact | `convert_lead_core` in `api.py` |
| Stage probabilities with a per-deal override | Weighted forecast works out of the box and stays adjustable | `DEAL_STAGES`, `Deal.probability` |

## One write path, many listeners

Every create, update and delete, whether it comes from the UI, the API, an
automation, the AI or the seed import, goes through `services.py`. That
module records the actor and the diff, then emits a `RecordEvent`. The
timeline, lead scoring and the automation engine are independent
subscribers. One generic REST router (`/api/{type}`) serves every object type.

Deliberately out of scope: user-defined custom objects (a fixed schema keeps
the code readable), email/calendar sync, and GraphQL.

## Automations

`trigger event → conditions → actions` stored as JSON, so rules can be built
in the UI, drafted by the AI and validated by the same engine. There's a
recursion guard (`MAX_DEPTH`), per-action savepoints (one failing action is
logged while the rest still run) and dry-run webhooks by default.

## AI layer (Claude Opus 5.5)

* **Copilot agent**: a manual tool-use loop over 9 strict-schema tools (4 read,
  5 write), adaptive thinking at `effort: medium`, server-side refusal
  fallbacks (`fallbacks: "default"`), prompt caching, and an append-only
  transcript per thread.
* **Human in the loop**: read tools run automatically. Any write pauses the
  loop and comes back as a proposal with a status lifecycle (pending →
  success / failed / skipped). The user approves or rejects each one, and
  every tool result from that turn goes back to the model in one message.
* **Record-scoped threads**: a conversation opened from a record starts with
  that record's fields, tasks, notes and recent timeline.
* **Record insights**: structured output (`messages.parse` with Pydantic):
  summary, momentum, risks, next actions (one click turns them into tasks)
  and an email draft.
* **Rules from plain language**: structured output into the automation
  schema, validated by the engine before the user saves it.
* **AI automation step** (`ai_agent`): queued as a job and run by a
  background worker, so saving a record never waits on the model.
* Everything the AI writes carries actor source `ai` and shows on the
  timeline with a ✦ AI badge.

## Original signals

1. **Explainable lead scoring**: every point has a reason shown in the UI
   (`scoring.py`), recomputed on each change by an event listener.
2. **Deal health / next best action**: stale, overdue, no contact, no next
   step, stuck in stage, each with a concrete action (`insights.py`).
