---
description: Resume from the latest handoff and translate Next Steps into parallel tasks
agent: Orchestrator
---
Resume the session: **$ARGUMENTS**

1) Latest handoff path:!`ls -1t ~/implementation_reports/handoff_*.md 2>/dev/null | head -n1 || echo 'none'`
2) Read it (first 200 lines):!`FILE=$(ls -1t ~/implementation_reports/handoff_*.md 2>/dev/null | head -n1); [ -f "$FILE" ] && head -n 200 "$FILE" || true`
3) Extract **Next Steps** and convert each into a task (≤4h) with subagent assignment.
4) Launch ready tasks in parallel; list blockers and dependencies.
Return: a short “we’re rolling” plan and a table of tasks.
