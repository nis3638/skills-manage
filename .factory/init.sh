#!/bin/bash
set -e

cd /Users/happypeet/Documents/GitHubMe/skills-manage

# Install Node dependencies (idempotent)
if [ ! -d "node_modules" ]; then
  pnpm install
fi

# Ensure Rust dependencies are fetched
if [ -d "src-tauri" ]; then
  cd src-tauri
  cargo fetch 2>/dev/null || true
  cd ..
fi

# Create test fixture directories for scanner tests
mkdir -p /tmp/skills-manage-test-fixtures

echo "Init complete."
