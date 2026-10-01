<div align="center">

# Max Samasta — Core Backend API

[![Node.js](https://img.shields.io/badge/Node.js-18.x-green.svg?logo=node.js)](https://nodejs.org/)
[![Express.js](https://img.shields.io/badge/Express.js-4.19-lightgrey.svg?logo=express)](https://expressjs.com/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-14%2B-blue.svg?logo=postgresql)](https://www.postgresql.org/)
[![Sequelize](https://img.shields.io/badge/Sequelize-6.37-blue.svg?logo=sequelize)](https://sequelize.org/)
[![License: ISC](https://img.shields.io/badge/License-ISC-yellow.svg)](https://opensource.org/licenses/ISC)

**A high-integrity, geofenced employee attendance and workforce analytics system designed for secure operational tracking and automated metric accumulation.**

</div>

---

## 🏗 System Overview & Key Features

The Max Samasta Backend is a monolithic RESTful API built on **Node.js/Express** and backed by **PostgreSQL**. It is engineered to enforce strict physical presence validation for employees while providing administrative capabilities to manage workforce performance metrics (HKA/HKE).

**Key Capabilities:**
- **Geospatial Validation:** Implements the Haversine formula at the application layer to enforce a strict 9-meter radius attendance boundary, preventing GPS spoofing or off-site tap-ins.
- **Fail-Closed RBAC (Role-Based Access Control):** Enforces rigid `admin` and `employee` boundaries using middleware guards. Actions default to `403 Forbidden` without explicit administrative session validation.
- **Stateful Session Management:** Abandons stateless JWTs in favor of PostgreSQL-backed sessions (`connect-session-sequelize`) to enable instant, forceful zero-trust token revocation during employee termination or suspension.
- **Automated Workforce Analytics:** Utilizes `node-cron` for autonomous, distributed background processing to compute Effective Working Days (HKE) against Actual Working Days (HKA) at midnight.
- **Stateless Media Streaming:** Offloads heavy multipart/form-data image processing (profile & attendance verification photos) directly to Cloudinary, ensuring application server nodes remain ephemeral and stateless.

---

## 📐 System Architecture & Data Flow

The application follows a traditional **Model-View-Controller (MVC)** pattern with a thick-controller approach, heavily utilizing middleware for cross-cutting concerns (authentication, upload handling, session parsing).

```mermaid
graph TD
    Client[Client Devices / Web UI]
    
    subgraph "Application Layer (Node.js)"
        API[Express.js Gateway / Router]
        AuthGuard[Session & RBAC Middleware]
        Geofence[Haversine Location Logic]
        Controllers[Business Logic Controllers]
        CronJob[Node-Cron Scheduler]
    end
    
    subgraph "Persistence & External Layers"
        PG[(PostgreSQL Database)]
        SessionStore[(PostgreSQL Session Store)]
        Cloudinary[Cloudinary CDN/Storage]
        SMTP[Nodemailer SMTP]
    end

    %% Flow
    Client -->|HTTP/REST| API
    API --> AuthGuard
    AuthGuard -->|Read/Write Cookie| SessionStore
    AuthGuard -->|Valid Request| Controllers
    
    Controllers -->|Validate Coordinate| Geofence
    Controllers -->|Stream Multipart| Cloudinary
    Controllers -->|Sequelize ORM| PG
    Controllers -->|Reset Password| SMTP
    
    CronJob -->|Accumulate Metrics (Midnight)| PG
```

---

## 📂 Directory Structure

Clean separation of concerns adhering to standard MVC and Domain boundaries.

```text
Backend/
├── config/             # Database initialization and Sequelize connection setup
├── controllers/        # Core business logic for Auth, Users, Absen, and Admin
├── middleware/         # Express middlewares (RBAC guards, Multer + Cloudinary proxy)
├── models/             # Sequelize ORM definitions (Schema, Constraints, Relations)
├── routes/             # API routing linking HTTP methods & endpoints to controllers
├── utils/              # Helper modules (Haversine math, Cron jobs, Cloudinary SDK)
├── index.js            # Application bootstrap, CORS config, and server entry point
└── package.json        # Dependencies and scripts (Native ES Modules enabled)
```

---

## 🛠 Tech Stack & Engineering Rationale

| Component | Technology | Architectural Rationale |
| :--- | :--- | :--- |
| **Runtime** | Node.js (ES Modules) | V8 engine's non-blocking I/O is ideal for handling concurrent attendance requests during peak morning hours. |
| **Framework** | Express.js | Minimalist framework enabling deep customization of the middleware pipeline. |
| **Database** | PostgreSQL | Enforces strict ACID compliance required for relational financial/attendance constraints. |
| **ORM** | Sequelize v6 | Abstracts complex joins and manages automated timestamping and schema synchronization. |
| **Authentication** | `express-session` (PG Store) | Mitigates token theft vectors by storing state securely in the DB, allowing instant server-side revocation over stateless JWTs. |
| **Security / Hash** | Argon2 | Utilized for password hashing due to its memory-hard computational resistance against GPU-based brute-force attacks. |
| **Media Storage** | Cloudinary / Multer | Direct cloud proxying prevents container disk bloat and avoids local I/O bottlenecks during high-volume photo uploads. |

---

## 🚀 Key Engineering Highlights & Trade-offs

### 1. Cryptographic Security vs. Statelessness
**Challenge:** Managing secure sessions where suspended or terminated employees must be locked out instantly.
**Solution:** Deliberately opted against JWT (which remains valid until expiry) in favor of database-backed stateful sessions. 
**Trade-off:** Introduces a DB read on every authenticated request, trading marginal latency (ms) for absolute security control.

### 2. Geospatial Integrity at the App Layer
**Challenge:** Validating employee GPS coordinates strictly within a 9-meter radius of the office location.
**Solution:** Instead of introducing PostGIS extensions to the database layer, the Haversine formula is implemented purely in the Node.js application layer (`utils/location.js`).
**Trade-off:** Keeps the database layer lightweight and universally portable across managed DB services, at the cost of minimal CPU cycles during the `POST /absen/in` request.

### 3. Idempotent Scheduled Workers
**Challenge:** Accurately calculating HKA/HKE (Work Days) automatically without manual HR intervention.
**Solution:** Embedded `node-cron` workers trigger nightly schema updates. The logic is idempotent, ensuring that server restarts or duplicate cron executions do not double-count attendance metrics.

---

## 🔒 Security & Production Readiness

- **CORS Configuration:** Strictly limited to the frontend client URL (`process.env.CLIENT_URL` falling back to `http://localhost:5173`). Cross-origin requests from unauthorized domains are aggressively blocked.
- **Cookie Security:** Session cookies are configured with `secure: "auto"` to mandate HTTPS in production while allowing seamless local HTTP testing.
- **Argon2 Implementation:** Passwords are never stored in plaintext. Argon2 is prioritized over bcrypt for superior resistance against side-channel and ASIC attacks.

---

## 🗄 Database Schema

The relational schema is tightly coupled using explicit foreign keys and `UUID` identifiers to obfuscate sequential integer IDs from client payloads.

- **`users`**: Core identity table (Argon2 hash, Roles, Suspended status).
- **`AbsenModel`**: Attendance ledger (`tapin`, `tapout`, Cloudinary `photo`, lat/lon coordinates). *N:1 relation with users.*
- **`HKAE`**: Aggregated workforce metrics per employee. *1:1 relation with users.*
- **`Admin`**: Standalone configuration table for monthly office calendars and holidays.
- **`Sessions`**: Ephemeral table auto-managed by `connect-session-sequelize`.

---

## 📖 API Documentation & Quick Test

A comprehensive Postman Collection is provided in the repository: `API Documentation Max Samasta.postman_collection.json`.

### Example 1: Tap-In (Geofenced & Multipart)
Endpoint requires `multipart/form-data` with coordinates and a photo.

```bash
curl -X POST http://localhost:3000/absen/in \
  -H "Cookie: connect.sid=s%3AYOUR_SECURE_SESSION_ID" \
  -F "latitude=-6.577023245193599" \
  -F "longitude=106.81070304025452" \
  -F "photo=@/path/to/selfie.jpg"
```
**Expected Response (201 Created):**
```json
{
  "msg": "Tap in successful",
  "absen": {
    "uuid": "550e8400-e29b-41d4-a716-446655440000",
    "tapin": "2024-07-22T08:00:00.000Z",
    "photo": "https://res.cloudinary.com/.../absen_photos/..."
  }
}
```

---

## 💻 Getting Started & Local Development

### 1. Prerequisites
- Node.js `v18.x` or higher
- PostgreSQL `v14` or higher
- Cloudinary Account & SMTP Credentials (for Mailer)

### 2. Environment Configuration
Clone the repository and copy the environment template:
```bash
git clone https://github.com/your-org/MaxSamasta-Backend.git
cd MaxSamasta-Backend
cp .env.example .env
```
Populate `.env` with actual provisioning secrets:
```env
APP_PORT=3000
SESS_SECRET=cryptographically_secure_random_string
CLIENT_URL=http://localhost:5173

# Database
DB_NAME=max_attendance_db
DB_USER=postgres
DB_PASSWORD=your_secure_password
DB_HOST=127.0.0.1
DB_DIALECT=postgres
DB_PORT=5432

# External Services
CLOUDINARY_CLOUD_NAME=xxx
CLOUDINARY_API_KEY=xxx
CLOUDINARY_API_SECRET=xxx
```

### 3. Execution
The application uses native ES Modules (`"type": "module"`). It will automatically synchronize database tables (`{ alter: true }`) on bootstrap.
```bash
# Install dependencies
npm install

# Start development server
npm start
```
*Note: Ensure PostgreSQL daemon is running before executing.*

### 4. Production Deployment Recommendation
For production environments, it is recommended to run the application via a process manager like **PM2** sitting behind an **Nginx** reverse proxy to handle SSL termination.

```bash
pm2 start index.js --name "maxsamasta-api" --env production
```

---

## 🧪 Testing & Code Quality

- **API Integration Testing:** Use the provided Postman collection. Import `API Documentation Max Samasta.postman_collection.json` into Postman or Newman to execute end-to-end integration flows.
- **Format / Linting:** Ensure code is formatted to standard ES Module conventions before pushing PRs.
- **Security Audits:** Run `npm audit` pre-commit to identify vulnerabilities in dependencies.

---
*Architected and maintained by Hasan Abdurrahman.*
