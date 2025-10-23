---
description: Create a robust end-of-session handoff and save it to ~/implementation_reports
agent: Orchestrator
---
We are creating a durable **handoff** package for the next session.

Detail (for filename): **$ARGUMENTS**

Collect quick repo context:
- Date: !`date +%F`
- Branch: !`git rev-parse --abbrev-ref HEAD`
- HEAD: !`git log --pretty=format:'%h %ad %s' --date=short -n 1`
- Recent commits:!`git log --pretty=format:'%h %ad %s' --date=short -n 10`
- Changed files (24h):!`git log --since='24 hours ago' --name-only --pretty='' | sort -u`
- Status:!`git status --porcelain`
- Test summary (best effort):!`pytest -q || echo 'pytest not available or failing'`

Do this:
1) Summarize the just-completed session in 5–10 lines.
2) Draft actionable **Next Steps** (3–7 items, 1–4h each) with acceptance checks.
3) List **Relevant Files & Artifacts** (use changed files list, key specs/PRs/diagrams).
4) Capture **Decisions & Rationale**.
5) Identify **Risks/Blockers** and mitigations.
6) Assemble the final markdown content.

Then **delegate a child task** to **Generalist** to persist the file (since Orchestrator is read-only to code):

- Describe the filename rule `handoff_<YYYY-MM-DD>_<detail>.md` under `~/implementation_reports`.
- Provide the complete markdown in a fenced block.
- Ask Generalist to:
  - `mkdir -p ~/implementation_reports`
  - Compute today's date and a safe slug from `<detail>`
  - Write the content to the path and return the absolute path.

**Acceptance for the child task:**
- The file exists at `~/implementation_reports/handoff_<DATE>_<slug>.md`
- The file contains the headings: "Last Session Summary", "Next Steps", "Relevant Files & Artifacts"

If writing fails, return the full markdown content and the intended path for manual save.
