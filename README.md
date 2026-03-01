# Conductor

An autonomous AI company operating system. One human (the Conductor) interacts only with the Chief of Staff (CoS). The CoS orchestrates all other agents. Agents work autonomously in the background whether the UI is open or not.

## System Overview

Conductor is a multi-agent system for autonomous execution of business work:

- **Chief of Staff (CoS)** — receives directives from the Conductor, generates plans, delegates to agents
- **Product Manager** — creates PRDs from CoS plans
- **UX Designer** — creates design specs from PRDs
- **Developer (Builder)** — implements code changes from UX specs
- **Developer (Reviewer)** — reviews code from Dev1 with loop enforcement
- **QA Engineer** — runs test reports
- **Research Analyst** — conducts market and competitive research
- **Growth & Marketing** — creates growth plans

## Architecture

```
/backend   — Fastify (Node.js + TypeScript) autonomous agent engine
/frontend  — Next.js 14 Conductor dashboard
/shared    — Shared TypeScript types
render.yaml — Render deployment blueprint
```

Backend and frontend are independently deployable. Frontend communicates with backend only via REST API.

## Local Development Setup

### Prerequisites
- Node.js 20+
- PostgreSQL database

### Environment Variables

**Backend** (`backend/.env`):
```
DATABASE_URL=postgresql://...
PORT=8080
```

**Frontend** (`frontend/.env.local`):
```
NEXT_PUBLIC_BACKEND_URL=http://localhost:8080
```

### Running Locally

1. **Install dependencies**
   ```bash
   cd backend && npm install
   cd frontend && npm install
   ```

2. **Set up the database**
   ```bash
   cd backend
   npx prisma db push      # Creates schema
   npx ts-node src/seed.ts # Seeds agents and settings
   ```

3. **Start backend**
   ```bash
   cd backend && npm run dev
   ```

4. **Start worker** (separate terminal)
   ```bash
   cd backend && npm run dev:worker
   ```

5. **Start frontend**
   ```bash
   cd frontend && npm run dev
   ```

6. Open `http://localhost:5000`

## Package Scripts (Backend)

| Script | Description |
|--------|-------------|
| `npm run build` | Compile TypeScript |
| `npm start` | Run compiled server |
| `npm run worker` | Run compiled worker |
| `npm run dev` | Dev server with hot reload |
| `npm run dev:worker` | Dev worker with hot reload |
| `npm run db:migrate` | Run Prisma migrations |
| `npm run db:seed` | Seed agents and settings |
| `npm run db:generate` | Regenerate Prisma client |

## Render Deployment

Deploy using `render.yaml`:

1. Connect your GitHub repo to [Render](https://render.com)
2. Create a new Blueprint from `render.yaml`
3. Set environment variables:
   - `OPENAI_API_KEY` — OpenAI API key (set on backend and worker services)
   - `ANTHROPIC_API_KEY` — Anthropic API key (set on backend and worker services)
4. Deploy — Render will create:
   - `conductor-db` — PostgreSQL database
   - `conductor-backend` — Fastify API server on port 8080
   - `conductor-worker` — Background worker process
   - `conductor-frontend` — Next.js dashboard

After first deploy, run the seed script to populate agents:
```bash
cd backend && DATABASE_URL=<your-prod-url> npx ts-node src/seed.ts
```

## Demo Workflow

1. Navigate to `/directives`
2. Submit: *"Research the top 5 competitors in the AI agent orchestration space"*
3. Worker processes CoS task → generates plan → creates Research task
4. Worker processes Research task → produces RESEARCH artifact
5. CoS generates EXEC_SUMMARY promoted to exec visibility
6. Executive dashboard shows promoted artifacts with real data

## Adding a New Agent via UI

1. Navigate to `/agents`
2. Fill in the **Add New Agent** form at the bottom:
   - **Role** (unique identifier, e.g. `Legal`)
   - **Name** (display name, e.g. `Legal Advisor`)
   - **Provider** (`openai` or `anthropic`)
   - **Model** (e.g. `gpt-4o` or `claude-sonnet-4-6`)
3. Click **Add Agent**

The agent is immediately active and eligible to receive tasks. To assign tasks to the new agent role, extend the worker's role switch in `backend/src/worker/index.ts` and add a corresponding agent handler in `backend/src/agents/`.

## Governance Rules

- Only directives create tasks with `createdByRole=CEO`
- Only CoS worker execution creates downstream tasks
- All `prod` targetEnv tasks require human approval before execution
- Global kill switch halts all worker processing
- Daily token cap and per-run token cap enforced at worker level
- Dev1↔Dev2 review loops capped at `maxReviewLoops`
