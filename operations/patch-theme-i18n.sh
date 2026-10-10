#!/bin/bash
# Make the theme's pagination links follow the site language.
#
# themes/arknights calls Hexo's built-in `paginator()` helper from five
# templates (index, archive, category, tag, post) with no arguments, so the
# helper falls back to its own defaults -- the literal strings "Prev" and
# "Next". Those live in hexo/dist/plugins/helper/paginator.js and have nothing
# to do with the theme's languages/*.yml, which already carries the
# translations (`post.prev: 上一篇 →`, `post.next: ← 下一篇`).
#
# The helper merges its argument over the defaults (`Object.assign({...},
# options)`), so passing prev_text/next_text overrides just those two.
#
# Note on syntax: `__()` has to be called inline inside the attribute-like
# argument list. Extracting it to `- let x = __('post.prev')` on preceding lines
# also compiles, but keeping the call inline means the patch is a single
# self-contained line per template.
#
# The theme is a pristine third-party checkout recorded as a gitlink, so edits
# inside it are untracked local state that a fresh clone loses. Patching the
# working copy at render time keeps the fix in version control here.
# Idempotent; reversing it is just a re-clone.
set -euo pipefail

THEME=/opt/kitepop-hexo-standard/themes/arknights

OLD='!= paginator()'
NEW="!= paginator({prev_text: __('post.prev'), next_text: __('post.next')})"

patched=0
for tpl in index archive category tag post; do
  target="$THEME/layout/$tpl.pug"
  [ -f "$target" ] || { echo "patch-theme-i18n: missing $target" >&2; exit 1; }
  if grep -qF "$OLD" "$target"; then
    # | as the sed delimiter: the replacement contains slashes.
    sed -i "s|$OLD|$NEW|g" "$target"
    patched=$((patched + 1))
    echo "patch-theme-i18n: $tpl.pug"
  fi
done

if [ "$patched" -eq 0 ]; then
  echo "patch-theme-i18n: already applied (no-op)"
else
  printf 'patch-theme-i18n: localized paginator() in %s template(s)\n' "$patched"
fi
