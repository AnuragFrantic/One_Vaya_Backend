# OneVaya – Backend API

Node.js + TypeScript + Express + MongoDB API for the **OneVaya Travel Management Platform**:
the public website, the **My OneVaya** customer portal, the **admin panel** and the **AI features**
(chatbot + itinerary planner), as described in the project proposal.

> **Built to run before anything is purchased.** Every external service has a safe fallback:
>
> | Service | Without a key (now) | When you add the key |
> |---|---|---|
> | **Claude API** (AI chatbot + AI planner) | Demo mode: rule-based replies and planner | Real Claude AI, **no code change** |
> | **Email** (SMTP) | Emails printed in the terminal | Real emails sent |
> | **MongoDB** | `npm run dev:memory` = built-in temporary DB | Your MongoDB / Atlas |
>
> **To go live with Claude later:** paste the key into `.env` → `ANTHROPIC_API_KEY=sk-ant-...` → restart. That's all.

---

## 1. Quick start

```bash
cd Backend
npm install
cp .env.example .env        # (already created for you; edit values as needed)
npm run dev:memory          # no MongoDB needed: starts a temporary DB with demo data
```

The API runs on **http://localhost:5000/api** (check `GET /api/health`).

With a real MongoDB (local install or MongoDB Atlas):

```bash
# set MONGODB_URI in .env, then:
npm run seed -- --demo      # content + admin account (+ demo customer)
npm run dev                 # auto-restarts on code changes
```

### Accounts created by the seed

| Role | Email | Password |
|---|---|---|
| Admin | `admin@onevaya.com` (from `.env`) | `ChangeMe!2026` (from `.env`, **change it**) |
| Demo customer (`--demo`) | `aisha.khan@example.com` | `Demo!2026` |

### Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Development server with auto-reload (uses `MONGODB_URI`) |
| `npm run dev:memory` | Same, with a throw-away in-memory MongoDB + auto-seeded demo data |
| `npm run seed` / `npm run seed -- --demo` | Load website content + first admin (and demo customer). Safe to re-run |
| `npm run typecheck` | TypeScript check |
| `npm run build` → `npm start` | Production build (`dist/`) and run |

---

## 2. Environment variables (`.env`)

All secrets and settings live in `.env` (never commit it; `.env.example` is the template).

