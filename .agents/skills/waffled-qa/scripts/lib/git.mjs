// Read-only git identity of a checkout: what source a run or attempt tested.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";

const git = (dir, ...args) =>
  execFileSync("git", ["-C", dir, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
    maxBuffer: 256 * 1024 * 1024,
  });

// {root, common, head, branch, dirty, diffHash}, or null outside a git checkout.
// diffHash covers tracked changes and the names and contents of untracked
// files, so two stamps match only when the tested source is the same.
export function source(dir, { diff: withDiff = true } = {}) {
  let root;
  try {
    root = git(dir, "rev-parse", "--show-toplevel").trim();
  } catch {
    return null;
  }
  let head = null;
  try {
    head = git(root, "rev-parse", "HEAD").trim();
  } catch {}
  // symbolic-ref also names the branch of a repository with no commits yet.
  let branch;
  try {
    branch = git(root, "symbolic-ref", "--short", "-q", "HEAD").trim();
  } catch {
    branch = "HEAD"; // detached
  }
  // Shared by every worktree of one repository.
  const common = git(root, "rev-parse", "--path-format=absolute", "--git-common-dir").trim();
  if (!withDiff) return { root, common, head, branch };
  const diff = head ? git(root, "diff", "HEAD", "--binary") : "";
  const untracked = git(root, "ls-files", "--others", "--exclude-standard", "-z")
    .split("\0")
    .filter(Boolean);
  const dirty = Boolean(diff) || untracked.length > 0;
  let diffHash = null;
  if (dirty) {
    const hash = createHash("sha256").update(diff);
    const paths = untracked.sort();
    if (paths.length) {
      const blobs = execFileSync("git", ["-C", root, "hash-object", "--stdin-paths"], {
        encoding: "utf8",
        input: paths.join("\n") + "\n",
        stdio: ["pipe", "pipe", "ignore"],
      });
      hash.update(`${paths.join("\0")}\0${blobs}`);
    }
    diffHash = hash.digest("hex").slice(0, 16);
  }
  return { root, common, head, branch, dirty, diffHash };
}

export const sameSource = (a, b) =>
  Boolean(a && b) && a.head === b.head && a.diffHash === b.diffHash;
