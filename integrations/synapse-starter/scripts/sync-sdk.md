# Refreshing the vendored SDK tarballs (maintainer only)

The three `@noonacademy/*` packages are committed as tarballs under `vendor/` so that
cloning this template needs **no GitHub token**. The cost: they only update when a
maintainer refreshes them. Template users never need this file.

## When a new SDK version is published

You need a GitHub personal access token with `read:packages` scope — the only place a
token is still required for the starter.

```bash
# 1. Pack the new versions straight from GitHub Packages (adjust versions):
export GITHUB_TOKEN=<your token>
npm pack @noonacademy/synapse-sdk@<new> \
         @noonacademy/citadel-transport@<new> \
         @noonacademy/synapse-catalog@<new> \
         --pack-destination vendor \
         --registry https://npm.pkg.github.com

# 2. Remove the old tarballs from vendor/.

# 3. Update BOTH "dependencies" and "overrides" in package.json to the new
#    file:vendor/<tarball> paths. The two must stay identical — npm errors when an
#    override conflicts with a direct dependency spec, and the overrides are what force
#    the SDK's internal @noonacademy/* ranges onto the vendored copies instead of the
#    registry.

# 4. Regenerate the lockfile from scratch and prove it's registry-free:
rm -rf node_modules package-lock.json
env -u GITHUB_TOKEN npm install
grep npm.pkg.github.com package-lock.json   # must print nothing

# 5. npm run verify, boot once (look for "[synapse] OK — app_booted accepted"),
#    then commit vendor/, package.json, and package-lock.json together.
```

A vendor refresh changes synapse-owned paths, so it ships like any template change:
**bump `TEMPLATE_VERSION` and append the `UPGRADES.md` entry in the same PR** — CI enforces
it. See [`RELEASING.md`](../RELEASING.md).

## Known gap: stale clones fail without naming the cause

A clone of this template keeps whatever tarballs it was cloned with, forever — template
users never receive these refreshes. When Citadel's contract moves past a vendored SDK
version, the failure surfaces at whatever call hits the changed surface (confusing
runtime errors, possibly silent misbehavior); **nothing currently says "your SDK is
stale."** This is a known, deliberately deferred gap. Future work, in preference order:
a Citadel-side minimum-version rejection at the `app_booted` handshake, or a console
Home checklist row comparing the installed SDK version against what Citadel expects.
