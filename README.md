# Mica's Board — Setup Guide

A real, deployed operations board: Next.js + Supabase (database) + Vercel (hosting), pushed through GitHub. No login — anyone with the link can view and edit, as you chose. Drag-and-drop reordering, editable cards with explicit Save, copy-card, add/delete lists, and a members list for sharing with your boss.

This guide assumes zero prior setup. Follow it top to bottom.

---

## Part 1 — Create your Supabase project (the database)

1. Go to **supabase.com** and sign up (free tier is enough).
2. Click **New project**.
   - Name: `micas-board` (or anything)
   - Database password: generate one and save it somewhere safe (you won't need it again for this setup, but keep it).
   - Region: pick whichever is closest to you (e.g. Singapore for the Philippines).
3. Wait ~2 minutes for the project to finish provisioning.
4. In the left sidebar, click **SQL Editor** → **New query**.
5. Open the file `supabase_schema.sql` (included in this project), copy ALL of it, paste it into the SQL editor, and click **Run**.
   - This creates your tables (`lists`, `cards`, `members`), sets up permissions, and seeds your actual board data (Today's Priorities, New Orders, Templates, etc.)
6. In the left sidebar, click **Project Settings** (gear icon) → **API**.
   - Copy the **Project URL** (looks like `https://xxxxx.supabase.co`)
   - Copy the **anon public** key (a long string starting with `eyJ...`)
   - You'll need both in Part 3.

That's your entire database, live.

---

## Part 2 — Push this code to GitHub

1. Go to **github.com**, sign in, click the **+** in the top right → **New repository**.
   - Name: `micas-board`
   - Keep it **Private** (recommended, since it's your operations data) or Public, your choice.
   - Don't initialize with a README (this project already has files).
2. On your computer, open a terminal in this project folder and run:
   ```bash
   git init
   git add .
   git commit -m "Initial commit - Mica's Board"
   git branch -M main
   git remote add origin https://github.com/YOUR-USERNAME/micas-board.git
   git push -u origin main
   ```
   Replace `YOUR-USERNAME` with your actual GitHub username. GitHub will prompt you to log in if needed.

Your code is now on GitHub.

---

## Part 3 — Deploy to Vercel (hosting)

1. Go to **vercel.com** and sign up using your GitHub account (this auto-connects them).
2. Click **Add New** → **Project**.
3. Find `micas-board` in the repo list and click **Import**.
4. Before clicking Deploy, expand **Environment Variables** and add these two:

   | Name | Value |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | the Project URL you copied from Supabase |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | the anon public key you copied from Supabase |

5. Click **Deploy**. Wait about a minute.
6. Once done, Vercel gives you a live URL like `https://micas-board.vercel.app` — that's your real, working board. Open it.

---

## Part 4 — Share it with your boss

Just send them the Vercel URL directly (e.g. `https://micas-board.vercel.app`). Since there's no login, they can open it on any device and start editing immediately — same as you.

If you want, click **Share** inside the app and add their name — this just adds their initials to the avatar row at the top so it visually shows who's "on" the board. It does not send them anything automatically (there's no email service connected); you still need to send them the link yourself, by message or email.

---

## Local development (optional, only if you want to test changes on your computer before pushing)

```bash
npm install
cp .env.local.example .env.local
# edit .env.local and paste in your real Supabase URL + anon key
npm run dev
```

Then open `http://localhost:3000`.

---

## How the pieces fit together

- **Supabase** is your database — every card, list, and member lives there as real rows. This is what makes edits persist across devices and survive refreshes.
- **GitHub** stores your code and lets Vercel auto-redeploy any time you push a change.
- **Vercel** runs the actual Next.js app and gives you the public URL.

## Making future changes

Edit the code, then:
```bash
git add .
git commit -m "describe your change"
git push
```
Vercel automatically redeploys within about a minute of any push to `main`.

## About the deadline email/WhatsApp automation

This app stores due dates as a real `date` column (`cards.due_date` in Supabase), which is exactly what you need to wire up later with Zapier or Make: have it poll the Supabase table (Zapier has a native Supabase/Postgres connector) and trigger an email or WhatsApp message when a `due_date` is approaching. That's a separate setup from this one — happy to walk through it whenever you're ready to build it.

## Honest limitations of this setup

- **No login** means anyone with the link can edit or delete anything — including your boss accidentally, or anyone you forward the link to. If this ever becomes a problem, Supabase Auth can be added later (email/password or magic link) without throwing away any of this code.
- **No automatic notifications** are built into this app itself — that's the separate Zapier/Make piece.
- **No real-time sync between two people viewing at once** — if you and your boss both have it open, you won't see each other's changes appear live without refreshing the page. (This is upgradeable later using Supabase's realtime subscriptions, but wasn't part of what you asked for here.)
