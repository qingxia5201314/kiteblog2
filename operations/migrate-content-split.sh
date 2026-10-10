#!/bin/bash
# Split the blog content (source/) out of the code checkout into its own
# private, VPS-hosted git repository.
#
# Before:  /opt/kitepop-hexo-standard/source        (real dir, tracked by the
#                                                   public GitHub code repo)
# After:   /opt/kitepop-content.git                 (bare origin, VPS only)
#          /opt/kitepop-content/source              (working clone)
#          /opt/kitepop-hexo-standard/source        (symlink -> above)
#
# Why: the code repo is public and CI runs `git reset --hard origin/main` on
# every deploy. Keeping posts in the same working tree meant any post written
# through the admin UI lived only as an uncommitted file, at the mercy of that
# reset. Content now lives in a repo CI never touches.
#
# Idempotent: safe to re-run; a second run detects the symlink and stops.
# Reverse with: operations/revert-content-split.sh
set -euo pipefail

CODE=/opt/kitepop-hexo-standard
CONTENT=/opt/kitepop-content
BARE=/opt/kitepop-content.git
SOURCE_LINK="$CODE/source"

say() { printf '\n=== %s ===\n' "$*"; }
die() { printf 'migrate-content-split: %s\n' "$*" >&2; exit 1; }

say "preflight"
[ -d "$CODE" ] || die "missing $CODE"
[ -d "$SOURCE_LINK" ] || die "missing $SOURCE_LINK"
if [ -L "$SOURCE_LINK" ]; then
  printf 'already migrated: %s -> %s\n' "$SOURCE_LINK" "$(readlink "$SOURCE_LINK")"
  exit 0
fi
[ -z "$(git -C "$CODE" status --porcelain -- source/ | head -1)" ] && untracked_note=clean \
  || untracked_note="has local changes (they will move with the content)"
printf 'source/ state: %s\n' "$untracked_note"

say "1. bare origin $BARE"
if [ -d "$BARE" ]; then
  echo "exists, leaving as-is"
else
  git init --bare --initial-branch=main "$BARE" >/dev/null
  echo "created"
fi

say "2. working clone $CONTENT"
if [ -d "$CONTENT/.git" ]; then
  echo "exists, leaving as-is"
else
  mkdir -p "$CONTENT"
  git -C "$CONTENT" init --initial-branch=main >/dev/null
  git -C "$CONTENT" config user.name  "Kitepop VPS"
  git -C "$CONTENT" config user.email "root@kitepop.top"
  git -C "$CONTENT" remote add origin "$BARE"
  printf 'created\n'
fi

say "3. move content in"
if [ -d "$CONTENT/source" ] && [ -n "$(ls -A "$CONTENT/source" 2>/dev/null)" ]; then
  echo "$CONTENT/source already populated, skipping move"
else
  mkdir -p "$CONTENT/source"
  # -a keeps permissions/timestamps; the trailing /. copies contents, not the dir
  cp -a "$SOURCE_LINK/." "$CONTENT/source/"
  echo "copied $(find "$SOURCE_LINK" -type f | wc -l) files"
fi

say "4. content repo housekeeping"
cat > "$CONTENT/.gitignore" <<'EOF'
# Discarded posts (moved here by the admin "remove" button).
_discarded/

# Local scratch that must never be published.
Untitled/

# Editor / OS noise
.DS_Store
Thumbs.db
*.swp
*~
EOF
# Keep the empty drafts dir: git does not track empty directories, and the
# admin UI writes new drafts into it.
mkdir -p "$CONTENT/source/_drafts"
cat > "$CONTENT/source/_drafts/.gitignore" <<'EOF'
!.gitignore
EOF

say "5. commit and push"
git -C "$CONTENT" add -A
if git -C "$CONTENT" diff --cached --quiet; then
  echo "nothing to commit"
else
  git -C "$CONTENT" commit -q -m "content: import source/ from the code checkout

Seeded from /opt/kitepop-hexo-standard/source before the content split.
Includes the untracked post that prompted the migration."
  echo "committed"
fi
git -C "$CONTENT" push -u origin main 2>&1 | tail -3

say "6. swap code/source for a symlink"
# Keep the original around until the symlink is proven good.
STASH=/opt/kitepop-backups/pre-content-split-source-$(date -u +%Y%m%dT%H%M%SZ)
mv "$SOURCE_LINK" "$STASH"
ln -s "$CONTENT/source" "$SOURCE_LINK"
echo "moved original to $STASH"
echo "symlink: $SOURCE_LINK -> $(readlink "$SOURCE_LINK")"

say "7. verify"
echo "-- symlink resolves --"
ls "$SOURCE_LINK" | head -5
echo "-- file count matches --"
printf 'via symlink : %s\n' "$(find "$SOURCE_LINK/" -type f | wc -l)"
printf 'in content  : %s\n' "$(find "$CONTENT/source" -type f | wc -l)"
echo "-- content repo --"
git -C "$CONTENT" log --oneline -1
git -C "$CONTENT" remote -v
echo "-- the untracked post made it --"
ls -l "$SOURCE_LINK/_posts/关于使用liveagent和pi-desktop有感.md"
echo "-- code repo still sees source as modified? --"
git -C "$CODE" status --short | head -10

printf '\nDone. source/ now lives in %s and is no longer the code repo'"'"'s business.\n' "$CONTENT"
printf 'Next: operations/publish.sh and the code repo ignore list still need updating.\n'
