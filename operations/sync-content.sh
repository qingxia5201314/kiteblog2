#!/bin/bash
# Commit and push whatever the admin UI wrote into the content repo.
#
# Why this exists
# ---------------
# The admin UI edits files in /opt/kitepop-content/source directly. Nothing else
# commits them, so before this script they accumulated as uncommitted changes in
# a working tree that CI's `git reset --hard` used to own. Now the content repo
# is the single source of truth and this is the write-back path.
#
# Called by operations/publish.sh after a successful render (so only content
# that has been proven to build gets committed). Safe to run by hand:
#
#   bash /opt/kitepop-hexo-standard/operations/sync-content.sh
#
# No-op when the content tree is clean.
set -euo pipefail

CONTENT=${KITEPOP_CONTENT_DIR:-/opt/kitepop-content}
BRANCH=${KITEPOP_CONTENT_BRANCH:-main}

cd "$CONTENT"

if [ -z "$(git status --porcelain)" ]; then
  printf 'sync-content: nothing to commit\n'
  exit 0
fi

git add -A
git commit -q -m "content: admin edit $(date -u +%Y-%m-%dT%H:%M:%SZ)"
printf 'sync-content: committed %s\n' "$(git log --oneline -1)"

if git push origin "$BRANCH" 2>&1 | tail -2; then
  printf 'sync-content: pushed to origin/%s\n' "$BRANCH"
else
  printf 'sync-content: push failed (commit is safe locally)\n' >&2
  exit 1
fi
