# Conductor — Project Overview

## Purpose
Autonomous AI company operating system. The Conductor (human) issues directives to the Chief of Staff, who plans and delegates to a team of specialized AI agents. Agents work autonomously in the background.

## Architecture

- **`/backend`** — Fastify (Node.js + TypeScript) REST API + autonomous worker loop
- **`/frontend`** — Next.js 14 (App Router) dark-mode dashboard, port 5000
- **`/shared`** — Shared TypeScript types (no runtime deps)
- **`/render.yaml`** — Render deployment blueprint

## Tech Stack
- **Backend**: Node.js 20, TypeScript, Fastify, Prisma ORM, PostgreSQL, node-cron, zod, pino
- **Frontend**: Next.js 14, TypeScript, Tailwind CSS, SWR
- **Database**: PostgreSQL (via `DATABASE_URL` env var)

## Key Ports
- Frontend: 5000 (webview)
- Backend: 8080 (console)
- Worker: no port (background process)

## Workflows
- **Start application** — `cd frontend && npm run dev` (port 5000, webview)
- **Backend API** — `cd backend && node dist/server.js` (port 8080, console)
- **Worker** — `cd backend && node dist/worker/index.js` (console)

## Database
PostgreSQL via Replit built-in database. Schema managed with Prisma. Run `cd backend && npx prisma db push` to sync schema, `npx ts-node src/seed.ts` to seed agents.

## Agent Registry (seeded)
| Role | Name | Provider | Model |
|------|------|----------|-------|
| CoS | Chief of Staff | anthropic | claude-opus-4-6 |
| PM | Product Manager | anthropic | claude-sonnet-4-6 |
| UX | UX Designer | anthropic | claude-sonnet-4-6 |
| Dev1 | Developer (Builder) | openai | gpt-4o |
| Dev2 | Developer (Reviewer) | anthropic | claude-sonnet-4-6 |
| QA | QA Engineer | openai | gpt-4o-mini |
| Research | Research Analyst | openai | gpt-4o |
| Growth | Growth & Marketing | anthropic | claude-sonnet-4-6 |

## V1 Status: Mock Mode
All agent responses are deterministic mock JSON. Architecture is designed to swap in real LLM calls later by replacing mock agent handlers in `/backend/src/agents/`.

## Key Files
- `backend/src/server.ts` — Fastify server setup
- `backend/src/worker/index.ts` — 3-second polling worker loop
- `backend/src/agents/` — One file per agent role
- `backend/src/lib/governance.ts` — Kill switch, caps, loop enforcement
- `backend/prisma/schema.prisma` — Full database schema
- `frontend/app/page.tsx` — Executive Summary dashboard
- `frontend/lib/api.ts` — Typed fetch wrapper

## API Envelope
All responses: `{ success: boolean, data: T, error?: string }`
