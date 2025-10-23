
# 01_VISION_AND_GOALS.md

## Vision

Give agents a **single, unambiguous lane** for planning and shipping changes: open a scoped change, work against concrete repo files (proposal/tasks/spec deltas), then archive into living specs—**without** dumping huge text blobs into prompts. OpenSpec is our file-first backbone; the **Task MCP** is the agent control plane.

- OpenSpec is **local-first, open-source, and doesn’t require API keys or MCP**, with native slash-commands in multiple tools—ideal for human ergonomics. We keep that, but we give agents a clean MCP surface. ([openspec.dev](https://openspec.dev/?utm_source=chatgpt.com "OpenSpec — A lightweight spec‑driven framework"))
    
- Claude Code & other MCP clients understand **resources** and can fetch referenced artifacts by `@server:protocol://path`, attaching them without bloating the prompt. ([Claude Docs](https://docs.claude.com/en/docs/claude-code/mcp?utm_source=chatgpt.com "Connect Claude Code to tools via MCP - Claude Docs"))
    
- The Anthropic **MCP connector** lets API callers connect to HTTP/SSE MCP servers directly; **only tool calls are supported** (no resources), so we keep tool outputs compact and return stable repo paths/URIs. ([Claude Docs](https://docs.anthropic.com/en/docs/agents-and-tools/mcp-connector?utm_source=chatgpt.com "MCP connector - Anthropic"))
    

## Goals

1. **Minimal agent surface**: 2 tools only
    
    - `change.open` (create or resume a change)
        
    - `change.archive` (close the change, emit a receipt)
        
2. **Zero duplication**: All editing remains repo-native via OpenSpec’s structure.
    
3. **Token discipline**: Use MCP resources in IDE flows and compact JSON in API flows (plus pagination if ever needed). Claude Code has a default **25k token** MCP tool-output limit; we stay well under it. ([anthropic.mintlify.app](https://anthropic.mintlify.app/en/docs/claude-code/mcp?utm_source=chatgpt.com "Connect Claude Code to tools via MCP - Claude Docs"))
    
4. **Interoperability**: Works in Claude Code (stdio) and via the Messages API (HTTP/SSE) using the MCP connector. ([Claude Docs](https://docs.anthropic.com/en/docs/agents-and-tools/mcp-connector?utm_source=chatgpt.com "MCP connector - Anthropic"))
    

## Non-Goals (for v1)

- Task CRUD beyond open/close (editing is file-based)
    
- Web UI/database—repo remains the source of truth
    
- Heavy server state—keep it stateless beyond receipts
    

---

# 02_ARCHITECTURE.md

## High-Level

```
Agent/Client (Claude Code / Messages API)
         │
         │ MCP (stdio or HTTP/SSE)
         ▼
Task MCP (our server)
  ├─ Tools: change.open, change.archive
  ├─ Resources (IDE/stdio only):
  │     changes://active
  │     change://{slug}/proposal
  │     change://{slug}/tasks
  │     change://{slug}/delta/**
  └─ OpenSpec CLI (v1) → proposal/archive, repo I/O
```

### Why OpenSpec as the backbone

- OpenSpec formalizes “**proposal → implement → archive back into specs**,” is **local, no API keys/MCP**, and ships native slash commands (great for humans). We wrap just the edges for agents. ([openspec.dev](https://openspec.dev/?utm_source=chatgpt.com "OpenSpec — A lightweight spec‑driven framework"))
    

### Why MCP resources

- Claude Code can **@-mention MCP resources**; the client **auto-fetches** the content and attaches it—no manual pasting, no giant tool payloads. ([Claude Docs](https://docs.claude.com/en/docs/claude-code/mcp?utm_source=chatgpt.com "Connect Claude Code to tools via MCP - Claude Docs"))
    

### Why two tools only

- Tool calls are ideal for **actions**, resources for **data**. The **Messages API MCP connector** currently supports **tools only** over HTTP/SSE and requires a publicly exposed server; by keeping tools minimal and outputs small, we work in both IDE and API contexts. ([Claude Docs](https://docs.anthropic.com/en/docs/agents-and-tools/mcp-connector?utm_source=chatgpt.com "MCP connector - Anthropic"))
    

---

# 03_TASK_MCP_API.md

## Tools

### `change.open`

Idempotently create or resume a change folder.

**Input**

```json
{ "title": "Add profile filters", "slug": "add-profile-filters", "rationale": "UX need" }
```

**Output (compact)**

```json
{
  "slug": "add-profile-filters",
  "status": "draft",
  "paths": {
    "root": "openspec/changes/add-profile-filters/",
    "proposal": "openspec/changes/add-profile-filters/proposal.md",
    "tasks": "openspec/changes/add-profile-filters/tasks.md",
    "delta": "openspec/changes/add-profile-filters/specs/"
  },
  "resourceUris": {
    "proposal": "change://add-profile-filters/proposal",
    "tasks": "change://add-profile-filters/tasks",
    "delta": "change://add-profile-filters/delta/"
  }
}
```

**Semantics**

- If `slug` exists and isn’t archived, return it (no error).
    
- **CLI** (v1): shell out to `openspec proposal <title|slug>`; map stdout/exit codes.
    
- **Token hygiene**: the tool returns **paths + URIs** only; content is fetched as resources in IDE flows. Claude Code supports @-mentioning those URIs. ([Claude Docs](https://docs.claude.com/en/docs/claude-code/mcp?utm_source=chatgpt.com "Connect Claude Code to tools via MCP - Claude Docs"))
    

---

### `change.archive`

Close the change and emit a **Change Receipt**.

**Input**

```json
{ "slug": "add-profile-filters" }
```

**Output**

```json
{
  "slug":"add-profile-filters",
  "archived": true,
  "receipt": {
    "commits": ["8c2e7fa"],
    "filesTouched": ["src/search/ProfileService.ts","openspec/specs/search.yml"],
    "tests": { "added": 2, "updated": 1, "passed": true }
  }
}
```

**Semantics**

- Run `openspec archive <slug> --yes`.
    
- Persist `receipt.json` under the change folder and return a compact copy.
    
- **Token hygiene**: do not inline diffs; clients can open the paths or use resources.
    

---

## Resources (stdio/IDE flows)

- `changes://active` → list of `{ slug, title, status, paths }`
    
- `change://{slug}/proposal` → `proposal.md`
    
- `change://{slug}/tasks` → `tasks.md`
    
- `change://{slug}/delta/**` → files under `changes/<slug>/specs/`
    

**Claude Code behavior**

- Type `@` to discover resources and **attach them automatically**; the attachments are not “free text” injected into the prompt—you reference exactly what’s needed. ([Claude Docs](https://docs.claude.com/en/docs/claude-code/mcp?utm_source=chatgpt.com "Connect Claude Code to tools via MCP - Claude Docs"))
    

> **API note**: Anthropic’s **MCP connector (Messages API)** supports **tools-only** and requires an **HTTP/SSE** server; it can’t fetch resources. Keep outputs compact and return paths the host can access. ([Claude Docs](https://docs.anthropic.com/en/docs/agents-and-tools/mcp-connector?utm_source=chatgpt.com "MCP connector - Anthropic"))

---

# 04_PROJECT_TRACKING.md

## State of a Change (in repo)

```
openspec/changes/<slug>/
  ├─ proposal.md
  ├─ tasks.md
  ├─ specs/             # spec delta files (to be merged on archive)
  └─ receipt.json       # written on archive
```

- The repo is the **source of truth**; OpenSpec’s archive step **merges deltas back into `openspec/specs/**`** so the living spec stays current. ([openspec.dev](https://openspec.dev/?utm_source=chatgpt.com "OpenSpec — A lightweight spec‑driven framework"))
    

## Receipts (lightweight audit)

`receipt.json` contains:

- `commits[]` touching the change
    
- `filesTouched[]`
    
- `tests{added,updated,passed}`
    
- `archivedAt` ISO date
    

Use receipts to populate **CHANGELOG** entries or dashboards (later), without running a DB.

## IDE workflow (Claude Code)

- `@task:change://my-change/proposal` to attach proposal text.
    
- `@task:change://my-change/tasks` to attach task list.
    
- Tools:
    
    - `/mcp__task__change_open "..."`
        
    - `/mcp__task__change_archive my-change`
        
- Claude Code **auto-fetches** these resources as attachments; you don’t paste contents manually. ([Claude Docs](https://docs.claude.com/en/docs/claude-code/mcp?utm_source=chatgpt.com "Connect Claude Code to tools via MCP - Claude Docs"))
    

## API workflow (Messages API)

- Provide `mcp_servers` with your Task MCP’s **public HTTP/SSE URL**.
    
- Call `change.open`/`change.archive` directly via the **MCP connector**.
    
- Because connector is **tools-only**, keep responses small and let your build agents read files via the repo (CI workspace, Git provider, or a separate file tool). ([Claude Docs](https://docs.anthropic.com/en/docs/agents-and-tools/mcp-connector?utm_source=chatgpt.com "MCP connector - Anthropic"))
    

---

# 05_TOKEN_ECONOMY.md

## Why this reduces tokens in practice

1. **Resources instead of dumps (IDE)**
    
    - Claude Code **fetches resource content out-of-band** when you `@` reference URIs; tool outputs stay small. This prevents ballooning messages with raw file contents. ([Claude Docs](https://docs.claude.com/en/docs/claude-code/mcp?utm_source=chatgpt.com "Connect Claude Code to tools via MCP - Claude Docs"))
        
2. **Compact tool I/O (API)**
    
    - The **MCP connector** is tools-only, so we standardize on **tiny JSON**: paths, slugs, and receipts. If you do need large content, return a **handle** to fetch separately. ([Claude Docs](https://docs.anthropic.com/en/docs/agents-and-tools/mcp-connector?utm_source=chatgpt.com "MCP connector - Anthropic"))
        
3. **Output caps & pagination**
    
    - Claude Code defaults to **25k max tool tokens**; we design to stay far below that (and chunk if we ever need to exceed). ([anthropic.mintlify.app](https://anthropic.mintlify.app/en/docs/claude-code/mcp?utm_source=chatgpt.com "Connect Claude Code to tools via MCP - Claude Docs"))
        

## Practical patterns

- **Never** inline the full proposal/tasks in a tool result; return **resource URIs** + paths.
    
- If listing many changes, **paginate**: `changes://active?page=2`.
    
- Large diffs? Summarize in the receipt, write the diff to disk (or leave it in Git), and return the path.
    

---

# 06_CAPABILITIES.md

### What agents can do (now)

- Create/resume a change (`change.open`)
    
- Read proposal/tasks/spec-delta **via resources** (IDE) or repo paths (API)
    
- Archive a change and produce a receipt (`change.archive`)
    

### What humans can do (now)

- Use OpenSpec’s **slash-commands/CLI** to author proposal/tasks and run archive locally—no keys needed. ([openspec.dev](https://openspec.dev/?utm_source=chatgpt.com "OpenSpec — A lightweight spec‑driven framework"))
    

### What we can add (later)

- `change.list` tool (if a client doesn’t enumerate resources well)
    
- **Pre-archive checks** (typed errors if `tasks.md` missing, etc.)
    
- **CHANGELOG** appender derived from `receipt.json`
    
- **Native OpenSpec binding** (replace CLI wrapper internally; same contracts)
    
- **Light UI** that visualizes receipts (optional)
    

---

# 07_OPENSPEC_GLUE.md

## Why not reinvent planning?

OpenSpec already standardizes the **change folder lifecycle** and is adopted across popular dev tools; it’s exactly the “spec-first” guardrail you want. We fork where needed, but keep compatibility with:

- **Local, no-keys** workflow
    
- **Editor slash-commands** (human UX)
    
- **Deterministic archive** → updates `openspec/specs/**` ([openspec.dev](https://openspec.dev/?utm_source=chatgpt.com "OpenSpec — A lightweight spec‑driven framework"))
    

## Our fork adds

- Stable MCP **tools** and **resources** on top
    
- **Receipts** as lightweight audit artifacts
    
- Tight **token policies** and pagination
    

---

# 08_SECURITY_AND_LIMITS.md

- **Path sandboxing**: Restrict reads/writes to `openspec/` subtrees.
    
- **Idempotency**: `change.open` returns existing; `change.archive` returns `{ archived:true }` and can include `alreadyArchived:true`.
    
- **Transport**:
    
    - IDE: **stdio** MCP
        
    - API: **HTTP/SSE** MCP (required by Anthropic connector; no local stdio). ([Claude Docs](https://docs.anthropic.com/en/docs/agents-and-tools/mcp-connector?utm_source=chatgpt.com "MCP connector - Anthropic"))
        
- **Output limits**: Keep tool outputs tiny (Claude Code default limit **25k**; warn and chunk otherwise). ([anthropic.mintlify.app](https://anthropic.mintlify.app/en/docs/claude-code/mcp?utm_source=chatgpt.com "Connect Claude Code to tools via MCP - Claude Docs"))
    

---

# 09_ROLLOUT.md

## Milestone 1 — “2 tools + resources”

- Implement `change.open` / `change.archive` (CLI-backed).
    
- Expose `changes://active` and `change://{slug}/…` resources (IDE).
    
- Docs + examples for Claude Code `@resource` flow. ([Claude Docs](https://docs.claude.com/en/docs/claude-code/mcp?utm_source=chatgpt.com "Connect Claude Code to tools via MCP - Claude Docs"))
    

## Milestone 2 — Receipts & validation

- Write `receipt.json` on archive; return compact version in tool result.
    
- Pre-archive checks: `proposal.md`, `tasks.md`, and `specs/` folder shape.
    

## Milestone 3 — HTTP/SSE for Messages API

- Expose tools via HTTP/SSE for the **MCP connector** (tools-only).
    
- Example API call with `mcp_servers` and beta header. ([Claude Docs](https://docs.anthropic.com/en/docs/agents-and-tools/mcp-connector?utm_source=chatgpt.com "MCP connector - Anthropic"))
    

## Milestone 4 — Optional polish

- Pagination for `changes://active`
    
- CHANGELOG appender from receipts
    
- Native OpenSpec bindings (replace CLI wrapper internally)
    

---

# 10_FAQ.md

**Q: Why not expose the OpenSpec CLI to agents directly?**  
A: We keep **one control plane** for agents (MCP) and **CLI for humans**. It avoids duplicate verbs and works in both IDE (stdio resources) and API (**tools-only** connector) contexts. ([Claude Docs](https://docs.anthropic.com/en/docs/agents-and-tools/mcp-connector?utm_source=chatgpt.com "MCP connector - Anthropic"))

**Q: How does this avoid context bloat?**  
A: In IDE flows, the agent uses **@-mentioned resources**; Claude Code fetches them as attachments without dumping them into the prompt. In API flows, we return **compact JSON** with pointers. ([Claude Docs](https://docs.claude.com/en/docs/claude-code/mcp?utm_source=chatgpt.com "Connect Claude Code to tools via MCP - Claude Docs"))

**Q: What about token limits?**  
A: Claude Code defaults to **25k** tokens for MCP tool outputs; our design keeps tool responses tiny, and leans on resources/paths. ([anthropic.mintlify.app](https://anthropic.mintlify.app/en/docs/claude-code/mcp?utm_source=chatgpt.com "Connect Claude Code to tools via MCP - Claude Docs"))

**Q: Can this integrate with more powerful code tools later?**  
A: Yes. If you later incorporate a symbol-aware MCP (e.g., Serena) for task execution or validation, it plugs in cleanly; Serena uses LSP to find/modify code with fewer tokens. ([GitHub](https://github.com/mcp/oraios/serena?utm_source=chatgpt.com "MCP Registry | Serena · GitHub"))

---

## References

- **OpenSpec** — local, spec-driven, no keys/MCP required; native slash commands and supported tools. ([openspec.dev](https://openspec.dev/?utm_source=chatgpt.com "OpenSpec — A lightweight spec‑driven framework"))
    
- **Claude Code: MCP + Resources** — how to `@server:protocol://path` and auto-attach resources; common workflows and output limits (25k default). ([Claude Docs](https://docs.claude.com/en/docs/claude-code/mcp?utm_source=chatgpt.com "Connect Claude Code to tools via MCP - Claude Docs"))
    
- **Anthropic MCP connector** — Messages API integration over HTTP/SSE, **tools-only** limitation, beta header, public URL requirement. ([Claude Docs](https://docs.anthropic.com/en/docs/agents-and-tools/mcp-connector?utm_source=chatgpt.com "MCP connector - Anthropic"))
    
- **Serena (optional later)** — LSP-backed semantic code tools to reduce token usage for code retrieval/edits. ([GitHub](https://github.com/mcp/oraios/serena?utm_source=chatgpt.com "MCP Registry | Serena · GitHub"))
    

---

If you want, I can turn these into files under `/docs` and add a minimal `examples/` folder showing:

- a Claude Code session using `@change://slug/proposal`, and
    
- a Messages API call with `mcp_servers` hitting `change.open`/`change.archive`.