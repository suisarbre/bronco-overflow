# CPP CS Q&A

An anonymous question board for Cal Poly Pomona CS tutoring. Students scan a QR code, ask a question,
and answer each other — no account, no login.

The whole thing runs on free tiers. **Keeping it free and simple is the point**, so the scope below is
deliberately small. See [Contributing](#contributing) before adding anything.

## What it does

- **Home**: an ask box on top, then a feed you can sort by **Hot / Newest / Unanswered**, filter by tag, or search.
- **Questions**: title, optional details, one tag (class, coding, career, campus, chatting), one optional
  photo, optional nickname.
- **Text**: links become clickable, ```` ``` ```` fences render as code blocks, `` `x` `` as inline code.
  Everything else is plain text.
- **Answers**: upvotes, and the asker can mark one answer as the solution.
- **Owning a post**: you can edit or delete your own posts from the browser you wrote them in (edited posts
  are labeled). Posting also shows a one-time recovery code (`XXXX-XXXX-XXXX`); entering it at `/recover`
  unlocks that post on another browser or device. Only a hash of the code is stored.
- **Reporting**: when enough different browsers report a post (3 by default), it is hidden for a tutor to
  review — hidden, not deleted.
- **Tutor tools** at `/admin`: an emergency read-only switch, temporary setting changes that expire on
  their own, editable defaults, the word filter, and a review queue with approve / hide / delete and bulk
  delete by browser or network.
- **Tutor password**: the server picks a new one every 7 days (configurable) and posts it to the Discord
  channel; only its hash is stored. `ADMIN_PASSWORD` stays valid as a break-glass key. Rotation is skipped
  entirely when no Discord webhook is set, so nobody gets locked out.
- **Discord alerts** for reports, held posts, auto-hides, and (optionally) every new post.
- **Photos**: resized in the browser to max 1600px WebP before upload, so most are a few hundred KB.
  The server caps them at 2 MB and checks the file's real type, not what the browser claims.
- **`/qr`**: a printable poster with a QR code pointing at the site.

Not in scope on purpose: accounts and logins, video uploads, comment threads, notifications,
private messaging, rich-text editing, analytics dashboards.

## Moderation and limits

New posts run through a profanity filter, a link cap, and a duplicate check.

Campus Wi-Fi puts many people behind one IP address, so per-IP limits are loose on purpose, and per-browser
limits do the real work.

| What | Limit |
| --- | --- |
| Posting | 6 per browser / 10 min, 40 per IP / 10 min (deleted posts still count) |
| Photos | 100 per IP / hour, **150 MB site-wide per day** (protects the free 1 GB store) |
| Votes | 50 per IP per post / hour |
| Edits | 20 per browser / 10 min |
| Wrong recovery codes | 20 per IP / 15 min |
| Failed admin logins | 5 per IP / 15 min, 30 site-wide / 15 min |
| Reports | 30 per IP / 10 min |

Duplicate rule: the exact same text within an hour is rejected — always from the same browser, but from the
same IP only when the text is 60+ characters, so two students posting "Thank you!" don't collide.

Posts with more than 3 links are held for review.

The filter uses the English word list from [obscenity](https://github.com/jo3-l/obscenity) and catches
variants like `f.u.c.k` and `sh1t`. Tutors can add words (e.g. `chegg`), un-block built-in words, and test a
sentence right on the admin page.

### Settings

Every setting has a **default** and an optional **temporary change** that reverts on its own (1, 2, 6, 12,
24 hours, or until cleared). "Clear all temporary changes" reverts everything; **STOP EVERYTHING** makes the
site read-only until a tutor turns it back on.

| Setting | Default |
| --- | --- |
| Read-only mode | Off |
| Hold new posts for approval | Off |
| Pause photo uploads | Off |
| Profanity filter (off / censor / hold for review / reject) | Censor |
| Reports before auto-hide | 3 |
| Discord alert for every new post | On |
| New tutor password every … days | 7 (0 turns rotation off) |

## Stack

| Role | Service |
| --- | --- |
| Code | GitHub |
| Hosting | Vercel Hobby (Next.js 16) |
| Database | Neon Postgres (added from Vercel's Storage tab) |
| Photos | Vercel Blob |

Tables are created on first request, so there is no migration step ([src/lib/db.ts](src/lib/db.ts)).

Free-tier notes: Vercel's Hobby plan is for non-commercial projects, which this is. A free Neon database
sleeps when nobody is using it and wakes on the next request (your data stays). Watch the **Usage** tab in
the Vercel dashboard.

## Deploying

1. **Push to GitHub** (a private repo is fine):
   ```bash
   git remote add origin https://github.com/<you>/cpp-cs-qa.git
   git push -u origin main
   ```
2. **Create the Vercel project**: [vercel.com/new](https://vercel.com/new) → import the repo → Deploy.
   The first deploy shows an error page because there's no database yet. That's expected.
3. **Add the database**: project → **Storage** → **Create Database** → **Neon** (Free) → connect it to the
   project. This sets `DATABASE_URL`.
4. **Add photo storage**: same **Storage** tab → **Blob** → connect it. This sets `BLOB_READ_WRITE_TOKEN`.
5. **Set `ADMIN_PASSWORD`** under **Settings → Environment Variables**. Make it long. This is the
   break-glass key; day-to-day, tutors use the rotating password from Discord.
6. **Discord alerts and the rotating password.** Create a webhook in your Discord channel settings
   (Integrations → Webhooks) and set `DISCORD_WEBHOOK_URL`. Use a channel only tutors can read — the tutor
   password is posted there.
7. **Redeploy** from the Deployments tab. After that, every push to `main` deploys automatically.
8. Open `https://<project>.vercel.app/qr` and print the poster.

> If your database variable has another name (for example only `POSTGRES_URL` exists), copy the same value
> into `DATABASE_URL`. Prefer Neon's **pooled** connection string (the host contains `-pooler`).

## Running it locally

```bash
npm install
npx vercel link
npx vercel env pull .env.local
npm run dev
```

Without `BLOB_READ_WRITE_TOKEN`, photos are saved to `public/uploads/` in development.

## Where things live

- Classes and tags: [src/lib/tags.ts](src/lib/tags.ts) — don't rename an `id` that posts already use
- Rate limits and length limits: [src/app/actions.ts](src/app/actions.ts)
- Settings and their defaults: [src/lib/settings.ts](src/lib/settings.ts)
- Filter, duplicate, and link rules: [src/lib/moderation.ts](src/lib/moderation.ts)
- Colors: [src/app/globals.css](src/app/globals.css)

## Contributing

The goal is a board that a tutor can forget about for a month and that never sends anyone a bill. Small,
boring changes are the good ones.

**Please do**

- Fix bugs, improve wording, improve accessibility, and tune the numbers in the tables above.
- Keep it free: no new paid services, and no feature that grows storage or database usage without a limit.
- Keep dependencies to a minimum. Everything we add has to be maintained by the next tutor.
- Keep posting anonymous and low-friction. Scanning a QR code and typing should stay the whole flow.
- Run `npm run lint`, `npx tsc --noEmit`, and `npm run build` before opening a pull request.
- Say in the PR what it costs: new tables, new stored data, extra requests per page view.

**Please don't**

- Add accounts, logins, or anything that collects personal data. We store no emails, names, or raw IPs
  (IP addresses are only ever stored as salted hashes, for rate limits).
- Add a feature "because other Q&A sites have it". If tutors haven't asked for it twice, it can wait.
- Add a background job, cron, queue, or analytics service.
- Reformat files you aren't otherwise changing.

**Good first issues**: fix the class list in `tags.ts`, improve the empty states, make the admin page nicer
on a phone.

If you're not sure whether something fits, open an issue first and ask — that's cheaper than building it.
