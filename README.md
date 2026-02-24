# Vibe Map

A circular mood-tracking interface for mapping your emotional landscape.

## Setup

### 1. Install Node.js

Download and install Node.js from [nodejs.org](https://nodejs.org/) (LTS version recommended).

### 2. Install Dependencies

```bash
cd vibe-chart
npm install
```

### 3. Set Up Supabase Database

1. Go to your [Supabase Dashboard](https://supabase.com/dashboard)
2. Open the SQL Editor
3. Copy and paste the contents of `supabase/schema.sql`
4. Click "Run" to create the tables

### 4. Configure Environment (for local dev)

The `.env.local` file is already configured with your Supabase credentials.

### 5. Run Development Server

```bash
npm run dev
```

Visit `http://localhost:5173`

## Deploying to Vercel

### 1. Push to GitHub

```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/nacooe888/vibe-chart.git
git push -u origin main
```

### 2. Connect to Vercel

1. Go to [Vercel](https://vercel.com)
2. Import your GitHub repository
3. Add environment variables:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
4. Deploy

## Tech Stack

- React + Vite
- Supabase (Auth + Database)
- Vercel (Hosting)
