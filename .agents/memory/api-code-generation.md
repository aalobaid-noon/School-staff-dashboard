---
name: API code generation constraints
description: Non-obvious Orval request-schema export and browser-header type pitfalls
---

Use distinctly named reusable request schemas in OpenAPI rather than anonymous inline bodies when generating both Zod and TypeScript exports.

**Why:** The generator can derive the same request-body type name in its Zod API output and its separate type output. A barrel exporting both then fails with duplicate exports, despite a valid OpenAPI document.

**How to apply:** Resolve the naming at the OpenAPI boundary and regenerate; do not hand-edit generated code. Header-bearing operations can also generate iterable browser Headers helpers, which require DOM iterable types in the client library's TypeScript configuration.
