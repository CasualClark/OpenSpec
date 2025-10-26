# Phase 4 — HTTPS_SSE_for_API

_Last updated: 2025-10-23_

## Goals
Expose HTTPS/SSE server compatible with Messages API (tools-only).

## Tasks & RACI (Task MCP)
- **DevOps**: TLS, bearer auth, `/healthz`, CORS, rate limiting, Dockerfiles + compose.
- **Builder**: Implement SSE/streaming HTTP endpoint that emits tool results as JSON events.
- **Reviewer**: Load tests for response size; ensure chunking policy documented.


## Pseudocode / Algorithms
// Minimal SSE
app.post('/mcp', auth, async (req,res)=>{
  res.setHeader('Content-Type','text/event-stream')
  const out = await runTool(req.body.tool, req.body.input)
  res.write('data: '+JSON.stringify(out)+'\n\n')
  res.end()
})


## Deliverables
- Dockerized HTTPS/SSE server; example API calls.

## Definition of Done
- End-to-end via Messages API connector; outputs small & stable.
