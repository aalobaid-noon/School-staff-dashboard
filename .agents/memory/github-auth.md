---
name: GitHub connector and command-line authentication
description: Why a connected GitHub integration does not guarantee native git push access
---

Treat the GitHub connector and command-line Git credentials as separate authentication paths. A repository response reporting `permissions.push` does not prove the integration token can write.

For GitHub App user tokens, repository access is the intersection of the user's permissions, the app's permissions, and the app's installation access. Authorizing the app as a user does not install it on the repository owner's account.

**Why:** Connecting GitHub did not repair native Git's rejected credentials. Repository reads succeeded and reported account-level push permission, but a Git data write still returned 403, “Resource not accessible by integration.” Public fetch success also did not establish push access.

Reauthorizing the same GitHub App connection did not resolve the write rejection. Do not repeat reconnect prompts after the permitted single retry; repository/app write authorization or the separate native Git connection must be addressed.

**How to apply:** Verify the user's repository permissions separately from the app's accessible installations. A successful GitHub App `/user/installations` response with no entries means that token has no accessible app installation; it does not mean the user lacks repository write access. Address installation access with the repository owner rather than repeatedly reconnecting the user. Keep credentials opaque; never put tokens in shell arguments, tracked files, remote URLs, or persistent Git configuration. Preserve remote branches and verify the uploaded commit/tree rather than force-pushing over unrelated history.

**Workspace-secret fallback:** The user approved using a GitHub username and personal access token in workspace Secrets for repository publishing only.

**Why:** GitHub publishing authorization is separate from the dashboard's Noon/Citadel login. The fallback must not change application authentication or expose Git credentials to browser code.

**How to apply:** Request credentials only through the secure Secrets flow, use them through a temporary process environment for Git operations, and do not add them to application code or require them for the deployed dashboard.

Reference: https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/authenticating-with-a-github-app-on-behalf-of-a-user
