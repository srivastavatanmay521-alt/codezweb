# CodeZ Development — Package

## Folder structure
- `frontend/`   — React + Vite frontend
- `api-server/` — Express backend
- `lib/`        — Shared DB schema, OpenAPI spec, generated client
- `api/`        — Vercel serverless entry point
- `vercel.json` — Vercel deployment config

## Setup
```bash
pnpm install
# Set DATABASE_URL in your environment
pnpm --filter @workspace/db run push   # create DB tables
pnpm run dev                           # start everything
```

## Environment variables
- DATABASE_URL — PostgreSQL connection string (required)
