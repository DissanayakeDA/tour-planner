# Trip Kitty

A no-login money manager for your group's annual trip. You set the trip's total budget and team size. The team
then records fund payments, expenses and bill photos, and the app works out who owes whom. Every change is
saved with the name and phone number of the person who made it.

Built with **Next.js 16** (React 19) on **Vercel**, **Neon Postgres** for the data and **Cloudinary** for the bill
photos and PDFs. It is designed for phones first: bottom tab bar, card-style lists and forms that slide up from
the bottom. On a computer it shows the full sidebar and data tables.

## How the group uses it

1. **Set up the trip:** the trip name, the **total budget** (for example Rs 100,000) and the **team member count**.
   The app shows the budget per person (Rs 100,000 ÷ 6 = Rs 16,666.67).
2. **Add the team members** (name and phone). Then split the total budget into categories: Transport,
   Accommodation, Food & Drinks, and so on.
3. **Upload bills:** tap the **+** button, choose the **bill category**, enter the description and amount, attach the
   bill photo or PDF (or take a photo), and enter **your name and phone number**. The bill shows who uploaded it.
4. **Record fund payments:** the money each person hands over to the common trip fund (the "kitty").
5. **Settle up** at the end: the Settlement page lists who pays whom, with a "Copy for WhatsApp" button.

**Name and phone on every change.** There is no login. Every add, edit, delete and upload asks for your name
and phone number, and the server rejects changes without them. The device remembers the last values and fills
them in, and they can be changed each time. The **Activity Log** shows every change with who made it, their
phone number, when, and exactly what changed (for example "amount Rs 30,000.00 → Rs 32,000.00"). The log is kept
even after a trip is deleted, and it can be exported as CSV.

### Pages

| Page | What it shows |
|---|---|
| All Trips | Every trip with budget used, plus recent activity across all trips |
| Dashboard | Total budget, spent, remaining, cash in fund and team progress. Alerts for over-budget categories, bills not yet attached, members not yet added and a negative fund. Also budget by category, recent expenses, settlement and recent activity |
| Expenses | Search and filter (category, payer, missing receipt) with sortable columns and totals. CSV export |
| Bills & Receipts | Bill photo and PDF gallery with uploader name and phone, filtered by category, plus expenses missing a bill |
| Team Members | Members against the team count, budget per person and each member's balance |
| Fund Collections | Payments into the fund, and each member's progress against their per-person budget |
| Budget | Category budgets: allocated, unallocated, spent, remaining and status |
| Settlement | Equal-share balances, the fewest payments to settle up, and a summary to copy to WhatsApp |
| Activity Log | Every change, searchable by name or phone, filterable, CSV export |
| Reports | Printable report (Print / Save as PDF), expenses CSV and activity CSV |
| Trip Settings | Edit the trip setup. Delete the trip (you must type its name to confirm) |

## Run it on your computer

1. Install **Node.js 22**.
2. `npm install`
3. Create `.env` from `.env.example` and fill in the Neon connection string (`DATABASE_URL`, or `DATA_BASE_URL`)
   and your Cloudinary keys. Next.js loads `.env` automatically.
4. `npm run dev`, then open http://localhost:3000. Phones on the same Wi-Fi can open `http://<your-PC-IP>:3000`.

The database tables are created automatically on the first request. `npm run db:init` creates them in advance.
For a production build on your computer, run `npm run build`, then `npm start`.

## Deploy to Vercel

1. Push the project to GitHub. `.env` is git-ignored, so never commit your keys.
2. In Vercel, choose **Add New → Project** and import the repository. Vercel detects **Next.js**, so leave the
   build settings at their defaults.
3. Under **Settings → Environment Variables**, add the variables below for Production (and Preview if you use it).
4. Deploy and open the `*.vercel.app` URL. After changing environment variables later, **redeploy** them.

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` (or `DATA_BASE_URL` / `POSTGRES_URL`) | yes | Neon **pooled** connection string (the host contains `-pooler`). Neon's Vercel integration can set this for you |
| `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` | for bills | Or one `CLOUDINARY_URL=cloudinary://KEY:SECRET@CLOUD`. Without these, the app works but bill uploads are turned off |
| `APP_PIN` | recommended | A shared group PIN, asked for once per device. Keeps strangers out of the public URL |
| `CLOUDINARY_FOLDER` | no | Default `trip-manager`. Bills go to `<folder>/trip-<id>/` |

`vercel.json` runs the server functions in the `cle1` region (Cleveland, the same AWS region as the Neon database,
us-east-2). If your Neon project is somewhere else, change this to the nearest Vercel region.

## How the money works

- **Budget** is the total budget entered at setup. **Remaining** = budget − spent. **Budget per person** = budget ÷ team
  member count.
- Each **expense** is paid either *from the trip fund* or *personally* by one member.
- **Cash in fund** = fund payments − expenses paid from the fund.
- **Equal share** = total spent ÷ members added. Add the whole team for an accurate split; the app warns until all
  members are added.
- **Balance** = paid into the fund + paid personally − equal share. Positive means the member gets money back.
  Negative means they still owe.
- **Settle up** lists the fewest payments that even everything out. The fund counts as one of the people, so any cash
  left in it goes back to the members who are owed.

## Bills (Cloudinary)

- Photos (JPG, PNG, WebP, HEIC and GIF) and PDFs up to 10 MB each, at most 10 per expense. Large phone photos are
  shrunk in the browser before upload.
- Files go **straight from the browser to Cloudinary** using a signature from the server, so they never pass through
  Vercel and its 4.5 MB request limit does not apply. The server then checks Cloudinary's response signature and
  that the file is in the trip's own folder before it saves the bill. Bills record who uploaded them.
- PDFs get a page-1 thumbnail. On a free Cloudinary account, opening the full PDF needs **Console → Settings →
  Security → "Allow delivery of PDF and ZIP files"** turned on.
- Deleting a bill, an expense or a trip also deletes the files from Cloudinary. If a file is uploaded but the expense
  is never saved, the upload is deleted again.

## Security: there is no login

Anyone with the URL (and the PIN, if one is set) can view and change everything. Members' phone numbers are visible
to the group. Set `APP_PIN`, share the link only with the group, and use the Activity Log to see who changed what.
Bill files are stored at public Cloudinary URLs that are hard to guess.

## Project layout

```
app/                          Next.js App Router
  api/[...path]/route.js      all /api/* requests → lib/api.js
  page.jsx                    All Trips
  trips/new/page.jsx          trip setup
  trips/[id]/layout.jsx       trip shell (loads the trip once)
  trips/[id]/<module>/page.jsx  dashboard, expenses, bills, members, fund, budget, settlement, activity, reports, settings
  globals.css                 light ERP theme, mobile first
components/                   AppShell, DataTable, drawer forms, ActorFields (name + phone), ReceiptPicker, ...
lib/api.js                    REST routes, validation, activity logging, CSV exports
lib/db.js                     pg Pool (attachDatabasePool on Vercel), schema, transactions
lib/cloudinary.js             upload signing, verification, display URLs, deletion
lib/summary.js                money maths
lib/client/                   browser API client, direct upload, formatting
scripts/db-init.js            npm run db:init
```

The REST API is plain JSON. Every change returns the whole updated trip. Every POST, PUT and DELETE must include
`"actor": {"name": "...", "phone": "..."}` in its JSON body.
