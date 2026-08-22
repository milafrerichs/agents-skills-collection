# syntax=docker/dockerfile:1

# Built from the repository root so that the server source (mcp-server/) and the
# content it indexes at runtime (skills/, agents/) are all in the build context.

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

# The compiled server plus its production dependencies.
COPY --from=prod-deps /app/mcp-server/node_modules ./node_modules
COPY --from=build /app/mcp-server/dist ./dist
COPY mcp-server/package.json ./

# Content indexed at boot. Kept outside mcp-server/ so it mirrors the repo layout.
COPY skills /app/skills
COPY agents /app/agents

ENV SKILLS_DIR=/app/skills
ENV AGENTS_DIR=/app/agents
ENV PORT=3001

EXPOSE 3001

CMD ["node", "dist/index.js"]
