import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import cookieParser from "cookie-parser";
import multer from "multer";
import path from "path";
import fs from "fs";
import  passport  from "passport";

import db from "./database.js";


// Routes
import userRoutes from "./routes/userRoutes.js";
import productRoutes from "./routes/productRoutes.js";
import languageRoutes from "./routes/languageRoute.js";
import categoryRoutes from "./routes/categoryRoutes.js";
import settingRoutes from "./routes/settingRoutes.js";
import UploadRoutes from "./routes/uploadRoutes.js";
import discountTiersRouter from './routes/discountTiersRoutes.js';
import authRoutes from './routes/authRoutes.js';

import orderRoutes from './routes/orderRoutes.js';
// Import webhook routes
import webhookRoutes from './routes/webhookRoutes.js';

dotenv.config();

const app = express();

// ====================
// 🌍 CORS Configuration
// ====================
const allowedOrigins = [
  process.env.ADMIN_URL || "http://localhost:3000",
  process.env.CLIENT_URL || "http://localhost:3001",
  "http://localhost:3000",
  "http://localhost:3001"
];

app.use(
  cors({
    origin: function (origin, callback) {
      // Allow requests with no origin (like mobile apps or curl requests)
      if (!origin) return callback(null, true);
      
      if (allowedOrigins.indexOf(origin) !== -1) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "Cookie"],
  })
);

// ====================
// 🧩 Middleware Setup
// ====================
app.use(express.json());
app.use(cookieParser());
app.use(passport.initialize());

// Ensure Uploads folder exists
const uploadDir = path.join(process.cwd(), "Uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
  console.log(`✅ Created Upload directory: ${uploadDir}`);
}

// Middleware - IMPORTANT: Webhooks need raw body for verification
app.use((req, res, next) => {
  if (req.originalUrl === '/api/webhooks/clerk') {
    next(); // webhookRoutes will handle raw body
  } else {
    express.json()(req, res, next); // JSON for other routes
  }
});
// Serve uploaded files statically
app.use("/Uploads", express.static(uploadDir));

// ====================
// 🚏 Routes
// ====================
app.use("/api/users", userRoutes);
app.use("/api/products", productRoutes);
app.use("/api/categories", categoryRoutes);
app.use("/api/languages", languageRoutes);
app.use("/api/settings", settingRoutes);
app.use("/api/file", UploadRoutes);
app.use("/api/discount-tiers", discountTiersRouter);

app.use('/api/orders', orderRoutes);

// Webhook routes (NO CORS for webhooks - they're server-to-server)
app.use("/api/webhooks", webhookRoutes);

//fronted auth
app.use('/api/auth', authRoutes);

// ====================
// 🧪 Test DB Connection
// ====================
app.get("/test-db", async (req, res) => {
  try {
    const [rows] = await db.query("SELECT NOW() AS currentTime");
    res.json({
      message: "✅ Database connected successfully!",
      time: rows[0].currentTime,
    });
  } catch (err) {
    console.error("❌ Database connection failed:", err);
    res.status(500).json({
      error: "Database connection failed",
      details: err.message,
    });
  }
});

// Webhook test endpoint
app.get("/api/webhooks/test", (req, res) => {
  res.json({ 
    success: true, 
    message: "Webhook endpoint is accessible!",
    url: "Use POST /api/webhooks/clerk for Clerk webhooks"
  });
});
// ====================
// ⚠️ Global Error Handler
// ====================
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    console.error("📸 Multer error:", err);
    return res.status(400).json({
      error: "File upload error",
      field: err.field,
      details: err.message,
    });
  }

  console.error("💥 Server error:", err);
  res.status(500).json({
    error: "Internal server error",
    details: err.message,
  });
});

// ====================
// 🚀 Server Startup
// ====================
const PORT = process.env.PORT || 3009;

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📂 Static uploads served at /Uploads`);
});

