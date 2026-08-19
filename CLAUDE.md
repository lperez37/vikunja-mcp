# Vikunja MCP

## Architecture

This MCP server is deployed on the `vps` SSH host. MCP clients connect over
Tailscale to `http://vps:8847/mcp`, as configured in `.mcp.json`.

The production checkout is `/home/luis/vikunja/mcp`. It is built as the `mcp`
service in `/home/luis/vikunja/docker-compose.yaml`. Inside the Compose network,
the MCP connects to Vikunja at `http://vikunja:3456` using the API token stored
in the VPS `/home/luis/vikunja/.env` file. Never print or commit that file.

## Deployment

Deploy the current `main` branch from this workstation:

```bash
./scripts/deploy-vps.sh
```

The script performs a fast-forward-only pull in the production checkout,
installs dependencies, builds `dist/`, rebuilds and replaces only the `mcp`
container, waits for its Docker health check, and probes `/health`.

Before deploying, push the intended commit to `origin/main`; the VPS checkout
pulls from `git@github.com:lperez37/vikunja-mcp.git`.

## Verification

```bash
curl http://vps:8847/health
ssh vps 'docker compose -f /home/luis/vikunja/docker-compose.yaml ps mcp'
ssh vps 'docker logs --since 10m vikunja-mcp-1'
```

The health response must report `status: ok` and `auth: required`. The `/mcp`
endpoint itself requires the bearer token configured by the MCP client.

HTTP MCP sessions are held in memory and are lost on deployment. An unknown or
expired session ID must receive HTTP 404 so clients can initialize a new session.
If a client still reports `Server not initialized`, reconnect or restart that
client and inspect the MCP container logs.
