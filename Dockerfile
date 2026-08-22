# syntax=docker/dockerfile:1

# Built from the repository root: the server lives in mcp-server/, and the
# content it indexes at runtime lives in skills/ and agents/.

# Whole-repo stage. skills/ and agents/ come across in a single context copy
# rather than one COPY per directory, which the builder resolved unreliably.
# Their presence is asserted here so a bad context fails with a clear message
# instead of shipping an image with an empty index.
FROM node:22-alpine AS source
WORKDIR /src
COPY . .
RUN test -d skills && test -d agents \
 || { echo "ERROR: build context is missing skills/ or agents/; contains: $(ls -A)" >&2; exit 1; }

FROM node:22-alpine AS deps
WORKDIR /app/mcp-server
COPY mcp-server/package.json mcp-server/package-lock.json ./
RUN npm ci

FROM node:22-alpine AS build
WORKDIR /app/mcp-server
COPY --from=deps /app/mcp-server/node_modules ./node_modules
COPY mcp-server/package.json mcp-server/package-lock.json mcp-server/tsconfig.json ./
COPY mcp-server/src ./src
RUN npm run build

FROM node:22-alpine AS prod-deps
WORKDIR /app/mcp-server
COPY mcp-server/package.json mcp-server/package-lock.json ./
RUN npm ci --omit=dev

FROM node:22-alpine AS runtime
WORKDIR /app/mcp-server

ENV NODE_ENV=production

COPY --from=prod-deps /app/mcp-server/node_modules ./node_modules
COPY --from=build /app/mcp-server/dist ./dist
# Needed at runtime for "type": "module" — dist/*.js are ESM.
COPY --from=source /src/mcp-server/package.json ./

# Content indexed at boot, mirroring the repo layout.
COPY --from=source /src/skills /app/skills
COPY --from=source /src/agents /app/agents

ENV SKILLS_DIR=/app/skills
ENV AGENTS_DIR=/app/agents
ENV PORT=3001

EXPOSE 3001

CMD ["node", "dist/index.js"]
