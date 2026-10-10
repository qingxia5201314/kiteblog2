#!/bin/bash
set -euo pipefail
cd /opt/kitepop-hexo-standard
export TMPDIR=$PWD/operations/cache npm_config_cache=$PWD/operations/cache/npm
exec 9>operations/publish.lock
flock -n 9 || { echo 'Another publish is running'; exit 1; }
STAMP=$(date -u +%Y%m%dT%H%M%SZ)-$$
OUT=/var/www/myblog-arknights-$STAMP
printf 'Backing up source...\n'
tar -czf /opt/kitepop-backups/hexo-source-$STAMP.tar.gz source _config.yml _config.arknights.yml
# Strip the unreferenced, render-blocking FontAwesome stylesheet before
# rendering. Safe to run every time; see operations/patch-fontawesome.sh.
bash operations/patch-fontawesome.sh
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
