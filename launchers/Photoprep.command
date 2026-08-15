#!/bin/bash
# Photoprep — double-click to start.
#
# Finder runs this from the user's home directory, so resolve the app relative to THIS file
# rather than the working directory.
cd "$(dirname "$0")/.." || exit 1

if ! command -v node >/dev/null 2>&1; then
  echo "Photoprep needs Node.js, which doesn't seem to be installed."
  echo "Get it from https://nodejs.org (the 'LTS' button), then double-click this again."
  echo
  read -n 1 -s -r -p "Press any key to close..."
  exit 1
fi

echo "Starting Photoprep — your browser will open in a moment."
echo "Keep this window open while you work. Close it when you're done."
echo
exec node bin/cli.js "$@"
