#!/usr/bin/env bash
# Provision the browser the client/e2e suites drive (#437).
#
# Idempotent: everything already present is skipped, so re-running is cheap.
# Nothing is installed system-wide and NO SUDO IS REQUIRED — the browser and
# the shared libraries it needs both land under $E2E_CACHE (in $HOME, never
# /tmp: WSL wipes /tmp between restarts).
#
#   bash scripts/e2e-setup.sh      # or: npm run e2e:setup
#
# client/e2e/lib.mjs discovers what this script installs on its own, so after
# a successful run `node client/e2e/a11y.mjs` works with no exported env.
set -euo pipefail

E2E_CACHE="${E2E_CACHE:-$HOME/.cache/e2e-chrome}"
CHROME_DIR="$E2E_CACHE/chrome"
LIB_DIR="$E2E_CACHE/lib"

say() { printf '\033[36m==\033[0m %s\n' "$*"; }

# --- macOS: the suites use the system Chrome, so there is nothing to provision.
if [ "$(uname -s)" = "Darwin" ]; then
  if [ -x "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" ]; then
    say "macOS: system Chrome found — nothing to provision."
    exit 0
  fi
  echo "macOS: Google Chrome not found in /Applications." >&2
  echo "Install it, or point the suites at another build with CHROME=/path/to/chrome." >&2
  exit 1
fi

# --- Linux (incl. WSL): a pinned Chrome for Testing + its missing shared objects.
say "Cache: $E2E_CACHE"

# 1. The browser itself. @puppeteer/browsers downloads AND extracts (no unzip
#    needed). --path is the cache ROOT: it creates the "chrome" directory
#    itself, giving $CHROME_DIR/<platform>-<version>/chrome-linux64/chrome.
if compgen -G "$CHROME_DIR"/*/chrome-linux64/chrome > /dev/null; then
  say "Chrome for Testing already installed — skipping download."
else
  say "Installing Chrome for Testing (stable) into $CHROME_DIR …"
  mkdir -p "$E2E_CACHE"
  npx --yes @puppeteer/browsers install "chrome@stable" --path "$E2E_CACHE"
fi

# 2. The five shared objects a bare Ubuntu 24.04 lacks, from three packages.
#    `apt-get download` + `dpkg-deb -x` both work as an unprivileged user, so
#    this needs no root — we only ever unpack into our own cache (~2 MB).
NEEDED_LIBS=(libnspr4.so libnss3.so libnssutil3.so libsmime3.so libasound.so.2)
missing=0
for lib in "${NEEDED_LIBS[@]}"; do
  [ -e "$LIB_DIR/$lib" ] || missing=1
done

if [ "$missing" -eq 0 ]; then
  say "Shared libraries already extracted — skipping."
else
  say "Extracting shared libraries into $LIB_DIR …"
  mkdir -p "$LIB_DIR"
  work="$(mktemp -d)"
  trap 'rm -rf "$work"' EXIT
  (
    cd "$work"
    # libasound2t64 is the Ubuntu 24.04 (t64) name; older releases ship libasound2.
    apt-get download libnspr4 libnss3 libasound2t64 2>/dev/null ||
      apt-get download libnspr4 libnss3 libasound2
    for deb in ./*.deb; do dpkg-deb -x "$deb" extracted/; done
    find extracted -name '*.so*' -type f -exec cp -P {} "$LIB_DIR/" \;
    find extracted -name '*.so*' -type l -exec cp -P {} "$LIB_DIR/" \;
  )
fi

# 3. Prove it starts — a silent half-install is the failure mode worth catching.
chrome_bin="$(compgen -G "$CHROME_DIR"/*/chrome-linux64/chrome | head -n1)"
say "Verifying $chrome_bin"
LD_LIBRARY_PATH="$LIB_DIR" "$chrome_bin" --version

say "Ready. Start the dev stack, then: npm run e2e:all -w client"
