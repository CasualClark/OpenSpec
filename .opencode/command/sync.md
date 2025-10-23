---
description: Summarize progress across child sessions and surface blockers
agent: Orchestrator
---
Roll up current progress for: **$ARGUMENTS**

Do:
1) Query child tasks created via the task tool in this session (or infer from recent context).
2) For each, summarize latest status, artifacts, and blockers.
3) Produce a concise status report with a **Now / Next / Risks** view.
4) If all meaningful work is complete, propose `/handoff $ARGUMENTS`.
