# Help me plan the launch of my AI SaaS startup: what to build first, who to target, and what it costs.

_Fastest lane: opencode (92.9s). 1/3 lanes answered._

## Answer

**MVP to Build First**: AI email summarizer for founders. Pain: founders spend 1-2 hours/day triaging email. Value: "Summarize last 24h of important emails in 1 paragraph + 3 action items". Keep scope tiny: Gmail OAuth, summarize with AI, show digest. Don't build mobile app, don't build admin panel - skip those. 

**Target Users**: YC founders (batch S24/S25/W26) + IndieHackers who post "inbox zero" complaints. Reach via: post in IndieHackers "Show HN" (build in public), DM 5 founders/day, focus on those with <1000 employees (self-serve). Goal: 10 paying users by Oct 31 2026.

**Tech Stack (real tools)**:
- **Framework**: Next.js 15 + TypeScript (Vercel)
- **AI**: OpenRouter API (models: `google/gemini-2.5-flash` cheap, fallback to `openai/gpt-4.1-mini`). Avoid vendor lock-in.
- **Auth**: Clerk (free tier). 
- **DB**: Supabase (Postgres + RLS, free tier).
- **Payments**: Stripe (Checkout + customer portal).
- **Hosting**: Vercel (Hobby free; Pro $20/mo if need more).
- **Infra**: Upstash Redis for rate limiting ($0-1/mo). Posthog + Sentry (free).

**Step-by-Step (concrete)**:
1. **Scaffold** (Oct 4-6 2026): `npx create-next-app@latest email-sum --typescript --tailwind --eslint --app --src-dir=false --import-alias "@/*"`
2. **Auth + DB** (Oct 7-9): Set up Clerk + Supabase. Files: `lib/supabase.ts`, `lib/clerk.ts`, `.env.example` with required vars. Run: `npm i @clerk/nextjs @supabase/supabase-js openai stripe upstash/redis`
3. **Gmail integration** (Oct 10-12): Google OAuth (Gmail readonly scope). Implement in `app/api/gmail/route.ts`. **Unsure**: need to verify Google Cloud app verification timeline (can take days) - may block launch; have manual paste fallback.
4. **AI summarization** (Oct 13-15): `app/api/summarize/route.ts` calling OpenRouter. Add system prompt + token caps (max 2000 tokens). 
5. **UI + Stripe** (Oct 16-18): Build digest view (`app/digest/page.tsx`), pricing (`app/pricing/page.tsx`). Deploy to Vercel.

**Launch & Costs**:
- **Domain** (Namecheap/Cloudflare): $8-12/year
- **Vercel**: $0-20/mo
- **OpenRouter**: ~$5-15/mo for first 10-20 users (Gemini Flash)
- **Supabase/Clerk/Posthog/Sentry**: $0/mo (free tiers)
- **Buffer**: $20 one-time for Google verification if needed
- **Total monthly burn**: ~$5-25/mo (excluding tx fees). **Unsure**: OpenRouter costs scale with usage - need to enforce caps.

**Action Today**: Run scaffold command, create OpenRouter + Clerk + Supabase accounts. Write `.env.example` with keys. Start Oct 4 2026, aim for working MVP demo Oct 18 2026.

## Lanes that did not contribute

- `undefined` — unavailable: gateway not listening on 127.0.0.1:18789 (start it with: openclaw gateway start)
- `undefined` — cut: cut after first success