| Group | Variables | Notes |
|---|---|---|
| App | `NODE_ENV`, `PORT`, `CORS_ORIGINS`, `CLIENT_URL`, `ADMIN_URL`, `API_URL` | `CORS_ORIGINS` = website + admin URLs, comma separated; `ADMIN_URL` is used for links in team emails |
| Database | `MONGODB_URI`, `USE_MEMORY_DB` | Atlas: `mongodb+srv://user:pass@cluster/onevaya` |
| Auth | `JWT_SECRET`, `JWT_EXPIRES_IN`, `COOKIE_NAME`, `COOKIE_SECURE` | Use a long random `JWT_SECRET`; `COOKIE_SECURE=true` on HTTPS |
| **Claude AI** | `ANTHROPIC_API_KEY`, `AI_CHAT_MODEL`, `AI_PLANNER_MODEL`, `AI_CHAT_MAX_TURNS` | Empty key = demo mode. Models: `claude-haiku-5-5` (chat), `claude-sonnet-5-5` (planner) |
| Email | `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `EMAIL_FROM`, `TEAM_EMAIL` | Empty `SMTP_HOST` = console output |
| Storage | `UPLOAD_DIR`, `FILE_URL_SECRET`, `DOWNLOAD_LINK_TTL_MINUTES`, `MAX_UPLOAD_MB`, `MAX_IMAGE_MB` | Multer saves uploads on the server disk (see **File storage** in section 3) |
| First admin | `ADMIN_NAME`, `ADMIN_EMAIL`, `ADMIN_PASSWORD` | Used by `npm run seed` |

The server validates `.env` at start-up and prints a clear error if something is missing. In
production it refuses to start with the placeholder secrets.

On start-up it logs the active mode, e.g.:
`Mode → AI: DEMO (no ANTHROPIC_API_KEY) · Email: console · Storage: disk (uploads/)`

---

## 3. Folder structure

```
Backend/
├── .env / .env.example        All settings & secret keys
├── uploads/                   Files saved by multer: documents/ (private) and images/ (public)
└── src/
    ├── server.ts              Starts DB + HTTP server (entry point)
    ├── app.ts                 Express app: security, CORS, JSON, cookies, routes, errors
    ├── config/
    │   ├── env.ts             Reads & validates .env; `features` = which services are live
    │   ├── db.ts              MongoDB connection (or in-memory DB)
    │   └── constants.ts       Roles, statuses, areas, travel-time rules
    ├── models/                Mongoose schemas (database tables)
    │   ├── User.ts            Customers, staff, admins (role)
    │   ├── Catalog.ts         Service, Experience (with time rules), HolidayPackage, Hotel
    │   ├── Content.ts         BlogPost, Faq, LegalPage, ChatbotKnowledge, Subscriber
    │   ├── Sales.ts           Lead → Quote → Booking (+ shared itinerary schema)
    │   └── Account.ts         TravelDocument, Invoice, Payment, Thread, ChatConversation
    ├── routes/                URL → middleware → controller
    │   ├── index.ts           Mounts everything under /api
    │   ├── public.routes.ts   Website content + forms
    │   ├── auth.routes.ts     Register / login / reset password
    │   ├── ai.routes.ts       Chatbot + AI planner
    │   ├── portal.routes.ts   My OneVaya (customers only)
    │   └── admin.routes.ts    Admin panel (staff / admin)
    ├── controllers/           Request handlers (one file per area)
    │   └── admin/             Dashboard, leads, quotes, bookings, documents, finance,
    │                          messages, reports, users, catalogue CRUD
    ├── middleware/
    │   ├── auth.ts            JWT session → req.user; requireAuth / requireRole / requireStaff / requireAdmin
    │   ├── validate.ts        Zod request validation
    │   ├── error.ts           404 + one JSON error format for everything
    │   ├── rateLimit.ts       Limits for API, auth, forms and AI (protects the AI bill)
    │   ├── spam.ts            Honeypot spam protection for public forms
    │   └── upload.ts          Multer disk storage: travel documents + website images (type/size limits)
    ├── services/              Business logic & integrations
    │   ├── ai/
    │   │   ├── client.ts      ★ The only place the Claude client is created (key + models)
    │   │   ├── prompts.ts     System prompts (OneVaya-only, short answers)
    │   │   ├── chatTools.ts   Tools the chatbot may call (catalogue, own bookings, change requests)
    │   │   ├── chat.service.ts    Concierge: Claude with tools, or demo
    │   │   ├── planner.service.ts AI itinerary: Claude + server validation, or rule-based
    │   │   └── demo.ts        Demo concierge (used without a key / on API errors)
    │   ├── itinerary/         Smart validation rules (same as the website Trip Builder)
    │   ├── email.service.ts   SMTP or console + branded templates
    │   ├── storage.service.ts File keys, signed document links, public image URLs
    │   └── pdf.service.ts     Branded quote PDF
    ├── validators/index.ts    All Zod request schemas
    ├── utils/                 ApiError, helpers (references, paging, CSV), logger, responses
    ├── types/express.d.ts     Adds `req.user`
    └── seed/                  Starting content (exported from the website) + seed script
