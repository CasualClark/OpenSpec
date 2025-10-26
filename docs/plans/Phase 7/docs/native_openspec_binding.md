# Native OpenSpec Binding (Prototype)

## Goal
Replace shelling to `openspec` with a stable in‑process adapter while **preserving existing tool I/O**.

## Strategy
- Introduce `OpenSpecAdapter` interface with methods: `proposal(slug|title)`, `archive(slug)`.
- Default adapter wraps CLI (current behavior).
- Native adapter calls library API or Node module; feature‑flagged.
- Same return shapes; map errors to existing codes.

## Risks & Mitigations
- Version drift: pin `@fission-ai/openspec` version and expose `apiVersion`; fall back to CLI if mismatch.
- Platform issues: keep CLI path as fallback.
- Security: avoid shell injection; sandbox paths as today.

## Tests
- Contract tests run against both adapters.
- Back‑compat CI matrix: flags off/on.
