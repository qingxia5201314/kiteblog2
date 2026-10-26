#!/bin/bash
# Render the blog into a timestamped directory and atomically swap the live
# symlink. Run on the VPS by both CI (.github/workflows/deploy.yml) and the
# admin UI's deploy button (hexo.config.admin.deployCommand).
#
# Content layout
# --------------
#   /opt/kitepop-hexo-standard/source  ->  symlink to /opt/kitepop-content/source
#
# Posts live in their own git repository (see operations/migrate-content-split.sh
# and operations/sync-content.sh) so that the code repo's `git reset --hard`
# during CI can never touch them. Hexo reads straight through the symlink, so no
# source_dir override is needed.
set -euo pipefail
cd /opt/kitepop-hexo-standard
export TMPDIR=$PWD/operations/cache npm_config_cache=$PWD/operations/cache/npm
exec 9>operations/publish.lock
flock -n 9 || { echo 'Another publish is running'; exit 1; }

# Refuse to publish if the content symlink is missing: without it Hexo would
# render an empty site over the live one and take the blog down.
if [ ! -e source ]; then
  echo 'publish.sh: source/ is missing (content symlink broken?)' >&2
  exit 1
fi
if [ -L source ] && [ ! -d source ]; then
  echo "publish.sh: source/ is a dangling symlink -> $(readlink source)" >&2
  exit 1
fi
if [ -z "$(ls -A source 2>/dev/null)" ]; then
  echo 'publish.sh: source/ is empty, refusing to publish' >&2
  exit 1
fi

STAMP=$(date -u +%Y%m%dT%H%M%SZ)-$$
OUT=/var/www/myblog-arknights-$STAMP
printf 'Backing up source...\n'
# -h dereferences the content symlink; without it the archive would contain a
# bare symlink entry (~124 bytes) instead of the posts.
tar -czhf /opt/kitepop-backups/hexo-source-$STAMP.tar.gz source _config.yml _config.arknights.yml
# Strip the unreferenced, render-blocking FontAwesome stylesheet before
# rendering. Safe to run every time; see operations/patch-fontawesome.sh.
bash operations/patch-fontawesome.sh
# Point the theme's pagination links at its own language strings; without this
# they render Hexo's hardcoded "Prev"/"Next". See operations/patch-theme-i18n.sh.
bash operations/patch-theme-i18n.sh
# Keep the front-matter guard in place across redeploys; see
# operations/patch-frontmatter-guard.cjs. No-op when already applied.
node operations/patch-frontmatter-guard.cjs || printf 'publish.sh: front-matter guard patch failed
' >&2
printf 'public_dir: %s\nrender_drafts: false\n' "$OUT" > operations/release.yml
node node_modules/hexo/bin/hexo generate --config _config.yml,operations/release.yml
test -s "$OUT/index.html"
test -s "$OUT/css/arknights.css"
# No rendered page may pull in the FontAwesome stylesheet we just removed.
if grep -rqs 'lib/fontawesome/css/all.min.css' "$OUT"; then
  echo 'publish.sh: FontAwesome stylesheet leaked back into the output' >&2
  exit 1
fi
chmod -R a+rX "$OUT"
ln -s "$OUT" /var/www/myblog-arknights-next-$$
mv -Tf /var/www/myblog-arknights-next-$$ /var/www/myblog-arknights
printf 'Published %s\n' "$OUT"

# The render just succeeded, so anything the admin UI wrote into the content
# repo is known-good: commit and push it, keeping the content repo the single
# source of truth instead of a pile of uncommitted files. No-op when the tree
# is clean (the usual case for a CI-triggered publish).
bash operations/sync-content.sh || printf 'publish.sh: content sync failed (site is live; run operations/sync-content.sh by hand)\n' >&2
