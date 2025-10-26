# CHANGELOG Appender (from receipts)

## Inputs
- `receipt.json` (from archive): `{ commits[], filesTouched[], tests{{}}, archivedAt }`.
- Optional flags: `--unreleased`, `--version 1.2.3`, `--date YYYY-MM-DD`.

## Behavior
- Create `CHANGELOG.md` if missing.
- Format per **Keep a Changelog** with sections: `Added`, `Changed`, `Fixed`.
- Derive entries from `receipt`:
  - `Added`: new specs/tests detected.
  - `Changed`: filesTouched under `openspec/specs/**`.
  - `Fixed`: when tests.updated > 0 with `passed: true`.
- Append under `## [Unreleased]` or version section.
- Ensure idempotence using hidden anchors or receipt hash.

## Pseudocode
```pseudo
r = read_json(receipt.json)
ver = argv.version or "Unreleased"
sec = ensure_section(changelog, ver, date=argv.date or today())
items = derive_entries(r)
append_items(sec, items, dedupe_with=sha256(r))
write(changelog)
```
