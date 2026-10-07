---
name: GitHub connector and command-line authentication
description: Why a connected GitHub integration does not guarantee native git push access
---

Treat the GitHub connector and command-line Git credentials as separate authentication paths. A repository response reporting `permissions.push` does not prove the integration token can write.

**Why:** Connecting GitHub did not repair native Git's rejected credentials. Repository reads succeeded and reported account-level push permission, but a Git data write still returned 403, “Resource not accessible by integration.” Public fetch success also did not establish push access.

Reauthorizing the same GitHub App connection did not resolve the write rejection. Do not repeat reconnect prompts after the permitted single retry; repository/app write authorization or the separate native Git connection must be addressed.

**How to apply:** Use the authenticated connector for allowed repository operations when native Git remains unauthorized. On an API authorization rejection, follow the integration reauthorization flow and verify repository contents-write permission. Keep credentials opaque; never extract tokens into shell commands or configuration. Preserve remote branches and verify the uploaded commit/tree rather than force-pushing over unrelated history.
