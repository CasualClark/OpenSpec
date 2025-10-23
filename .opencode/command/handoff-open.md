---
description: Load the most recent handoff file from ~/implementation_reports
agent: Orchestrator
---
Locate and show the latest handoff file for: **$ARGUMENTS** (optional).

- Latest path:!`ls -1t ~/implementation_reports/handoff_*.md 2>/dev/null | head -n1 || echo 'none'`
- If present, show the first 80 lines:!`FILE=$(ls -1t ~/implementation_reports/handoff_*.md 2>/dev/null | head -n1); [ -f "$FILE" ] && head -n 80 "$FILE" || true`
Return the path and a succinct summary of Next Steps (if visible).
