# Bundle Handle Expectations (Advisory)

_Last updated: 2025-10-23_

Task MCP does **not** produce or consume bundles. If Pampax is present, Task MCP may record **opaque handles** *outside* of its core API (e.g., in notes or comments), but this is optional and out-of-scope here.

If used, a handle SHOULD look like:
```
bundleId: "bndl_xxx"
sha256: "<64-hex>"
sizeBytes: <int>
tokenEstimate: <int>
resourceUri: "pampax://bundle/<id>"   # for IDE attachment only
```
This spec does **not** require or recognize those fields in Task MCP tool results.
