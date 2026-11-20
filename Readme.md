# Skills & Agents

A collection of Claude skills (`skills/`) and agents (`agents/`), served over MCP
by the server in `mcp-server/`.

## Claude Code plugins

This repo is also a Claude Code plugin marketplace
(`.claude-plugin/marketplace.json`). Installed as a plugin, a skill's
description is always in context, so it triggers on its own instead of waiting
for a `get_skill` call, and its `references/` files are read from disk.

| Plugin        | Skill source            |
|---------------|-------------------------|
| `watched-run` | `skills/watched-run/`   |

Install (Claude Code 2.1.275 or later):

```
/plugin install watched-run --marketplace milafrerichs/agents-skills-collection
```

Or in two steps:

```
/plugin marketplace add milafrerichs/agents-skills-collection
/plugin install watched-run@agents-skills-collection
```

Plugins point at the same `skills/<name>/` directories the MCP server indexes,
so there is one copy to edit. No `version` is set, so installs track the
marketplace's git commit; pick up changes with `/plugin marketplace update
agents-skills-collection`. Clients that can't install Claude Code plugins
(Codex, claude.ai) keep using the MCP server.

Check manifest changes with `claude plugin validate .`.

## Deploying to Railway

`railway.json` builds the repository root with the root `Dockerfile`. The build
context is the whole repo, so `skills/` and `agents/` are copied into the image
alongside the compiled server:

```
/app/mcp-server/dist   compiled server (WORKDIR, start command runs here)
/app/skills            copied from skills/
/app/agents            copied from agents/
```

The image sets `SKILLS_DIR=/app/skills` and `AGENTS_DIR=/app/agents`, which is
what the server reads at boot to build its index. Override either one as a
Railway service variable to point at a different location.

Leave the service's **Root Directory** unset (or set it to `/`). Pointing it at
`/mcp-server` would drop `skills/` and `agents/` from the build context and the
server would come up with an empty index.

`PORT` defaults to `3001` and is overridden by Railway at runtime.

Endpoints:

- `POST /mcp` — streamable HTTP MCP transport
- `GET /health` — health check (used by `healthcheckPath`), reports indexed counts

## Local development

```bash
cd mcp-server
npm install
npm run dev
```
