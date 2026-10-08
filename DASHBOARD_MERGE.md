# Current dashboard and legacy refresh pipeline

This merge brings the current Replit dashboard into the repository without
replacing the original Python dashboard or removing its scheduled refresh.

## Current app

- `artifacts/school-staff-dashboard`: the current web app.
- `artifacts/api-server`: Noon/Citadel sign-in, scoped reports, summaries, and sync.
- `.github/workflows/dashboard-ci.yml`: type checks, builds, and synthetic access checks.
- `replit.md`: workspace architecture and setup information.

The current app and its authorization behavior are preserved from the dashboard
updates branch. This merge does not change access policy or publish the app.

## Preserved legacy pipeline

The root Python scripts, SQL queries, `src/app.html`, original `README.md`, and
`.github/workflows/refresh.yml` remain in place. That scheduled workflow still
uses the root scripts and existing GitHub secrets; no new credentials are added.
Its runtime and private warehouse refresh are not exercised by dashboard CI.

Copies under `artifacts/school-staff-dashboard/source` support the current app
and should not be mistaken for GitHub's active root refresh workflow.

## Data protection and review

The combined `.gitignore` retains both the legacy private-data/export exclusions
and the current app's dependencies, build outputs, and local-workspace exclusions.
Do not commit extracts, real student records, credentials, or generated exports.

Review both dashboard CI and the legacy workflow before merging the pull request.
Merging into GitHub `main` is separate from publishing a Replit deployment.
