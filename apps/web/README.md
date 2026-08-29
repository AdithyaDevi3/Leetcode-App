This is the Method web application. It is a [Next.js](https://nextjs.org) app with a pseudocode-first practice workspace.

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

Copy `.env.example` to `.env.local` before using sign-in or a PostgreSQL-backed
practice flow. Keep `EVALUATION_JOB_STORE=memory` and
`CODE_EXECUTION_ENABLED=false` for ordinary local UI work.

## Private-beta deployment minimum

Before enabling live users, set the variables in `.env.example` in the hosting
platform's encrypted environment store, apply all database migrations, and set
`EVALUATION_JOB_STORE=postgres`. A scheduler must call the protected evaluation
worker route using `EVALUATION_WORKER_TOKEN`; monitor `/api/health` and
`/api/health/evaluations`. Do not set `CODE_EXECUTION_ENABLED=true` until the
Judge0 endpoint is deployed on isolated infrastructure and the execution worker
is scheduled with `EXECUTION_WORKER_TOKEN`.

The request middleware returns an `x-request-id` response header. Include that
value in support reports and operational logs; never log source code, prompts,
tokens, cookies, or credentials.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
