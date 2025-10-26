# docs/docker_strategy.md — Minimal Containers, Dockerless First

## Goals
- Keep infra simple: **one** container or none.
- Avoid multi-container stacks unless you need a reverse proxy at the edge.

## Options
1) **Dockerless**: run Node/Bun server directly with TLS envs. Great for dev and small deployments.
2) **Single container**: includes the server and TLS termination (mount cert/key).

## Anti-goals
- No dependency on multiple sidecars (databases, redis, etc.).
- No orchestration required to get value.

## Notes
- Distroless image reduces attack surface.
- Healthcheck ensures container restarts cleanly.
