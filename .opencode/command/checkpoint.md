---
description: Save a mid-session checkpoint to ~/implementation_reports via Generalist
agent: Orchestrator
---
Create a checkpoint for: **$ARGUMENTS**

Collect context:
- Date: !`date +%F`
- Branch: !`git rev-parse --abbrev-ref HEAD`
- Status:!`git status --porcelain`
- Recent commits:!`git log --pretty=format:'%h %ad %s' --date=short -n 5`

Action:
- Write a short summary and 3–5 next steps.
- Delegate a child task to **Generalist** to save `handoff_<DATE>_<detail>-checkpoint.md` in `~/implementation_reports` using the same write procedure as `/handoff`.
Return the expected path.
