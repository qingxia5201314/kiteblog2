#!/bin/bash
# Drop the unreferenced, render-blocking FontAwesome stylesheet from the theme.
#
# themes/arknights/layout/includes/meta-data.pug:91 unconditionally links
# /lib/fontawesome/css/all.min.css (102 KB raw / ~22 KB gzip) into <head> on all
# 74 rendered pages, but nothing consumes it: theme.social is empty, so aside.pug's
# `if icon.substring(0,2) === "fa"` branch never renders, and no template emits an
# `fa-` class. Remove the <link> so the file is never requested during first paint.
#
# The theme is a pristine third-party checkout recorded as a malformed submodule
# (all-zero gitlink, no .git/modules), so edits inside it are untracked local state
# that a fresh clone loses. Patching the working copy at render time keeps the fix
# in version control here. Idempotent; reversing it is just a re-clone.
set -euo pipefail

THEME=/opt/kitepop-hexo-standard/themes/arknights
TARGET="$THEME/layout/includes/meta-data.pug"

test -f "$TARGET" || { echo "patch-fontawesome: missing $TARGET" >&2; exit 1; }

if grep -q "lib/fontawesome/css/all.min.css" "$TARGET"; then
  sed -i "/lib\/fontawesome\/css\/all\.min\.css/d" "$TARGET"
  echo "patch-fontawesome: removed blocking FontAwesome stylesheet link"
else
  echo "patch-fontawesome: already applied (no-op)"
fi