```

---

### File storage (multer)

Uploads are saved on the server's disk by **multer**. There is no cloud storage to set up.

| What | Saved in | Who can open it |
|---|---|---|
| Travel documents (tickets, vouchers, PDFs) | `uploads/documents/<year>/<random>.pdf` | Never public. The customer gets a link that expires after `DOWNLOAD_LINK_TTL_MINUTES`, and only after the server checks the booking is theirs (`GET /api/files/:token`) |
| Website images (services, experiences, packages, blog) | `uploads/images/<year>/<random>.jpg` | Public at `API_URL/uploads/images/…`, so the website can show them |

- **Limits:** documents are PDF/JPG/PNG/WEBP up to `MAX_UPLOAD_MB`; images are JPG/PNG/WEBP up to `MAX_IMAGE_MB`.
- **On the live server:** keep `uploads/` on a disk that survives redeploys, and back it up with the database. If the backend ever runs on several servers, or moves to a host without a persistent disk, move files to cloud storage (for example S3) at that point.
- `uploads/` is in `.gitignore`, so customer files are never committed.

## 4. How a request flows

```
Request
  → helmet / CORS / JSON / cookies          (app.ts)
  → rate limit                              (middleware/rateLimit.ts)
  → attachUser: reads session cookie or     (middleware/auth.ts)
    "Authorization: Bearer <token>"
  → route: role check + Zod validation      (routes/*.ts, middleware/validate.ts)
  → controller                              (controllers/*.ts)
       → models (MongoDB) / services (AI, email, storage, PDF, validation)
  → JSON  { success: true, data, meta? }
     or   { success: false, message, details? }   (middleware/error.ts)
```

**Sign-in:** `POST /api/auth/login` sets an **httpOnly cookie** (`ov_session`) for the website and
also returns a `token` for other clients (admin app, mobile) to send as `Authorization: Bearer <token>`.
Roles: `customer` (My OneVaya), `staff` (admin panel), `admin` (admin panel + users, deletes).

---

## 5. Business flow (matches the proposal)

```
 Website form ─┐
 Trip Builder ─┼─►  LEAD  ──►  QUOTE  ──────────►  BOOKING  ──►  Documents · Invoices · Payments
 AI Planner  ──┘   (admin)    (edit itinerary,     (supplier       (uploaded PDFs, manual
                               prices, margin,      name/ref/        payments, balance)
                               PDF → email)         cost/price)            │
                                                                            ▼
                                                              My OneVaya (customer portal)
```

1. **Enquiry → Lead.** Every website form (`POST /api/enquiries`) and every Trip Builder / AI plan
   (`POST /api/trip-requests`) becomes a **Lead** with a reference (`OV-L-…` / `OV-Q-…`). The
   customer gets a confirmation email and the team gets a notification. Plans are **re-validated on
   the server** and the number of timing problems is stored on the lead.
2. **Lead → Quote.** Staff open the lead, add notes and follow-ups, then `POST /admin/leads/:id/quote`.
   The plan is copied into a day-wise itinerary and each experience becomes a priced line
   (cost, price, margin). Staff can **re-validate** the itinerary and **override a rule with a
   reason** (proposal: "override a rule with a warning"). `GET …/pdf` shows the branded PDF;
   `POST …/send` emails it and marks the quote **sent**.
3. **Quote → Booking.** When the customer accepts (staff set status `accepted`),
   `POST /admin/quotes/:id/convert` creates the **Booking**. If the customer has no account yet,
   one is created automatically and they're emailed a "set your password" link.
4. **Booking work.** Staff add supplier name/reference/cost/price per item, update status,
   **upload original PDF documents** (or add "pending" placeholders), choose what the customer
   can see, create **invoices** and **record payments** (no payment gateway, by design).
5. **My OneVaya.** The customer sees upcoming/past trips, the itinerary, booking status, documents
   (downloaded through short-lived signed links), invoices, payments and messages, and can send
   **change requests**. Staff reply from the admin panel.
6. **Linking by email.** When someone registers or signs in, earlier leads and quotes with the same
   email are linked to their account automatically.

---

## 6. AI features (Claude)

| Feature | Endpoint | Model (from `.env`) | Demo mode (no key) |
|---|---|---|---|
| Concierge chatbot (website + portal) | `POST /api/ai/chat` | `AI_CHAT_MODEL` = `claude-haiku-5-5` | Keyword replies, reads the signed-in customer's real bookings/documents |
| AI itinerary suggestion | `POST /api/ai/plan` | `AI_PLANNER_MODEL` = `claude-sonnet-5-5` | Rule-based planner (same rules) |
| AI status | `GET /api/ai/status` | — | `{ mode: "demo" }` |

**Only OneVaya data, short answers.**
- No web search or web access is enabled. Claude can only use the **approved information** (admin-managed
  `ChatbotKnowledge` + published FAQs) and the **tools** in `services/ai/chatTools.ts`, which read
  OneVaya's database.
- Customer tools (`get_my_bookings`, `get_booking_details`, `get_my_documents`, `create_change_request`)
  are only given to signed-in customers, and the customer ID comes **from the session, never from
  the AI**. A guest can't see anyone else's data.
- The system prompt (`services/ai/prompts.ts`) tells the assistant to answer in 2–4 sentences, never use outside
  knowledge, and never promise prices, availability or bookings; `request_human` flags the chat for staff.
- Conversations are saved (`ChatConversation`) so staff can review answers and pick up hand-overs
  (`GET /api/admin/chats`).
- The **AI planner** must submit its plan through a `submit_itinerary` tool. The server checks it
  with the same validation rules as the Trip Builder and sends any problems back for Claude to fix,
  so the guest **always gets a valid plan** (falls back to the rule-based planner if needed).
- Planner requests opt into Anthropic's **server-side fallback** (`fallbacks: "default"`): if a
  safety check declines a request, it's retried on Anthropic's recommended fallback model.
- If the key is wrong, credit runs out or the API is down, both features **fall back to demo mode**
  (logged as errors), so the website never breaks.
- Cost controls: `aiLimiter` (60 AI requests/hour per IP), `AI_CHAT_MAX_TURNS` per conversation,
  prompt caching on the stable system prompt, low effort for chat. Also set a **monthly spend
  limit in the Anthropic console**.

**Going live:** set `ANTHROPIC_API_KEY` in `.env` and restart. The start-up log shows
`AI: LIVE (claude-haiku-5-5 / claude-sonnet-5-5)`. To change models later, edit `AI_CHAT_MODEL` /
`AI_PLANNER_MODEL` (e.g. `claude-opus-5-5` for the highest-quality planner, about 2x the cost).

---

## 7. API reference

All routes are under `/api`. 🔓 public · 👤 customer · 🛠 staff/admin · 🔑 admin only.

### Website (🔓)
| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | Status + which services are live |
| GET | `/services`, `/services/:slug` | Services |
| GET | `/experiences?category=&area=`, `/experiences/:slug` | Attractions & experiences (with slots/rules; no cost) |
| GET | `/packages?region=`, `/packages/:slug` | Holiday packages |
| GET | `/hotels` | Hotels for the Trip Builder |
| GET | `/blog`, `/blog/:slug` · `/faqs` · `/legal/:slug` | Content |
| POST | `/enquiries` | Any website form → lead (`{ kind, service?, fields: { fullName, email, … } }`) |
| POST | `/trip-requests` | Trip Builder / AI plan → lead (server re-validates) |
| POST | `/itinerary/validate` | Check a plan against the live rules |
| POST | `/newsletter` | Newsletter sign-up |

### Auth
| Method | Path | Purpose |
|---|---|---|
| POST | `/auth/register` 🔓 | Create customer account (links earlier enquiries) |
| POST | `/auth/login` 🔓 | Sign in (cookie + token) |
| POST | `/auth/logout` 🔓 | Sign out |
| GET | `/auth/me` 👤🛠 | Current user |
| POST | `/auth/forgot-password`, `/auth/reset-password` 🔓 | Password reset by email |

### AI (🔓, booking-aware when signed in)
`GET /ai/status` · `POST /ai/chat` `{ message, conversationId?, visitorId? }` · `POST /ai/plan` `{ brief, startDate, days, group?, budget?, interests? }`

### My OneVaya (👤)
| Method | Path | Purpose |
|---|---|---|
| GET/PATCH | `/portal/profile` · POST `/portal/profile/password` | Account details |
| GET | `/portal/trips` | Upcoming, past trips + quotes |
| GET | `/portal/trips/:id` | Itinerary, status, documents, invoices, payments, messages |
| GET | `/portal/documents` · `/portal/documents/:id/download` | Documents; short-lived download link |
| GET | `/portal/invoices` | Invoices, payments, outstanding balance |
| GET/POST | `/portal/threads` · POST `/portal/threads/:id/reply` | Messages & change requests |

### Admin panel (🛠)
| Area | Endpoints |
|---|---|
| Dashboard | `GET /admin/dashboard` (enquiries, leads, customers, quotes, bookings, upcoming trips, pending docs, payments, outstanding, sales/cost/profit) |
| Leads | `GET /admin/leads?status=&source=&q=` · `GET/PATCH /admin/leads/:id` · `POST /admin/leads/:id/notes` · `POST /admin/leads/:id/quote` |
| Quotes | `GET/POST /admin/quotes` · `GET/PATCH /admin/quotes/:id` · `POST …/validate` · `POST …/override` · `GET …/pdf` · `POST …/send` · `POST …/convert` |
| Bookings | `GET /admin/bookings` · `GET/PATCH /admin/bookings/:id` |
| Images | `POST /admin/uploads/image` (multipart `file`: JPG/PNG/WEBP) → `{ url }`, public at `/uploads/images/…` |
| Documents | `POST /admin/bookings/:id/documents` (multipart `file`, `name`, `type`, `visibleToCustomer`) · `POST …/documents/pending` · `PATCH/DELETE /admin/documents/:docId` · `GET …/link` · `GET /admin/documents/pending` |
| Finance | `GET/POST /admin/invoices` · `PATCH /admin/invoices/:id` · `GET/POST /admin/payments` · 🔑 deletes |
| Messages | `GET /admin/threads?status=&kind=` · `GET /admin/threads/:id` · `POST …/reply` · `PATCH …/status` · `GET /admin/chats?handoff=true` · `GET /admin/chats/:id` |
| Reports | `GET /admin/reports/sales?from=&to=` · add `&format=csv` for Excel/CSV |
| Users | `GET /admin/users?role=&q=` · `GET /admin/users/:id` · 🔑 `POST /admin/users` · 🔑 `PATCH /admin/users/:id` |
| Catalogue & content | `GET/POST /admin/{services,experiences,packages,hotels,blog,faqs,legal,chatbot-knowledge}` · `GET/PATCH /…/:id` · 🔑 `DELETE /…/:id` |

Lists accept `?page=1&limit=20&q=search&sort=-createdAt` and return `meta: { page, limit, total }`.

---

## 8. Connecting the frontend & admin panel

- **Website (`Frontend/`):** set `NEXT_PUBLIC_API_URL=http://localhost:5000/api`, then replace the static
  functions in `Frontend/lib/api.ts` (`getServices`, `getExperiences`, …) and `Frontend/lib/forms.ts`
  (`submitEnquiry` → `POST /enquiries`, `submitTripRequest` → `POST /trip-requests`,
  `sendPortalMessage` → `POST /portal/threads…`) with fetch calls. Send requests with
  `credentials: "include"` so the session cookie works. The chatbot calls `POST /ai/chat`, the AI
  Planner calls `POST /ai/plan`.
- **Admin panel (`adminPanel/`):** uses the `/api/admin/*` routes, signed in as staff/admin
  (cookie or Bearer token). Add its URL to `CORS_ORIGINS`.
- The data shapes follow the website's `Frontend/lib/types.ts`.

---

## 9. Security checklist

- Passwords hashed with bcrypt; JWT sessions in httpOnly cookies; role checks on every private route.
- Customers are always scoped to their own records (`customer: req.user.id`); supplier costs and
  internal fields are never returned to customers.
- Zod validation on every write; Mongoose rejects unknown fields; consistent JSON errors (no stack traces in production).
- `helmet` security headers, CORS allow-list, rate limits (auth, forms, AI), honeypot on public forms.
- Documents are private: they are never served directly; download links are signed and expire (`DOWNLOAD_LINK_TTL_MINUTES`).
- Uploads get random file names and an extension taken from the checked file type (never the user's file name); SVG images are refused.
- Before production: real `JWT_SECRET` + `FILE_URL_SECRET`, `COOKIE_SECURE=true`, HTTPS, change the
  seeded admin password, MongoDB with authentication and daily backups (proposal).

---

## 10. Going live checklist

1. **MongoDB Atlas** (or server MongoDB) → `MONGODB_URI`, then `npm run seed`.
2. **Claude API** → `ANTHROPIC_API_KEY` (set a monthly spend limit in the Anthropic console).
3. **SMTP** (e.g. Google Workspace, Zoho, SendGrid, Amazon SES) → `SMTP_*`, `EMAIL_FROM`, `TEAM_EMAIL`.
4. **File storage** → keep the `uploads/` folder on a persistent disk and include it in server backups (see **File storage** in section 3).
5. Production values: `NODE_ENV=production`, `COOKIE_SECURE=true`, `CORS_ORIGINS`, `CLIENT_URL`, `ADMIN_URL`, `API_URL`, secrets.
6. `npm run build && npm start` behind Nginx/PM2 (or any Node host) with HTTPS.

No code changes are needed for any of these steps, only `.env` values.
