// Activate the repo's committed git hooks (.githooks) — TEMPLATE repo ONLY.
//
// Run by the `prepare` npm lifecycle (i.e. on `npm install`). It points
// core.hooksPath at .githooks so the pre-push release-discipline gate takes
// effect. Guarded to the template: in a clone (any other origin, or no git at
// all) it does nothing, so a builder's repo config is never touched — release
// discipline is not a clone's concern. Never throws: a failure here must not
// break `npm install`.

import { execSync } from 'node:child_process';

function sh(cmd) {
  return execSync(cmd, { stdio: ['ignore', 'pipe', 'ignore'] })
    .toString()
    .trim();
}

try {
  const origin = sh('git remote get-url origin');
  if (origin.includes('noonAcademy/synapse-starter')) {
    sh('git config core.hooksPath .githooks');
    console.log(
      '[setup-hooks] template repo detected — pre-push release gate activated (.githooks).',
    );
  }
  // Any other origin (a clone/fork) or no origin: intentionally do nothing.
} catch {
  // Not a git repo, git unavailable, or no origin remote — nothing to activate.
}
