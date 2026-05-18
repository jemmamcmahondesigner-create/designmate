# DesignTrace

Next.js 14 + TypeScript + Tailwind + Supabase starter, scaffolded with a clean structure for a multi-tenant B2B SaaS app.

## Getting started

1. Install Node.js (recommend Node 20+).
2. Install deps:

```bash
npm install
```

3. Set environment variables in `.env.local`:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `ANTHROPIC_API_KEY`

4. Run the dev server:

```bash
npm run dev
```

## Folder structure

- `app/`: routes (App Router)
- `components/`: reusable UI components
- `lib/`: utilities and API clients (Supabase, env helpers, etc.)
- `types/`: shared TypeScript types
- `hooks/`: custom React hooks

