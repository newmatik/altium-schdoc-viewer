#!/usr/bin/env bash
#
# Publish altium-schdoc-viewer to the Visual Studio Marketplace (VS Code) and to Open VSX
# (used by Cursor, VSCodium, Gitpod, and other Code forks).
#
# Requires:
#   - $VSCE_PAT   — Azure DevOps personal access token with "Marketplace > Manage" scope
#                   for publisher "newmatik" (see https://code.visualstudio.com/api/working-with-extensions/publishing-extension)
#   - $OVSX_PAT   — Open VSX access token (from https://open-vsx.org/user-settings/tokens)
#
# Usage:
#   ./scripts/publish.sh           # publish current version to both registries
#   ./scripts/publish.sh --dry-run # build, typecheck, test, package — but don't publish
#   ./scripts/publish.sh --vscode-only
#   ./scripts/publish.sh --ovsx-only
#
set -euo pipefail

cd "$(dirname "$0")/.."

DRY_RUN=0
TARGET_VSCODE=1
TARGET_OVSX=1

for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    --vscode-only) TARGET_OVSX=0 ;;
    --ovsx-only) TARGET_VSCODE=0 ;;
    *) echo "Unknown arg: $arg" >&2; exit 2 ;;
  esac
done

VERSION=$(node -p "require('./package.json').version")
VSIX="altium-schdoc-viewer-${VERSION}.vsix"

echo "=== altium-schdoc-viewer publish ==="
echo "Version: ${VERSION}"
echo "Dry run: $([[ $DRY_RUN -eq 1 ]] && echo yes || echo no)"
echo "Targets:$([[ $TARGET_VSCODE -eq 1 ]] && echo " vscode-marketplace")$([[ $TARGET_OVSX -eq 1 ]] && echo " open-vsx")"
echo

# Preflight — everything CI checks plus a clean package build.
echo "--- Typecheck ---"
npm run typecheck

echo "--- Tests ---"
npm test

echo "--- Package ---"
# --no-dependencies because esbuild already inlines everything from node_modules.
npx vsce package --no-dependencies

if [[ ! -f "$VSIX" ]]; then
  echo "ERROR: expected $VSIX but it was not produced" >&2
  exit 1
fi
echo "Produced: $VSIX ($(du -k "$VSIX" | awk '{print $1}') KB)"

if [[ $DRY_RUN -eq 1 ]]; then
  echo
  echo "Dry run complete. Not publishing. To publish: ./scripts/publish.sh"
  exit 0
fi

# Confirmation gate — publishing is an external side effect.
echo
read -r -p "Publish $VSIX to the selected registries? [y/N] " CONFIRM
if [[ ! "$CONFIRM" =~ ^[Yy]$ ]]; then
  echo "Aborted."
  exit 1
fi

if [[ $TARGET_VSCODE -eq 1 ]]; then
  : "${VSCE_PAT:?Set VSCE_PAT to your Azure DevOps personal access token}"
  echo
  echo "--- Publishing to VS Marketplace ---"
  npx vsce publish --no-dependencies --packagePath "$VSIX" --pat "$VSCE_PAT"
fi

if [[ $TARGET_OVSX -eq 1 ]]; then
  : "${OVSX_PAT:?Set OVSX_PAT to your Open VSX access token}"
  echo
  echo "--- Publishing to Open VSX (Cursor / VSCodium) ---"
  npx ovsx publish "$VSIX" --pat "$OVSX_PAT"
fi

echo
echo "Done. Listings (may take a minute to appear):"
[[ $TARGET_VSCODE -eq 1 ]] && echo "  https://marketplace.visualstudio.com/items?itemName=newmatik.altium-schdoc-viewer"
[[ $TARGET_OVSX -eq 1 ]] && echo "  https://open-vsx.org/extension/newmatik/altium-schdoc-viewer"
