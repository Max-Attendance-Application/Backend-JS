import express from "express";
import cors from "cors";
import session from "express-session";
import dotenv from "dotenv";
import db from "./config/Database.js";
import Users from "./models/UserModel.js";
import AbsenModel from "./models/AbsenModel.js";
import HKAE from "./models/HKAEModel.js";
import Admin from "./models/AdminModel.js";
import "./utils/cronJob.js";
import { Sequelize } from "sequelize";
import SequelizeStore from "connect-session-sequelize";
import UserRoute from "./routes/UserRoute.js";
import AbsenRoute from "./routes/AbsenRoute.js";
import AuthRoute from "./routes/AuthRoute.js";
import AdminRoute from "./routes/AdminRoute.js";
import { uploadSingle } from "./middleware/uploadMiddleware.js";
import { createAbsenTapin } from "./controllers/absen.js";
import { populateHKAE } from "./utils/populateHKAE.js";
//Model

dotenv.config();

const app = express();
app.use(express.urlencoded({ extended: true }));

const sessionStore = SequelizeStore(session.Store);
const store = new sessionStore({
  db: db,
  expiration: 120 * 60 * 1000,
  checkExpirationInterval: 120 * 60 * 1000,
});

// IIFE untuk memeriksa koneksi database dan sinkronisasi model
// Function to check if a table exists
const tableExists = async (tableName) => {
  const result = await db.query(
    `SELECT EXISTS (
            SELECT 1
            FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_name = '${tableName}'
        );`,
    { type: Sequelize.QueryTypes.SELECT }
  );
  return result[0].exists;
};

// Immediately Invoked Function Expression (IIFE) to handle database operations
(async function () {
  try {
    await db.authenticate(); // Check connection to the database
    console.log("Database connected...");

    // Check if tables exist
    const usersTableExists = await tableExists("users");
    const absenModelTableExists = await tableExists("AbsenModel");
    const hkaeTableExists = await tableExists("HKAE");
    const adminTableExists = await tableExists("Admin");

    // Sync models
    await Users.sync({ alter: true });
    await AbsenModel.sync({ alter: true });
    await HKAE.sync({ alter: true });
    await Admin.sync({ alter: true });
    console.log("Database synced...");
    populateHKAE(); // Populate HKAE table on server start
  } catch (error) {
    console.error("Unable to connect to the database or sync tables:", error);
  }
})();

app.use(
  session({
    secret: process.env.SESS_SECRET,
    resave: false,
    saveUninitialized: true,
    store: store,
    cookie: {
      maxAge: 120 * 60 * 1000,
      secure: "auto",
    },
  })
);

//middleware
app.use(
  cors({
    credentials: true,
    //untuk frontend akses
    origin: process.env.CLIENT_URL || "http://localhost:5173",
  })
);

app.use(express.json());
app.use(UserRoute);
app.use(AbsenRoute);
app.use(AuthRoute);
app.use(AdminRoute);

store.sync();


// Gunakan multer sebagai middleware untuk rute yang memerlukan unggahan file
app.post("/tapin", uploadSingle, (req, res) => {
  createAbsenTapin(req, res);
});

app.listen(process.env.APP_PORT, () => {
  console.log("Server up and running...");
});
