---
name: GitHub connector and command-line authentication
description: Why a connected GitHub integration does not guarantee native git push access
---

Treat the GitHub connector and command-line Git credentials as separate authentication paths.

**Why:** The connected GitHub account had repository write permission through its authenticated API, while native Git continued rejecting its existing credentials after connection. A successful fetch from a public repository did not establish push access.

**How to apply:** Use the authenticated connector for repository operations when native Git remains unauthorized. Keep credentials opaque; never extract tokens into shell commands or configuration. Preserve remote branches and verify the uploaded commit/tree rather than force-pushing over unrelated history.
