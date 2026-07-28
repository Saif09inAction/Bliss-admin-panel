# Laiza Admin Web

Admin panel for Laiza Bags — deploy separately on Vercel (for iOS admin users).

## Setup

1. Copy `.env.example` to `.env.local` and fill in Firebase values from your Firebase project (`laiza-6aace`):

```
NEXT_PUBLIC_FIREBASE_API_KEY=...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=laiza-6aace.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=laiza-6aace
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=laiza-6aace.firebasestorage.app
```

2. Ensure admin accounts exist in Firestore `admins/{phone}` with `name` and `password` fields.

3. Install and run locally:

```bash
cd admin-web
npm install
npm run dev
```

Open http://localhost:3000

## Deploy to Vercel

1. Push this repo (or only the `admin-web` folder as root if using a monorepo import).
2. In Vercel: **New Project** → import repo → set **Root Directory** to `admin-web`.
3. Add the same `NEXT_PUBLIC_FIREBASE_*` environment variables in Vercel project settings.
4. Deploy.

## Features

- Admin login (`admins` collection)
- Dashboard stats
- Workers (Staff & Kaariger)
- Raw materials CRUD
- Store inventory (read-only)
- Kaariger orders + advance payments
- Staff attendance
- All records (orders, pickups, returns) with CSV export
