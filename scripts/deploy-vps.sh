#!/usr/bin/env bash
set -euo pipefail

ssh vps 'set -euo pipefail
cd /home/luis/vikunja/mcp
git pull --ff-only
npm ci
npm run build
docker compose -f /home/luis/vikunja/docker-compose.yaml build mcp
docker compose -f /home/luis/vikunja/docker-compose.yaml up -d --no-deps --wait mcp
curl --fail --silent --show-error http://127.0.0.1:8847/health
'
