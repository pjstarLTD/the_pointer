require("dns").setServers(["8.8.8.8", "1.1.1.1"]);
require("dotenv").config();

const MAX_EPISODES = 4;
const path = require("path");
const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const mongoose = require("mongoose");
const Category = require("./models/Category");
const Episode = require("./models/Episode");
const Setting = require("./models/Setting");
const publicRoutes = require("./routes/public");
const authRoutes = require("./routes/auth");
const adminRoutes = require("./routes/admin");

const app = express();
const port = Number(process.env.PORT) || 3000;
const publicDirectory = path.join(__dirname, "public");
app.locals.MAX_EPISODES = MAX_EPISODES;
const categoriesToSeed = [
  "Politics", "Economy", "Elections", "Oil & Gas", "Civil Unrest", "Education & Health", "Business"
];
let initializationPromise;

app.disable("x-powered-by");
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://cdn.tailwindcss.com", "https://cdn.jsdelivr.net"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
      imgSrc: ["'self'", "https:", "data:", "blob:", "https://res.cloudinary.com", "https://img.youtube.com"],
      mediaSrc: ["'self'", "https:", "blob:"],
      connectSrc: ["'self'", "https://ipapi.co", "https://api.cloudinary.com", "https://vimeo.com", "https://player.vimeo.com"],
      frameSrc: ["'self'", "https:", "https://www.youtube.com"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"]
    }
  },
  crossOriginEmbedderPolicy: false
}));

let allowedOrigin = null;
if (process.env.CLIENT_ORIGIN) {
  try {
    allowedOrigin = new URL(process.env.CLIENT_ORIGIN).origin;
  } catch {
    throw new Error("CLIENT_ORIGIN must be a valid origin URL.");
  }
}

app.use(cors({
  origin(origin, callback) {
    if (!origin) return callback(null, true);
    if (!allowedOrigin) return callback(null, false);
    let requestOrigin;
    try { requestOrigin = new URL(origin).origin; }
    catch { return callback(null, false); }
    return callback(null, requestOrigin === allowedOrigin);
  },
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  optionsSuccessStatus: 204
}));
app.use(express.json({ limit: "50kb" }));
app.use(express.urlencoded({ extended: false, limit: "50kb" }));

app.use("/api", publicRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/admin", adminRoutes);
app.use(express.static(path.join(__dirname, "public")));
app.get("/", (req, res) => res.sendFile(path.join(publicDirectory, "index.html")));
app.get("/admin", (req, res) => res.sendFile(path.join(publicDirectory, "admin.html")));

app.use((req, res) => res.status(404).json({ error: "Not found." }));
app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  if (error?.type === "entity.too.large") return res.status(413).json({ error: "Request body is too large." });
  if (error instanceof SyntaxError && error.status === 400 && "body" in error) {
    return res.status(400).json({ error: "Request body must contain valid JSON." });
  }
  console.error("Request failed:", error?.message || "Unknown error");
  return res.status(500).json({ error: "An unexpected server error occurred." });
});

async function seedInitialData() {
  if (await Category.countDocuments() === 0) {
    await Category.insertMany(categoriesToSeed.map((name) => ({ name })));
  }

  if (await Episode.countDocuments() === 0) {
    const now = new Date();
    await Episode.insertMany([
      {
        number: 11,
        title: "The big conversation: building an economy that works",
        category: "Economy",
        show: "The Pointer Prime",
        duration: "26:40",
        description: "The big conversation about building an economy that works.",
        thumbnailUrl: "/images/hub-1.jpg",
        videoUrl: "https://www.youtube.com/watch?v=ysz5S6PUM-U",
        status: "published",
        publishedAt: now
      },
      {
        number: 10,
        title: "From a local idea to a business with global ambition",
        category: "Business",
        show: "The Enterprise Interview",
        duration: "32:15",
        description: "A local idea grows into a business with global ambition.",
        thumbnailUrl: "/images/hub-2.jpg",
        videoUrl: "https://www.youtube.com/watch?v=ysz5S6PUM-U",
        status: "published",
        publishedAt: new Date(now.getTime() - 1000)
      },
      {
        number: 9,
        title: "Made here: a new generation on the factory floor",
        category: "Economy",
        show: "Inside Nigeria",
        duration: "18:50",
        description: "Meet a new generation on the factory floor.",
        thumbnailUrl: "/images/hub-3.jpg",
        videoUrl: "https://www.youtube.com/watch?v=ysz5S6PUM-U",
        status: "published",
        publishedAt: new Date(now.getTime() - 2000)
      }
    ]);
  }

  await Setting.updateOne(
    { singleton: "main" },
    { $setOnInsert: { singleton: "main" } },
    { upsert: true }
  );
}

async function cleanupFeaturedEpisodes() {
  const featuredEpisodes = await Episode.find({ isFeatured: true })
    .sort({ updatedAt: -1, createdAt: -1, _id: -1 })
    .select("_id")
    .lean();
  if (featuredEpisodes.length < 2) return;
  await Episode.updateMany(
    { _id: { $in: featuredEpisodes.slice(1).map((episode) => episode._id) } },
    { $set: { isFeatured: false } }
  );
}

async function initialize() {
  const mongoUri = process.env.MONGODB_URI;
  if (!process.env.MONGODB_URI) {
    console.error("MONGODB_URI is totally missing from process.env");
  }
  if (!process.env.ADMIN_EMAIL || !process.env.ADMIN_PASSWORD || !process.env.JWT_SECRET) {
    throw new Error("ADMIN_EMAIL, ADMIN_PASSWORD, and JWT_SECRET must be configured.");
  }

  if (mongoose.connection.readyState !== 1) {
    await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 10000 });
  }
  await cleanupFeaturedEpisodes();
  await Episode.createIndexes();
  await seedInitialData();
}

function ensureInitialized() {
  if (!initializationPromise) {
    initializationPromise = initialize().catch((error) => {
      initializationPromise = null;
      throw error;
    });
  }
  return initializationPromise;
}

async function start() {
  await ensureInitialized();
  return app.listen(port, () => console.log(`The Pointer server listening on port ${port}.`));
}

async function vercelHandler(req, res) {
  try {
    await ensureInitialized();
  } catch (error) {
    console.error(`The Pointer could not initialize: ${error?.message || "database connection or initialization failed."}`);
    return res.status(500).json({ error: "The service could not be initialized." });
  }
  return app(req, res);
}

if (require.main === module) {
  start().catch((error) => {
    console.error(`The Pointer could not start: ${error?.message || "database connection or initialization failed."}`);
    process.exitCode = 1;
    mongoose.disconnect().catch(() => {});
  });
}

module.exports = vercelHandler;
module.exports.app = app;
module.exports.start = start;
module.exports.seedInitialData = seedInitialData;
module.exports.cleanupFeaturedEpisodes = cleanupFeaturedEpisodes;
