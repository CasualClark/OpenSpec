---
description: Write provided markdown to ~/implementation_reports/handoff_<DATE>_<DETAIL>.md (for write-enabled agents)
agent: Generalist
---
Write a handoff file to the user's home directory, then return the absolute path.

Inputs:
- Detail for filename: **$ARGUMENTS**
- Content: _Take the first fenced ```markdown block from the user/parent message._

Steps:
1) Compute `DATE=$(date +%F)` and `SLUG=<detail>` lowercased and kebab-cased (only a-z0-9-).
2) `mkdir -p ~/implementation_reports`
3) Save to `~/implementation_reports/handoff_${DATE}_${SLUG}.md`
4) Print the absolute path.

If no content was provided, fail with a helpful message.
