# Scripture Memory

Hide God’s Word in your heart.

A mobile-first web app for memorizing one Protestant book at a time with flip cards and a fixed Daily → Weekly → Quarterly calendar. Accounts are invite-only: Jay creates users from the Supabase dashboard. Each person’s books, chunks, trackers, and completions are isolated with Supabase Row Level Security.

This is a new app inspired by the live Scripture Memory product. It does **not** store a full-Bible verse table. Chapter and verse text is fetched on demand from [API.Bible](https://scripture.api.bible/) through a Vercel serverless function.

## Stack

Vite · React · TypeScript · Tailwind CSS · React Router · Supabase (Auth + Postgres) · Vercel

## Features

- Email OTP (`shouldCreateUser: false`; only existing or invited users can sign in)
- Invite-only admin portal at `/admin` (Jay only; email + password, not OTP)
- One active book per user; switching books deactivates the previous selection
- Translation picker at book setup (CSB, NIV, and KJV are listed first when the API.Bible account includes them, plus every other version the key can access)
- Verse text from `/api/bible` (server-side `API_BIBLE_KEY` / `BIBLE_API_KEY` only)
- Tap between verses to set chunk breaks targeting 25–40 words
- Optional onboarding: already-memorized chunks can start in Daily, Weekly, or Quarterly
- Flip-card practice (reference on the front, text on the back). After the first finish of the day, Home **Review practice** and the session **Practice again** button reopen the same due cards. Extra reps write another `daily_completions` row (`session_number` 2, 3, …) and do not change due dates or Queue promotions. See `src/lib/practice.ts`.
- Fixed schedule, not SM-2:
  - **Daily** every day; graduate to Weekly after 49 days from `week_started`
  - **Weekly** on an assigned `review_day_of_week`; graduate to Quarterly after 213 days from `phase_start_date`
  - **Quarterly** on an assigned `quarterly_review_sunday` (terminal)
- Queue: unused chunks wait. At most one queued chunk is promoted at a time, with `week_started = nextMonday(today)`. Promotion happens only when every currently-due Daily chunk has been practiced at least once and no Daily chunk is already pending in the future. See `src/lib/schedule.ts`.
- Home/stats: Daily streak, phase counts, upcoming graduations, next queued chunk, book progress
- Default timezone `Pacific/Honolulu`, stored on `user_profiles`

Routes: `/` home, `/book-setup`, `/practice`, `/stats`. Unknown learner paths redirect home. Admin: `/admin`.

## 1. Create a Supabase project

1. Create a project at [supabase.com](https://supabase.com).
2. Open **SQL Editor** and paste the entire contents of [`supabase/schema.sql`](supabase/schema.sql). Run it.
   - Or, with the [Supabase CLI](https://supabase.com/docs/guides/cli): `supabase link` then `supabase db push`.
3. Confirm these tables exist: `user_profiles`, `book_selections`, `chunks`, `memorization_trackers`, `daily_completions`.
4. Confirm **RLS is enabled** on each of those tables. Policies allow an authenticated user to read and write only their own rows.

### Auth settings

1. **Authentication → URL Configuration**
   - Site URL: `http://localhost:5173` for local work, then your Vercel URL in production.
   - Redirect URLs: add both `http://localhost:5173/**` and `https://YOUR_VERCEL_DOMAIN/**`.
2. **Authentication → Email**
   - Keep email provider enabled.
   - Enable **Email** and **Email + Password** providers. Learners stay OTP-only. The admin portal at `/admin` uses email + password for `jay.garces@protonmail.com` only.
   - Sign-in on the main app is an **email OTP only** (no magic link). The learner app does **not** create accounts (`shouldCreateUser: false`). Invite learners from `/admin/invite` (or Authentication → Users → Invite). Uninvited addresses get Supabase’s error (typically user not found / signups not allowed).
   - Edit the **Magic Link** template so `{{ .Token }}` is the primary content — the code, not a link:

```html
<h2>Sign in to Scripture Memory</h2>
<p>Enter this code in the app:</p>
<p><strong>{{ .Token }}</strong></p>
```

When an invited user is created in `auth.users`, a trigger inserts `user_profiles` with timezone `Pacific/Honolulu`.

## 2. Get an API.Bible key

1. Register at [API.Bible](https://scripture.api.bible/) and create an app key.
2. The key must live only in a **server** environment variable (`API_BIBLE_KEY` or `BIBLE_API_KEY`). Never put it in a `VITE_` variable.
3. The app lists whatever Bibles that key is authorized to read. Licensed text is reported with the official FUMS v3 script in `index.html`.

## 3. Run locally

```bash
npm install
cp .env.example .env
```

Fill in `.env`:

```
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-or-publishable-key
API_BIBLE_KEY=your-api-bible-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
ADMIN_BOOTSTRAP_PASSWORD=
ADMIN_EMAIL=jay.garces@protonmail.com
```

Use the **anon / publishable** key in the client. Never put `SUPABASE_SERVICE_ROLE_KEY` or `ADMIN_BOOTSTRAP_PASSWORD` in a `VITE_` variable.

```bash
npm run dev
```

Vite serves the app at http://localhost:5173 and proxies `/api/bible` and `/api/admin/*` through the same handlers used on Vercel.

```bash
npm test
npm run build
```

## 4. Deploy on Vercel

1. Import this GitHub repository into [Vercel](https://vercel.com).
2. Framework preset: Vite. Build command: `npm run build`. Output: `dist`.
3. Set environment variables on the Vercel project:

| Name | Where it is used |
| --- | --- |
| `VITE_SUPABASE_URL` | Browser (Supabase client) |
| `VITE_SUPABASE_ANON_KEY` | Browser (Supabase client) |
| `API_BIBLE_KEY` | Server only (`/api/bible`) |
| `SUPABASE_SERVICE_ROLE_KEY` | Server only (`/api/admin/*`) |
| `ADMIN_BOOTSTRAP_PASSWORD` | Server only (first `/admin` login) |
| `ADMIN_EMAIL` | Server only (defaults to `jay.garces@protonmail.com`) |

`BIBLE_API_KEY` is accepted as an alias for the Bible key. Do not put the service role key or bootstrap password in any `VITE_` variable.

4. Deploy. Then set the Supabase Site URL and redirect URLs to the Vercel domain.
5. `vercel.json` rewrites unknown paths to `index.html` so React Router works, while `/api/*` stays serverless.

### Admin portal

Open `/admin`. Only `jay.garces@protonmail.com` (or `ADMIN_EMAIL`) can sign in.

1. Enable **Email + Password** in Supabase Auth (learners still use OTP on `/`).
2. Set `ADMIN_BOOTSTRAP_PASSWORD` on Vercel (Jay’s bootstrap value). Do not commit it.
3. Sign in at `/admin` with that email and the bootstrap password.
4. The portal forces a password change. After that, the bootstrap password no longer works.
5. Invite learners from **Invite**. They request a sign-in code on the main app. Revoke bans the Auth user (reversible Restore).

The password-changed flag is stored in Auth `app_metadata` (not user-editable `user_metadata`). Admin APIs verify the session email on every request and use the service role only on the server.

## Data model (user data only)

There is **no** `bible_verses` table and no full-Bible cache. Only the user’s selected chunk text is stored, as study material.

| Table | Purpose |
| --- | --- |
| `user_profiles` | `id` (auth user), `timezone` |
| `book_selections` | Active book + chosen `translation_id` / `translation_name` |
| `chunks` | User-defined passage ranges and their text |
| `memorization_trackers` | Phase, `week_started`, `phase_start_date`, graduation flags, weekly weekday, quarterly Sunday |
| `daily_completions` | Written when a practice session finishes |

## License notes

Scripture text comes from API.Bible and remains subject to each translation’s copyright. The FUMS tracker in `index.html` reports licensed views as required.
