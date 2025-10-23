---
description: Start a session with crisp goals, constraints, and a plan; optionally seed a kickoff report
agent: Orchestrator
---
We're starting a new working session: **$ARGUMENTS**

Collect quick context:
- Date: !`date +%F`
- Branch: !`git rev-parse --abbrev-ref HEAD`
- Open PRs (last 10):!`git log --grep='Merge pull request' -n 10 || echo 'n/a'`

Do:
1) Capture **Session Goals** (3–5 bullets, measurable).
2) Note **Constraints** (timebox, dependencies, reviewers, environments).
3) Outline **Plan** (parallelizable 1–4h tasks).
4) Identify **Risks** and mitigations.
5) If useful, draft a `kickoff_<DATE>_<DETAIL>.md` in `~/implementation_reports` via `handoff_create` with an empty summary and the planned next steps.
Return a compact plan summary and the optional kickoff file path.
