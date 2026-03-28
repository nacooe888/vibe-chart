# Vibe Chart

Daily mood-tracking app with a 12-zone vibe wheel, AI-powered energy reports, and sidereal astrological transit readings.

## Setup

### 1. Install Dependencies

```bash
cd vibe-chart
npm install
```

### 2. Set Up Supabase Database

1. Go to your [Supabase Dashboard](https://supabase.com/dashboard)
2. Open the SQL Editor
3. Copy and paste the contents of `supabase/schema.sql`
4. Click "Run" to create the tables (`vibe_logs`, `user_charts`, `user_profiles`)

### 3. Configure Environment (for local dev)

Create `.env.local` with:

```
VITE_SUPABASE_URL=your-supabase-url
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
```

### 4. Run Development Server

```bash
npm run dev
```

Visit `http://localhost:5173`

## Deploying to Vercel

1. Push to GitHub
2. Import the repo in [Vercel](https://vercel.com)
3. Add environment variables:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `SUPABASE_URL` (same value, used by serverless functions)
   - `SUPABASE_SERVICE_ROLE_KEY` (from Supabase dashboard)
   - `ANTHROPIC_API_KEY`
   - `ASTROAPP_API_KEY`
   - `ASTROAPP_EMAIL`
   - `ASTROAPP_PASSWORD`
4. Deploy

## Tech Stack

- React + Vite
- Supabase (Auth + Database)
- Vercel (Hosting + Serverless Functions)
- Anthropic Claude API (AI readings)
- Swiss Ephemeris WASM (planetary calculations)
- AstroApp API (natal chart generation)
- Sidereal Fagan-Allen ayanamsa
