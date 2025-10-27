# Pseudocode (TS)

```ts
// logging.ts
export function logHttp(req, res, next) {
  const start = process.hrtime.bigint();
  res.on('finish', () => {
    const durMs = Number(process.hrtime.bigint() - start) / 1e6;
    logger.info({
      "@timestamp": new Date().toISOString(),
      "service.name": "task-mcp",
      "http.method": req.method,
      "http.route": req.route?.path || req.url,
      "http.status_code": res.statusCode,
      "request.id": req.id,
      "trace.id": req.traceId,
      "bytesOut": Number(res.getHeader('content-length')||0),
      "latencyMs": Math.round(durMs)
    });
  });
  next();
}

// metrics.ts
const meter = otel.getMeter("task-mcp");
const httpDur = meter.createHistogram("http.server.request.duration", { unit: "s" });
const httpCount = meter.createCounter("http.server.request.count");
const httpErr = meter.createCounter("http.server.error.count");

export async function withOtel(req, res, next) {
  const start = process.hrtime();
  try { await next(); }
  catch (e) { httpErr.add(1, { route: req.route?.path||req.url, method: req.method }); throw e; }
  finally {
    const d = process.hrtime(start); const sec = d[0] + d[1]/1e9;
    httpCount.add(1, { route: req.route?.path||req.url, method: req.method, status_class: String(Math.floor(res.statusCode/100)) });
    httpDur.record(sec, { route: req.route?.path||req.url, method: req.method, transport: res.locals.transport||"http", status_class: String(Math.floor(res.statusCode/100)) });
  }
}
```
