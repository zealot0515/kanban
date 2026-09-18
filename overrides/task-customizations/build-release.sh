#!/bin/bash
# Build a local macOS release from the current checkout, including uncommitted edits.
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage: ./overrides/task-customizations/build-release.sh [--arch arm64|x64|all] [--skip-install]

  --arch arm64    Apple Silicon (M-series)
  --arch x64      Intel
  --arch all      Build two separate DMGs
  --skip-install Reuse installed dependencies (run without this after lockfile changes)
  -h, --help     Show this help

Defaults to this Mac's architecture. Requires macOS, Node.js 22+, npm,
Git, and Xcode Command Line Tools. Installs locked dependencies, checks
types, tests the desktop shell, rebuilds the runtime and UI, then packages.

Output: packages/desktop/out/custom/<version>/ (DMG files + SHA256SUMS)
The release is ad-hoc signed, not notarized, and is never uploaded.
USAGE
}

fail() { printf 'Error: %s\n' "$*" >&2; exit 1; }

release_arch="$(uname -m)"
if [[ "$release_arch" == "x86_64" ]]; then release_arch="x64"; fi
skip_install=false
while [[ $# -gt 0 ]]; do
  case "$1" in
    --arch)
      [[ $# -ge 2 ]] || fail '--arch needs arm64, x64, or all'
      release_arch="$2"
      shift 2
      ;;
    --skip-install) skip_install=true; shift ;;
    -h|--help) usage; exit 0 ;;
    *) fail "Unknown argument: $1 (use --help)" ;;
  esac
done
case "$release_arch" in
  arm64|x64|all) ;;
  *) fail "Unsupported architecture: $release_arch" ;;
esac

[[ "$(uname -s)" == "Darwin" ]] || fail 'macOS is required to build this DMG'
for command_name in node npm git xcrun shasum; do
  command -v "$command_name" >/dev/null || fail "Missing command: $command_name"
done
node -e 'process.exit(Number(process.versions.node.split(".")[0]) >= 22 ? 0 : 1)' || fail 'Node.js 22+ is required'
xcrun --find clang >/dev/null 2>&1 || fail 'Install Xcode Command Line Tools: xcode-select --install'

override_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "$override_dir/../.." && pwd)"
desktop_root="$repo_root/packages/desktop"
cd "$repo_root"

# Use a distinct version without editing either package.json or lockfile.
source_revision="$(git rev-parse --short=12 HEAD)"
dirty_suffix=""
if [[ -n "$(git status --porcelain --untracked-files=normal)" ]]; then dirty_suffix='.dirty'; fi
base_version="$(node -p 'JSON.parse(require("node:fs").readFileSync("package.json", "utf8")).version')"
export KANBAN_RELEASE_VERSION="${base_version}-custom.${source_revision}${dirty_suffix}"

# Local releases neither upload source maps nor use signing credentials.
export SENTRY_AUTH_TOKEN=''
export CSC_IDENTITY_AUTO_DISCOVERY=false
unset CSC_LINK CSC_KEY_PASSWORD CSC_NAME CSC_KEYCHAIN
export OTEL_TELEMETRY_ENABLED=false
export OTEL_EXPORTER_OTLP_ENDPOINT='' OTEL_EXPORTER_OTLP_HEADERS=''
export OTEL_METRICS_EXPORTER=none OTEL_LOGS_EXPORTER=none
export POSTHOG_KEY=''

printf 'Building Kanban Custom %s (%s)\n' "$KANBAN_RELEASE_VERSION" "$release_arch"
if [[ "$skip_install" == false ]]; then
  npm ci --no-audit --no-fund
  npm --prefix web-ui ci --no-audit --no-fund
  npm --prefix packages/desktop ci --no-audit --no-fund
fi

npm run typecheck
npm run web:typecheck
npm --prefix packages/desktop run typecheck
npm --prefix packages/desktop test
node --test "$override_dir/desktop/launcher.test.mjs"
npm run build
npm --prefix packages/desktop run stage:cli
npm --prefix packages/desktop run build:ts
node packages/desktop/scripts/patch-node-pty.mjs

builder_arch_args=("--$release_arch")
if [[ "$release_arch" == all ]]; then builder_arch_args=(--arm64 --x64); fi
(
  cd "$desktop_root"
  ./node_modules/.bin/electron-builder --mac dmg "${builder_arch_args[@]}" \
    --config "$override_dir/desktop/electron-builder.cjs" --publish never
)

release_dir="$desktop_root/out/custom/$KANBAN_RELEASE_VERSION"
(
  cd "$release_dir"
  shopt -s nullglob
  packages=(*.dmg)
  [[ ${#packages[@]} -gt 0 ]] || fail 'No DMG was generated'
  shasum -a 256 "${packages[@]}" > SHA256SUMS
  shasum -a 256 -c SHA256SUMS
)
printf '\nRelease ready: %s\n' "$release_dir"
printf 'Copy the DMG to another Mac, open it, and drag Kanban Custom into Applications.\n'
