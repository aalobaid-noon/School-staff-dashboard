---
name: GitHub connector and command-line authentication
description: Why a connected GitHub integration does not guarantee native git push access
---

Treat the GitHub connector and command-line Git credentials as separate authentication paths. A repository response reporting `permissions.push` does not prove the integration token can write.

For GitHub App user tokens, repository access is the intersection of the user's permissions, the app's permissions, and the app's installation access. Authorizing the app as a user does not install it on the repository owner's account.

**Why:** Connecting GitHub did not repair native Git's rejected credentials. Repository reads succeeded and reported account-level push permission, but a Git data write still returned 403, “Resource not accessible by integration.” Public fetch success also did not establish push access.

Reauthorizing the same GitHub App connection did not resolve the write rejection. Do not repeat reconnect prompts after the permitted single retry; repository/app write authorization or the separate native Git connection must be addressed.

**How to apply:** Verify the user's repository permissions separately from the app's accessible installations. A successful GitHub App `/user/installations` response with no entries means that token has no accessible app installation; it does not mean the user lacks repository write access. Address installation access with the repository owner rather than repeatedly reconnecting the user. Keep credentials opaque; never extract tokens into shell commands or configuration. Preserve remote branches and verify the uploaded commit/tree rather than force-pushing over unrelated history.

Reference: https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/authenticating-with-a-github-app-on-behalf-of-a-user
