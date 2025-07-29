#!/bin/sh
set -e

# Ensure script runs from repo root regardless of current directory
cd "$(dirname "$0")/.."

# Basic setup script for installing npm dependencies
# Usage: run this script from the repository root

if [ ! -d node_modules ]; then
  echo "Installing npm dependencies..."
  npm ci || npm install
else
  echo "node_modules already exists. Skipping installation."
fi

# Print Next.js version to verify install
npx next -v || echo "Next.js not installed."
