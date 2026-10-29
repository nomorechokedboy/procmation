# Changesets

Describe a change that should reach users with `pnpm changeset` and commit the
file it creates with your pull request. When pull requests with changesets are
merged to `main`, the Release workflow opens a "chore: version packages" pull
request that bumps the version and writes `CHANGELOG.md`. Merging that pull
request tags the release (`v<version>`), publishes a GitHub Release and builds
the Docker images with that version.

Pick `patch` for fixes, `minor` for features, `major` for breaking changes.
