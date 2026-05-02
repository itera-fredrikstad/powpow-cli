---
description: After code changes, ask the user which of {update docs, bump version, commit} to do next, then perform the selected actions.
allowed-tools: Bash(git diff *), Bash(git log *), Bash(git status *), Bash(git add *), Bash(git commit *), Bash(pnpm version *), Bash(sha256sum), Bash(shasum *), Bash(mkdir -p *), Bash(cat *), Bash(tee *), Read, Edit, Write, Grep, Glob, AskUserQuestion
---

Present a deterministic post-change menu, then execute what the user picks. Use this after making any code change, or run it manually any time.

## Step 1 — survey the change set

```bash
git status --short
git diff --stat HEAD
git diff --name-only HEAD
```

If `git diff HEAD` is empty AND nothing is staged, say "No uncommitted changes." and stop.

Decide which actions are *applicable* (don't show ones that aren't):

- **Update docs** — applicable whenever any source code or config changed (`src/**`, `types/**`, `package.json` scripts, `tsconfig*.json`).
- **Bump version** — applicable whenever any user-visible code changed (`src/cli.ts`, `src/commands/**`, `src/dev-server.ts`, `src/config.ts`, `types/*.d.ts`, `package.json` user-facing fields).
- **Commit** — always applicable when there are unstaged or staged changes.

## Step 2 — ask the user

Use `AskUserQuestion` with **`multiSelect: true`** and the applicable subset of these three options:

- **Update docs** — "Update README.md and `.claude/` docs to match the code changes. Does NOT touch CHANGELOG.md or ROADMAP.md."
- **Bump version (suggested: <patch|minor|major>)** — "Bump `package.json` version and add a CHANGELOG.md entry (and prune ROADMAP.md if a planned item was completed)." Pick the suggested level by inspecting the diff: breaking change in CLI/config/types → major; new user-facing feature → minor; bug fix or internal-only refinement of user-visible code → patch.
- **Commit to current branch** — "Stage everything and create a commit. You'll be shown the proposed message before it runs."

Question wording: `"You changed code. What should I do next?"` Header: `"Post-change"`.

## Step 3 — execute selected actions in this order

If multiple were chosen, run them in this fixed order so they compose correctly:

### A. Update docs (if selected)

Scope is **only**: `README.md`, `CLAUDE.md`, `.claude/docs/*.md`. Do NOT touch `CHANGELOG.md` or `ROADMAP.md` here — those belong to action B.

For each, read it and update only what's stale. Use the file → doc mapping from `.claude/commands/update-docs.md` but skip the CHANGELOG/ROADMAP rows. Make minimal edits. Report a per-file one-line summary.

### B. Bump version (if selected)

1. Reconfirm the level by checking the diff once more, then run:
   ```bash
   pnpm version <patch|minor|major> --no-git-tag-version
   ```
   This updates `package.json` only; no tag, no commit.
2. Update `CHANGELOG.md`:
   - If there's an `## Unreleased` section, rename it to the new version with today's date (`YYYY-MM-DD`).
   - Otherwise add a new `## <new-version>` section above the previous top entry.
   - Populate it with one bullet per user-visible change, matching the existing style (section headings like `### Added`/`### Changed`/`### Fixed`/`### Removed`, or the freer prose style already in use). Past tense. Internal-only changes (refactors with no behaviour change, test-only edits, docs, CI) do NOT belong here.
3. Update `ROADMAP.md` **only if it exists**:
   - If your changes complete or obsolete a listed item, remove it (changelog is the historical record).
   - If they open a new direction worth tracking, add a one-line bullet in the matching themed section using the existing **bold-lead-in** + optional `(§N.M)` ref style.
   - Don't restructure. Don't create the file if absent.

### C. Commit to current branch (if selected)

1. Re-run `git status --short` and `git diff --cached` to see the final state including any updates from A/B above.
2. Skim the last ~10 commit messages: `git log --oneline -10`. Match that style (subject line shape, tense, capitalization).
3. Propose a commit message that summarizes ALL the changes in this batch (docs + version + code) — single subject line, optional body if there's a real "why" worth recording. Show it to the user as: `Proposed commit message: <msg>`. Do NOT pipe through `git commit -m` until they confirm in plain text.
4. On confirmation, stage the relevant files explicitly (don't `git add -A` blindly — list them) and commit.

## Step 4 — record that the prompt was answered

Regardless of which actions ran (and regardless of the user dismissing all of them), record the current change-set fingerprint so the Stop hook doesn't re-prompt for the same diff:

```bash
mkdir -p .claude/.cache
git diff HEAD | shasum -a 256 | awk '{print $1}' > .claude/.cache/post-change-sentinel
```

If a commit ran in step C, the diff is now empty — the sentinel will be the empty-diff hash, which is fine.

## Step 5 — report

Summarize what ran, in 3–5 lines. If something failed, surface it; do NOT retry silently.
