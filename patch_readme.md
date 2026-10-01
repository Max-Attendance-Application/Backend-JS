## 📂 Directory Structure

```text
Backend/
├── config/             # Database initialization and Sequelize connection setup
├── controllers/        # Core business logic for Auth, Users, Absen, and Admin
├── middleware/         # Express middlewares (RBAC guards, Multer + Cloudinary routing)
├── models/             # Sequelize ORM definitions (Schema, Constraints, Relations)
├── routes/             # API routing linking endpoints to controllers
├── utils/              # Helper modules (Haversine math, Cron schedules, Cloudinary SDK)
├── index.js            # Application bootstrap, CORS config, and server entry point
└── package.json        # Dependencies and scripts (ES Modules enabled)
```
