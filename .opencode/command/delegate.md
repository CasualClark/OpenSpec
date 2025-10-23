---
description: Quickly delegate a one-liner task to a chosen subagent
agent: Orchestrator
---
Delegate: **$ARGUMENTS**

Format examples:
- Engineer: implement token refresh tests
- Frontend: add loading skeleton to results grid
- Knowledge: compare Redis vs. SQLite cache for icons
- Database: draft migration for user_favorites
- DevOps: add staging smoke-test job
- Generalist: fix flaky test in icons service

Parse the prefix to choose `subagent_type`, then call `task({ description, prompt, subagent_type })` with 1–2 acceptance bullets.
