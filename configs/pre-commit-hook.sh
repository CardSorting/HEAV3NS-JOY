#!/usr/bin/env sh
# [LAYER: INFRASTRUCTURE]
# Portable Git pre-commit hook for HEAV3NS-JOY (Joyzoning & Spider Sovereign Guard).
# Copy or symlink into `.git/hooks/pre-commit` (`chmod +x .git/hooks/pre-commit`).

set -e

JOY_BIN="${HEAV3NS_JOY_BIN:-./bin/joy-check.mjs}"

if [ ! -f "$JOY_BIN" ]; then
  echo "[HEAV3NS-JOY] Warning: joy-check binary not found at $JOY_BIN; skipping pre-commit check."
  exit 0
fi

echo "[HEAV3NS-JOY] Running Sovereign Architectural Guard..."
node "$JOY_BIN" . --theme strict

