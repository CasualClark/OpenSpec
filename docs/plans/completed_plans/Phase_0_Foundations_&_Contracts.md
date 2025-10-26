# Phase 0 — Foundations_&_Contracts

_Last updated: 2025-10-23_

## Goals
Establish schemas, error codes, resource names, CI validators, and versioning policy for Task MCP.

## Tasks & RACI (Task MCP)
- **Architect**: Author JSON Schemas for `change.open/*`, `change.archive/*`, `receipt`, `changes://active`.
- **Engineer**: TDD: sample payloads pass schema; negative cases fail with helpful messages.
- **Knowledge**: Write `docs/contracts.md` and `docs/token_policy.md`.
- **Reviewer**: CI job for schema validation + markdown lint.


## Pseudocode / Algorithms
// Python (schema gate)
from jsonschema import Draft202012Validator
def validate_all(samples, schemas):
    for s in samples:
        Draft202012Validator(schemas[s['ref']]).validate(s['data'])


## Deliverables
- `/schemas/*.json`; `docs/contracts.md`; CI pipeline.

## Definition of Done
- CI green; `apiVersion` required by linter on all tool results.
