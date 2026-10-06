# Max Samasta — Backend Architecture Reference

Employee Attendance Backend Application built with **Express.js**, **Sequelize v6**, and **PostgreSQL**.  
Session-based authentication, Cloudinary media storage, Haversine geofencing, and automated scheduling.

---

## Table of Contents

- [System Overview](#system-overview)
- [Directory Structure](#directory-structure)
- [Technology Stack](#technology-stack)
- [Server Bootstrap Sequence](#server-bootstrap-sequence)
- [Database Schema & Relations](#database-schema--relations)
- [Authentication & Authorization](#authentication--authorization)
- [API Reference](#api-reference)
- [Middleware Pipeline](#middleware-pipeline)
- [Utilities & Background Jobs](#utilities--background-jobs)
- [Controller Reference](#controller-reference)
- [Geofencing System](#geofencing-system)
- [Code Conventions](#code-conventions)
- [Environment Variables](#environment-variables)

---

## System Overview

```
┌─────────────┐     HTTP      ┌──────────────────────────────────────────────────────┐
│   Frontend  │◄────────────► │  Express.js Server (port: APP_PORT)                  │
│  (Vue.js)   │   JSON/CORS   │                                                      │
└─────────────┘               │  ┌─────────┐  ┌────────────┐  ┌──────────────────┐   │
                              │  │  Routes │─►│ Middleware │─►│   Controllers    │   │
                              │  └─────────┘  └────────────┘  └─────────┬────────┘   │
                              │                                         │            │
                              │                    ┌────────────────────┼──────┐     │
                              │                    ▼                    ▼      ▼     │
                              │              ┌──────────┐     ┌──────────┐ ┌──────┐  │
                              │              │ Sequelize│     │Cloudinary│ │ SMTP │  │
                              │              │   ORM    │     │  (Media) │ │(Mail)│  │
                              │              └─────┬────┘     └──────────┘ └──────┘  │
                              │                    │                                 │
                              └────────────────────┼─────────────────────────────────┘
                                                   ▼
                                            ┌──────────────┐
                                            │  PostgreSQL  │
                                            │  (4 tables + │
                                            │   Sessions)  │
                                            └──────────────┘
```

**Core design decisions:**

- **ES Modules only** — `"type": "module"` in `package.json`; every file uses `import`/`export`.
- **MVC architecture** — Models define schema, Controllers hold business logic, Routes map HTTP endpoints.
- **Stateful sessions** — Authentication uses `express-session` backed by PostgreSQL via `connect-session-sequelize`. JWT is intentionally not used, so sessions can be revoked server-side.
- **Cloudinary-exclusive media** — All file uploads (attendance photos, profile images) go directly to Cloudinary through `multer-storage-cloudinary`. No local disk storage.
- **Haversine geofencing** — Attendance tap-in/tap-out validates employee GPS coordinates against a fixed office location within a 9-meter radius.

---

## Directory Structure

```
Backend/
├── config/
│   └── Database.js              # Sequelize instance & PostgreSQL connection
├── models/
│   ├── UserModel.js             # users table — employees & admins
│   ├── AbsenModel.js            # AbsenModel table — attendance records (tap in/out)
│   ├── HKAEModel.js             # HKAE table — per-employee work day metrics
│   ├── AdminModel.js            # Admin table — monthly work calendar & holidays
│   └── index.js                 # Sequelize CLI boilerplate (CommonJS, unused at runtime)
├── controllers/
│   ├── Auth.js                  # Login, Me (session verify), Logout
│   ├── Users.js                 # User CRUD, suspend/activate, profile upload, password reset
│   ├── absen.js                 # Tap In, Tap Out, attendance history, update, delete
│   └── Admin.js                 # Work calendar CRUD, date range filter, dashboard statistics
├── routes/
│   ├── AuthRoute.js             # /login, /me, /logout, /forgot-password, /reset-password
│   ├── UserRoute.js             # /users, /createusersv2, /uploadProfileImage, /suspenduser, etc.
│   ├── AbsenRoute.js            # /absen/in, /absen/out, /absens, /absen/:id
│   └── AdminRoute.js            # /admin, /allrecord, /allrecordbydate, /statistics
├── middleware/
│   ├── AuthUser.js              # verifyUser (session guard) & adminOnly (role guard)
│   ├── sessionChecker.js        # Lightweight session existence check
│   └── uploadMiddleware.js      # Multer + Cloudinary storage configuration
├── utils/
│   ├── cloudinary.js            # Cloudinary SDK v2 initialization
│   ├── cronJob.js               # node-cron schedulers for HKA/HKE updates
│   ├── location.js              # Haversine distance calculation
│   └── populateHKAE.js          # Initialize HKAE records for all users on startup
├── index.js                     # Express server entry point & bootstrap
├── package.json                 # Dependencies, scripts, ES module config
├── .env                         # Environment variables (gitignored)
└── .gitignore                   # node_modules/, .env, logs/
```

---

## Technology Stack

| Category | Technology | Purpose |
|:---------|:-----------|:--------|
| Runtime | Node.js (ES Modules) | Server-side JavaScript |
| Framework | Express.js `4.19.2` | HTTP routing & middleware |
| ORM | Sequelize `6.37.3` | PostgreSQL object-relational mapping |
| Database | PostgreSQL (`pg 8.12.0`) | Persistent data storage |
| Auth | `express-session` + `connect-session-sequelize` | Stateful session management |
| Hashing | Argon2 (`argon2 0.40.3`) | Password encryption |
| Media | Cloudinary `1.41.3` + `multer-storage-cloudinary` | Cloud image storage |
| Upload | Multer `1.4.5-lts.1` | Multipart form-data parsing |
| Email | Nodemailer `6.9.13` | SMTP password reset emails |
| Scheduler | `node-cron 3.0.3` | Background monthly/daily jobs |
| Date/Time | Moment.js + `moment-timezone` | Asia/Jakarta timezone handling |
| Geofencing | Custom Haversine implementation | GPS distance validation |

---

## Server Bootstrap Sequence

The application starts from `index.js` in this exact order:

```
1.  Import all modules (Express, CORS, Session, Models, Routes, Cron)
2.  dotenv.config() — load .env
3.  Create Express app instance
4.  Configure URL-encoded body parser
5.  Initialize session store (connect-session-sequelize)
        └─ expiration: 120 minutes
        └─ checkExpirationInterval: 120 minutes
6.  IIFE: Database connection & model sync
        ├─ db.authenticate()
        ├─ Users.sync({ alter: true })
        ├─ AbsenModel.sync({ alter: true })
        ├─ HKAE.sync({ alter: true })
        ├─ Admin.sync({ alter: true })
        └─ populateHKAE()  ← ensures every user has an HKAE row
7.  Mount session middleware
        └─ cookie maxAge: 120 minutes, secure: "auto"
8.  Mount CORS middleware
        └─ origin: CLIENT_URL || "http://localhost:5173"
        └─ credentials: true
9.  Mount JSON body parser
10. Mount route modules (UserRoute, AbsenRoute, AuthRoute, AdminRoute)
11. store.sync()  ← creates the Session table in PostgreSQL
12. Mount direct route: POST /tapin
13. app.listen(APP_PORT)
```

> **Note:** Cron jobs are registered at import time (step 1) via `./utils/cronJob.js`, which calls `cron.schedule()` at module scope.

---

## Database Schema & Relations

### Entity Relationship

```
┌──────────────────┐       1:N        ┌──────────────────┐
│      users       │─────────────────►│    AbsenModel    │
│                  │                  │                  │
│  id (PK, INT)    │                  │  id (PK, INT)    │
│  uuid (UUIDV4)   │                  │  uuid (UUIDV4)   │
│  name            │     1:1          │  tapin (DATE)    │
│  email (UNIQUE)  │────────────┐     │  tapout (DATE)   │
│  password        │            │     │  photo (STRING)  │
│  username (UNIQUE)│           │     │ userId (FK→users)│
│  gender          │            │     │  latitudeTapIn   │
│  division        │            │     │  longitudeTapIn  │
│  position        │            │     │  latitudeTapOut  │
│  role            │            │     │  longitudeTapOut │
│  urlprofile      │            │     └──────────────────┘
│  Status          │            │
│  resetPasswordToken│          │     ┌──────────────────┐
│  resetPasswordExpires│        └────►│      HKAE        │
└──────────────────┘                  │                  │
                                      │  id (PK, INT)    │
                                      │  userId (FK, UNIQUE)│
┌──────────────────┐                  │  HKA (INT)       │
│      Admin       │                  │  HKE (INT)       │
│                  │                  └──────────────────┘
│  No (PK, INT)    │
│  Tahun (INT)     │                  ┌──────────────────┐
│  Bulan (STRING)  │                  │    Session       │
│  HKA (INT)       │                  │ (auto-created by │
│  HKE (INT)       │                  │ connect-session- │
│  Jumlah (INT)    │                  │ sequelize)       │
│  TanggalHariLibur│                  └──────────────────┘
│  (INT ARRAY)     │
└──────────────────┘
```

### Model Details

#### `users` — UserModel.js

| Column | Type | Constraints |
|:-------|:-----|:------------|
| `id` | INTEGER | PK, Auto Increment |
| `uuid` | STRING | UUIDV4 default, NOT NULL |
| `name` | STRING | NOT NULL, length 3–100 |
| `email` | STRING | NOT NULL, UNIQUE, email format |
| `password` | STRING | NOT NULL (Argon2 hash) |
| `username` | STRING | NOT NULL, UNIQUE |
| `gender` | STRING | NOT NULL, enum: `male`, `female` |
| `division` | STRING | NOT NULL |
| `position` | STRING | NOT NULL |
| `role` | STRING | NOT NULL, enum: `admin`, `employee` |
| `urlprofile` | STRING | Nullable (Cloudinary URL) |
| `Status` | STRING | Default: `'aktif'` |
| `resetPasswordToken` | STRING | Nullable |
| `resetPasswordExpires` | DATE | Nullable |

**Relations:** `hasMany(AbsenModel)`, `hasOne(HKAEModel)` — both via `foreignKey: 'userId'`

#### `AbsenModel` — AbsenModel.js

| Column | Type | Constraints |
|:-------|:-----|:------------|
| `id` | INTEGER | PK, Auto Increment |
| `uuid` | UUID | UUIDV4 default, NOT NULL |
| `tapin` | DATE | NOT NULL |
| `tapout` | DATE | Nullable |
| `photo` | STRING | NOT NULL (Cloudinary URL) |
| `userId` | INTEGER | FK → users.id, NOT NULL |
| `latitudeTapIn` | NUMERIC | Nullable |
| `longitudeTapIn` | NUMERIC | Nullable |
| `latitudeTapOut` | NUMERIC | Nullable |
| `longitudeTapOut` | NUMERIC | Nullable |

**Relations:** `belongsTo(Users)` via `foreignKey: 'userId'`

#### `HKAE` — HKAEModel.js

| Column | Type | Constraints |
|:-------|:-----|:------------|
| `id` | INTEGER | PK, Auto Increment |
| `userId` | INTEGER | FK → users.id, UNIQUE |
| `HKA` | INTEGER | Nullable (Hari Kerja Aktual) |
| `HKE` | INTEGER | Nullable (Hari Kerja Efektif) |

**Relations:** `belongsTo(Users)` via `foreignKey: 'userId'`

#### `Admin` — AdminModel.js

| Column | Type | Constraints |
|:-------|:-----|:------------|
| `No` | INTEGER | PK, Auto Increment |
| `Tahun` | INTEGER | NOT NULL |
| `Bulan` | STRING | NOT NULL (Indonesian month name) |
| `HKA` | INTEGER | NOT NULL |
| `HKE` | INTEGER | Nullable |
| `Jumlah` | INTEGER | Nullable (count of holidays) |
| `TanggalHariLibur` | ARRAY(INTEGER) | Nullable |

**Relations:** None (standalone master data table)

> All models use `{ freezeTableName: true }` to prevent Sequelize pluralization.

---

## Authentication & Authorization

### Session Flow

```
Login                              Authenticated Request
─────                              ─────────────────────

POST /login                        GET /users
  │                                  │
  ├─ Find user by email              ├─ verifyUser middleware
  ├─ argon2.verify(password)         │    ├─ Read req.session.userId (uuid)
  ├─ Set req.session.userId = uuid   │    ├─ Lookup user by uuid
  └─ Return user profile             │    ├─ Bind req.userId = user.id
                                     │    ├─ Bind req.role = user.role
                                     │    └─ next()
                                     │
                                     ├─ adminOnly middleware (if needed)
                                     │    ├─ Verify user.role === 'admin'
                                     │    └─ next() or 404/401
                                     │
                                     └─ Controller handler
```

### Guards

| Middleware | Location | Behavior |
|:-----------|:---------|:---------|
| `verifyUser` | `middleware/AuthUser.js` | Validates `req.session.userId`, binds `req.userId` (integer) and `req.role` to request. Returns 401 if no session. |
| `adminOnly` | `middleware/AuthUser.js` | Extends `verifyUser`. Returns 401 if `user.role !== 'admin'`. |
| `sessionChecker` | `middleware/sessionChecker.js` | Lightweight check — only verifies `req.session.userId` exists. Used on `GET /me`. |

### Password Security

- **Hashing:** Argon2 (memory-hard, resistant to GPU/ASIC brute-force attacks).
- **Reset flow:** 20-byte `crypto.randomBytes` hex token, stored in `resetPasswordToken` with 1-minute TTL in `resetPasswordExpires`. Expired tokens are cleaned on each forgot-password request.

---

## API Reference

### Authentication

| Method | Path | Auth | Handler | Description |
|:-------|:-----|:-----|:--------|:------------|
| `POST` | `/login` | — | `Login` | Authenticate with email & password, create session |
| `GET` | `/me` | Session | `Me` | Return current authenticated user profile |
| `DELETE` | `/logout` | — | `Logout` | Destroy session and clear cookie |

### Password Recovery

| Method | Path | Auth | Handler | Description |
|:-------|:-----|:-----|:--------|:------------|
| `POST` | `/forgot-password` | — | `forgotPassword` | Generate reset token and send email |
| `POST` | `/reset-password/` | — | `resetPassword` | Verify token and set new password |
| `POST` | `/auth/forgot-password` | — | `forgotPassword` | Alias route (via UserRoute) |
| `POST` | `/auth/reset-password/` | — | `resetPassword` | Alias route (via UserRoute) |

### User Management

| Method | Path | Auth | Handler | Description |
|:-------|:-----|:-----|:--------|:------------|
| `GET` | `/users` | Admin | `getUser` | List all users |
| `GET` | `/users/:id` | Admin | `getUserById` | Get single user by ID |
| `POST` | `/users` | — | `createUser` | Legacy create (no photo, unused) |
| `POST` | `/createusersv2` | — | `createUserv2` → `uploadProfileImagev2` | Register with profile photo upload |
| `POST` | `/uploadProfileImage` | Session | `uploadProfileImage` | Update own profile photo |
| `PATCH` | `/users/:id` | Session | `updateUser` | Update user data (with optional photo) |
| `PATCH` | `/suspenduser/:id` | Admin | `SuspendUser` | Change status: aktif → suspend |
| `PATCH` | `/aktifuser/:id` | Admin | `AktifUser` | Change status: suspend → aktif |
| `DELETE` | `/users/:id` | Admin | `deleteUserById` | Delete user permanently |

### Attendance (Absensi)

| Method | Path | Auth | Handler | Description |
|:-------|:-----|:-----|:--------|:------------|
| `POST` | `/absen/in` | Session + Photo | `createAbsenTapin` | Tap in with GPS + photo (geofenced) |
| `POST` | `/absen/out` | Session | `createAbsenTapout` | Tap out with GPS (geofenced) |
| `POST` | `/tapin` | Photo | `createAbsenTapin` | Direct tap-in route (no session guard) |
| `GET` | `/absen` | Admin | `getaAbsen` | Get all attendance records |
| `GET` | `/absens` | Admin | `getAbsens` | Filtered query (fullname, id, date range) |
| `GET` | `/absen/:id` | Admin | `getAbsenbyId` | Get single attendance record |
| `GET` | `/absenbyname/:name` | Admin | `getAbsenByName` | Get attendance by employee name |
| `PATCH` | `/absen/:id` | Session | `updateAbsen` | Update attendance record (admin or owner) |
| `DELETE` | `/absen/:id` | Session | `deleteAbsen` | Delete attendance record (admin only) |

### Admin Master Data & Dashboard

| Method | Path | Auth | Handler | Description |
|:-------|:-----|:-----|:--------|:------------|
| `POST` | `/admin` | Admin | `createAdminRecord` | Create monthly work calendar entry |
| `GET` | `/allrecord` | Admin | `getAllAdminRecords` | Get all calendar records |
| `GET` | `/allrecordbydate` | Admin | `getAdminRecordsByDateRange` | Filter by date range (query: `from`, `to`) |
| `GET` | `/statistics` | Session | `getStatistics` | Dashboard: total users, active, suspended, HKA/HKE |

---

## Middleware Pipeline

### Request Flow Through Middleware

```
Incoming Request
      │
      ▼
 express.urlencoded()         ← Parse URL-encoded bodies
      │
      ▼
 express-session              ← Attach/create session from cookie
      │
      ▼
 cors()                       ← Validate origin, set CORS headers
      │
      ▼
 express.json()               ← Parse JSON request bodies
      │
      ▼
 Router Match                 ← Match route pattern
      │
      ├─► verifyUser          ← Session auth guard (binds req.userId, req.role)
      │       │
      │       ├─► adminOnly   ← Role check (admin only routes)
      │       │
      │       └─► handleFileUpload / uploadSingle  ← Multer + Cloudinary
      │
      └─► Controller          ← Business logic execution
```

### File Upload Configuration

| Export | Storage Target | Cloudinary Folder | Public ID Format | File Limit |
|:-------|:---------------|:------------------|:-----------------|:-----------|
| `uploadSingle` | Cloudinary | `absen_photos` | `{userId}_{uuid}_{YYYY-MM-DD_HH-mm-ss}` | 5MB, jpeg/jpg/png |
| `uploadSingleProfileimg` | Cloudinary | `profile_photos` | `{uuid}_{YYYY-MM-DD_HH-mm-ss}` | 5MB, jpeg/jpg/png |

`handleFileUpload` in `controllers/Users.js` wraps `uploadSingleProfileimg` with error handling for `LIMIT_FILE_SIZE` and general Multer errors.

---

## Utilities & Background Jobs

### Haversine Geofencing (`utils/location.js`)

Calculates the great-circle distance between two GPS points on Earth's surface.

```
calculateDistance(lat1, lon1, lat2, lon2) → distance in meters
```

- Earth radius constant: **6,371,000 meters**
- Office coordinates: `lat -6.577023245193599`, `lon 106.81070304025452`
- Tolerance radius: **9 meters**

### Cloudinary SDK (`utils/cloudinary.js`)

Initializes `cloudinary.v2` with credentials from environment variables. Exported as default for use by `multer-storage-cloudinary` and direct `uploader.destroy()` calls.

### Cron Scheduler (`utils/cronJob.js`)

| Function | Schedule | Purpose |
|:---------|:---------|:--------|
| `updateHKAE` | `0 0 1 * *` (1st of each month, midnight) | Sync HKA values from Admin table to all HKAE rows. Reset HKA/HKE where they are equal. |
| `updateAdminHKE` | `0 0 * * *` (daily at midnight) | Increment HKE by 1 for each Admin record where HKE < HKA. |

### HKAE Initializer (`utils/populateHKAE.js`)

Runs on server startup. For every user in `users` without an `HKAE` row, creates one with `HKA` from the current month's Admin record (or `null` if no record exists) and `HKE: null`.

Month matching uses Indonesian names: `Januari, Februari, Maret, April, Mei, Juni, Juli, Agustus, September, Oktober, November, Desember`.

---

## Controller Reference

### Auth.js

| Function | Description |
|:---------|:------------|
| `Login` | Find user by email → `argon2.verify` password → set `req.session.userId = user.uuid` → return profile |
| `Me` | Read `req.session.userId` → find user by uuid → return selected attributes |
| `Logout` | Validate session → `req.session.destroy()` → clear `connect.sid` cookie |

### Users.js

| Function | Description |
|:---------|:------------|
| `getUser` | Return all users (selected attributes, no password) |
| `getUserById` | Return single user by `req.params.id` |
| `createUser` | Legacy registration without photo upload |
| `createUserv2` | Step 1: Validate input, hash password, attach `req.user`, call `next()` |
| `uploadProfileImagev2` | Step 2: Read `req.file.path`, create user with `req.user` data, call `populateHKAE()` |
| `updateUser` | Update user fields by ID. Re-hash password if provided. Update photo if uploaded. |
| `uploadProfileImage` | Replace profile photo for authenticated user. Destroy old Cloudinary image. |
| `handleFileUpload` | Wrapper middleware for `uploadSingleProfileimg` with Multer error handling |
| `deleteUserById` | Delete user by ID |
| `forgotPassword` | Generate 20-byte hex reset token (1-min TTL) → send HTML email via Nodemailer |
| `resetPassword` | Verify token validity and expiration → hash new password → clear token fields |
| `SuspendUser` | Set `Status: 'suspend'` (only if currently `'aktif'`) |
| `AktifUser` | Set `Status: 'aktif'` (only if currently `'suspend'`) |

### absen.js

| Function | Description |
|:---------|:------------|
| `getaAbsen` | Return all attendance records with associated user (excluding password) |
| `getAbsenbyId` | Return single attendance record by ID |
| `getAbsenByName` | Lookup user by name → return their attendance records |
| `getAbsens` | Flexible query: filter by `fullname`, `id`, date range (`from`/`to`) |
| `createAbsenTapin` | Validate geofence (9m) → enforce one tap-in per day → increment HKE if >24h gap → create record with photo |
| `createAbsenTapout` | Validate geofence (9m) → find today's open record → set tapout timestamp and coordinates |
| `updateAbsen` | Update record fields by ID. Allowed for admin or record owner. |
| `deleteAbsen` | Delete record by ID. Admin only (returns 403 otherwise). |

### Admin.js

| Function | Description |
|:---------|:------------|
| `createAdminRecord` | Validate HKA ≤ remaining days in month → check for duplicate → create Admin record → trigger `updateHKAE()` |
| `getAllAdminRecords` | Return all Admin records ordered by Tahun DESC, Bulan DESC |
| `getAdminRecordsByDateRange` | Parse `from`/`to` query params (format: `YYYY-MM`) → filter by year range in DB → filter by month index in memory |
| `getStatistics` | Return dashboard object: Total Entry, Active, Suspended, latest HKA/HKE/Holidays |

---

## Geofencing System

The attendance system enforces physical presence at the office through GPS coordinate validation:

```
Office Location (Hardcoded)
├── Latitude:   -6.577023245193599
├── Longitude:  106.81070304025452
└── Radius:     9 meters

Validation Flow (Tap In / Tap Out):
1. Employee submits latitude & longitude from device GPS
2. calculateDistance() computes Haversine distance to office
3. If distance > 9 meters → reject with "You are not in the office area"
4. If distance ≤ 9 meters → proceed with attendance record
```

Additional tap-in constraints:
- **One tap-in per calendar day** — enforced via `Op.between` query on `startOfDay` to `endOfDay`.
- **HKE auto-increment** — if previous tap-in was ≥ 24 hours ago, the employee's `HKE` in `HKAE` is incremented.
- **Timezone** — all timestamps use `Asia/Jakarta` via `moment-timezone`.

---

## Code Conventions

### Module System
- Pure **ES6 Modules** throughout (`import`/`export`).
- `"type": "module"` in `package.json`.
- `models/index.js` (Sequelize CLI boilerplate, CommonJS) exists in the repo but is **not imported or used** at runtime.

### Controller Pattern
Every controller function follows this structure:
```javascript
export const functionName = async (req, res) => {
    try {
        // Business logic
        res.status(200).json(data);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};
```

### Response Conventions
| Scenario | Status | Body Shape |
|:---------|:-------|:-----------|
| Success (read/update) | `200` | `{ ...data }` or `{ msg: "..." }` |
| Success (create) | `201` | `{ msg: "...", ...data }` |
| Validation / bad input | `400` | `{ msg: "..." }` or `{ message: "..." }` |
| No session / unauthorized | `401` | `{ msg: "..." }` |
| Forbidden (role) | `403` | `{ message: "..." }` |
| Not found | `404` | `{ msg: "..." }` or `{ message: "..." }` |
| Server error | `500` | `{ message: "...", error: error.message }` |

> **Note:** The codebase uses both `msg` and `message` as response keys depending on the controller. This is an existing convention preserved for consistency.

### Sequelize Conventions
- All models use `{ freezeTableName: true }`.
- Internal primary key: `id` (INTEGER, auto increment).
- Public identifier: `uuid` (UUIDV4).
- Relations are defined at the bottom of model files using explicit `foreignKey` options.

### Naming Conventions
- **Files:** PascalCase for models and routes (`UserModel.js`, `AuthRoute.js`), camelCase for controllers and utilities (`absen.js`, `cronJob.js`).
- **Functions:** camelCase exports (`getUser`, `createAbsenTapin`), PascalCase for some Auth/User functions (`Login`, `Me`, `Logout`, `SuspendUser`, `AktifUser`).
- **Database columns:** camelCase (`userId`, `tapin`, `tapout`), PascalCase for Admin table (`Tahun`, `Bulan`, `HKA`, `HKE`, `Status`).

---

## Environment Variables

### Server

| Variable | Required | Description | Example |
|:---------|:---------|:------------|:--------|
| `APP_PORT` | Yes | Express server listen port | `3000` |
| `SESS_SECRET` | Yes | Session encryption secret | `my-super-secret-key` |
| `CLIENT_URL` | No | Frontend origin for CORS & reset links (default: `http://localhost:5173`) | `http://localhost:5173` |

### Database (PostgreSQL)

| Variable | Required | Description | Example |
|:---------|:---------|:------------|:--------|
| `DB_NAME` | Yes | Database name | `max_attendance_db` |
| `DB_USER` | Yes | Database username | `postgres` |
| `DB_PASSWORD` | Yes | Database password | `yourpassword` |
| `DB_HOST` | Yes | Database host | `localhost` |
| `DB_PORT` | Yes | Database port | `5432` |
| `DB_DIALECT` | Yes | Sequelize dialect | `postgres` |

### Cloudinary

| Variable | Required | Description |
|:---------|:---------|:------------|
| `CLOUDINARY_CLOUD_NAME` | Yes | Cloudinary cloud name |
| `CLOUDINARY_API_KEY`    | Yes | Cloudinary API key    |
| `CLOUDINARY_API_SECRET` | Yes | Cloudinary API secret |

### Email (SMTP / Nodemailer)

| Variable | Required | Description | Example |
|:---------|:---------|:------------|:--------|
| `EMAIL_HOST` | Yes | SMTP server host | `smtp.gmail.com` |
| `EMAIL_PORT` | Yes | SMTP port | `465` |
| `EMAIL_USER` | Yes | Sender email address | `noreply@maxsamasta.com` |
| `EMAIL_PASS` | Yes | SMTP application password | `app-specific-password` |

### Unused / Legacy

| Variable | Description |
|:---------|:------------|
| `JWT_SECRET` | Legacy — removed from `.env.example`; not referenced anywhere. Safe to delete from local `.env`. |
| `NODE_ENV` | Referenced only in unused `models/index.js` (Sequelize CLI boilerplate). |
