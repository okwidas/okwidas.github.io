#!/usr/bin/env bash
# Run this from inside your local clone of the demonlist repo.
# It fetches fresh data using your own network (not GitHub's), then commits and pushes it.
set -e

cd "$(dirname "$0")"

echo "fetching demonlist..."
node fetch.js

if git diff --quiet -- data/; then
  echo "no changes, nothing to push"
else
  git add data/demonlist.json data/updated_at.txt
  git commit -m "manual: update demonlist"
  git push
  echo "pushed update"
fi
