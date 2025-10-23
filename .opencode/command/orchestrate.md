---
description: Fan-out parallel tasks to subagents and track them using the task tool
agent: Orchestrator
---
Coordinate parallel work for: **$ARGUMENTS**

1) Read the repo and any active specs to understand context.
2) Propose a minimal plan and decompose into **tasks** (≤4h each)
3) Assign across Engineer, Frontend, Knowledge, Database, DevOps, Review, and Generalist agents.
4) For each task, emit an object with: description, prompt, subagent_type, provides, depends_on, acceptance.
5) Start all tasks with **no dependencies** in parallel using `task({ description, prompt, subagent_type })`—one call per task.
6) After dispatch, summarize what's running and what's blocked; list the expected acceptance signals.
