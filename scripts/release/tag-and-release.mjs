#!/usr/bin/env node
// scripts/release/tag-and-release.mjs
//
// Run by .github/workflows/release.yaml's `tag-and-release` job on every
// push to main. Compares package.json's version against the latest `v*` git
// tag; if it moved (i.e. a "Version Packages" PR was just merged), creates
// the tag, cuts a GitHub Release from the new CHANGELOG.md section, and
// dispatches the Docker workflow with the version attached.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";

const REPO_ROOT = path.resolve(import.meta.dirname, "../..");
const DOCKER_WORKFLOW = "docker.yaml";

function sh(cmd, args) {
  return execFileSync(cmd, args, { cwd: REPO_ROOT, encoding: "utf-8" }).trim();
}

function readVersion() {
  const pkgPath = path.join(REPO_ROOT, "package.json");
  const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
  if (!pkg.version) {
    throw new Error(`${pkgPath} has no "version" field`);
  }
  return pkg.version;
}

// Latest existing release tag, or null if it has never been released.
// --sort=-v:refname orders by semver descending so the first line is newest.
function latestTag() {
  const out = sh("git", ["tag", "-l", "v*", "--sort=-v:refname"]);
  return out.split("\n")[0]?.trim() || null;
}

function tagExists(tag) {
  try {
    sh("git", ["rev-parse", "--verify", "--quiet", `refs/tags/${tag}`]);
    return true;
  } catch {
    return false;
  }
}

function releaseExists(tag) {
  try {
    sh("gh", ["release", "view", tag]);
    return true;
  } catch {
    return false;
  }
}

// The section of CHANGELOG.md for `version`: the text between its own
// "## <version>" heading and the next "## " heading (or end of file).
function changelogSection(version) {
  const changelogPath = path.join(REPO_ROOT, "CHANGELOG.md");
  if (!existsSync(changelogPath)) {
    return "No changelog entry.";
  }
  const lines = readFileSync(changelogPath, "utf-8").split("\n");
  const start = lines.findIndex((line) => line.trim() === `## ${version}`);
  if (start === -1) {
    return "No changelog entry.";
  }
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i += 1) {
    if (lines[i].startsWith("## ")) {
      end = i;
      break;
    }
  }
  return (
    lines
      .slice(start + 1, end)
      .join("\n")
      .trim() || "No changelog entry."
  );
}

function createTagAndRelease(version) {
  const tag = `v${version}`;

  if (tagExists(tag)) {
    console.log(`Tag ${tag} already exists, skipping tag creation`);
  } else {
    console.log(`Creating tag ${tag}`);
    sh("git", ["tag", tag]);
    sh("git", ["push", "origin", tag]);
  }

  if (releaseExists(tag)) {
    console.log(`Release ${tag} already exists, skipping release creation`);
    return tag;
  }
  console.log(`Creating GitHub Release ${tag}`);
  const notesPath = path.join(REPO_ROOT, ".release-notes.md");
  writeFileSync(notesPath, changelogSection(version));
  try {
    sh("gh", [
      "release",
      "create",
      tag,
      "--title",
      `Procmation ${tag}`,
      "--notes-file",
      notesPath,
    ]);
  } finally {
    unlinkSync(notesPath);
  }
  return tag;
}

function main() {
  const version = readVersion();
  const existing = latestTag();

  if (existing === `v${version}`) {
    console.log(`Version ${version} already released, nothing to do.`);
    return;
  }
  console.log(`Version changed (${existing ?? "none"} -> v${version})`);
  const tag = createTagAndRelease(version);

  console.log(`Dispatching ${DOCKER_WORKFLOW} for ${tag}`);
  try {
    sh("gh", [
      "workflow",
      "run",
      DOCKER_WORKFLOW,
      "--ref",
      "main",
      "-f",
      `version=${version}`,
    ]);
  } catch (err) {
    // The tag and release exist; a failed dispatch means the images have to
    // be built by hand, so it is surfaced loudly rather than swallowed.
    console.error(
      `::error::Failed to dispatch ${DOCKER_WORKFLOW} for ${tag}: ${err.message}`
    );
    process.exit(1);
  }
}

main();
