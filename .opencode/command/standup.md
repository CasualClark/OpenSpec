---
description: Create a human-friendly standup update from recent work
agent: Orchestrator
---
Create a standup for: **$ARGUMENTS**

Inputs:
- Recent commits:!`git log --pretty=format:'%h %ad %s' --date=short -n 15`
- Status:!`git status --porcelain`
- Most recent handoff (if present) via `handoff_latest`

Output:
- **Yesterday**: concise highlights
- **Today**: concrete goals (1–4h each)
- **Blockers**: specific asks
Keep it honest and specific; include links/paths where applicable.
