const express = require("express");
const Episode = require("../models/Episode");
const Category = require("../models/Category");
const Setting = require("../models/Setting");
const ContactMessage = require("../models/ContactMessage");
const Subscriber = require("../models/Subscriber");
const requireAdmin = require("../middleware/auth");
const { cleanString, isEmail, isHttpUrl } = require("../middleware/validation");
const { extractVideoUrl } = require("../public/js/media");

const router = express.Router();
router.use(requireAdmin);

function asyncRoute(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

function sendError(res, error) {
  if (error?.code === 11000) return res.status(409).json({ error: "A record with that value already exists." });
  if (error?.name === "ValidationError") return res.status(400).json({ error: "The submitted data is invalid." });
  if (error?.name === "CastError") return res.status(400).json({ error: "The requested record is invalid." });
  console.error("Admin request failed:", error?.message || "Unknown error");
  return res.status(500).json({ error: "The request could not be completed." });
}

function tryRoute(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch((error) => sendError(res, error));
}

function episodePayload(input, creating = false) {
  const data = {};
  const fields = ["title", "category", "videoUrl", "duration", "description", "thumbnailUrl", "show", "status", "isFeatured"];
  for (const field of fields) {
    if (field === "isFeatured" && creating && input.isFeatured === undefined) {
      data.isFeatured = false;
      continue;
    }
    if (input[field] === undefined && !creating) continue;
    if (field === "isFeatured") {
      if (typeof input.isFeatured !== "boolean") return { error: "Feature this episode must be true or false." };
      data.isFeatured = input.isFeatured;
    } else if (field === "videoUrl") {
      const raw = cleanString(input.videoUrl, 10000);
      const extracted = extractVideoUrl(raw);
      if (!extracted || !isHttpUrl(extracted)) return { error: "Video URL must be a valid HTTP(S) URL or iframe embed." };
      data.videoUrl = extracted;
    } else if (field === "status") {
      const status = input.status === undefined ? "draft" : input.status;
      if (!["published", "draft"].includes(status)) return { error: "Status must be published or draft." };
      data.status = status;
      if (status === "published") data.publishedAt = new Date();
      else data.publishedAt = null;
    } else if (field === "duration") {
      const value = cleanString(input.duration || "", 20);
      if (value && !/^(?:\d{1,2}:)?[0-5]?\d:[0-5]\d$/.test(value)) return { error: "Duration must be mm:ss or h:mm:ss." };
      data.duration = value;
    } else if (field === "thumbnailUrl") {
      const value = cleanString(input.thumbnailUrl || "", 2000);
      if (value && !isHttpUrl(value) && !/^\/[A-Za-z0-9._/-]+$/.test(value)) return { error: "Thumbnail URL must be a valid HTTP(S) URL." };
      data.thumbnailUrl = value;
    } else if (field === "number") {
      continue;
    } else {
      const limits = { title: 200, category: 80, description: 3000, show: 100 };
      data[field] = cleanString(input[field] || "", limits[field]);
    }
  }
  const number = input.number === undefined && !creating ? undefined : Number(input.number);
  if (number !== undefined) {
    if (!Number.isInteger(number) || number < 1) return { error: "Episode number must be a positive whole number." };
    data.number = number;
  }
  if ((creating || input.title !== undefined) && !data.title) return { error: "Episode title is required." };
  if ((creating || input.category !== undefined) && !data.category) return { error: "Episode category is required." };
  if ((creating || input.videoUrl !== undefined) && !data.videoUrl) return { error: "Video URL is required." };
  if ((creating || input.number !== undefined) && !data.number) return { error: "Episode number is required." };
  if (creating && data.isFeatured && data.status === "draft") return { error: "Only published episodes can be featured." };
  if (data.status === "published" && !data.publishedAt) data.publishedAt = new Date();
  return { data };
}

router.get("/episodes", tryRoute(async (req, res) => {
  res.json(await Episode.find().sort({ publishedAt: -1, createdAt: -1 }).lean());
}));

router.get("/episodes/limit-info", tryRoute(async (req, res) => {
  const max = req.app.locals.MAX_EPISODES;
  const count = await Episode.countDocuments();
  const oldest = count >= max
    ? await Episode.findOne({ isFeatured: { $ne: true } }).sort({ createdAt: 1, _id: 1 }).select("_id title").lean()
    : null;
  return res.json({
    count,
    max,
    willDelete: oldest ? { id: oldest._id, title: oldest.title } : null
  });
}));

router.post("/episodes", tryRoute(async (req, res) => {
  const parsed = episodePayload(req.body || {}, true);
  if (parsed.error) return res.status(400).json({ error: parsed.error });
  if (!await Category.exists({ name: parsed.data.category })) return res.status(400).json({ error: "Choose an existing category." });
  if (parsed.data.isFeatured && parsed.data.status !== "published") {
    return res.status(400).json({ error: "Only published episodes can be featured." });
  }
  const max = req.app.locals.MAX_EPISODES;
  const shouldFeature = parsed.data.isFeatured;
  if (await Episode.exists({ number: parsed.data.number })) {
    return res.status(409).json({ error: "A record with that value already exists." });
  }
  while (await Episode.countDocuments() >= max) {
    const oldest = await Episode.findOneAndDelete({ isFeatured: { $ne: true } })
      .sort({ createdAt: 1, _id: 1 });
    if (!oldest) return res.status(409).json({ error: "No non-featured episode can be removed to make room." });
  }
  const episode = await Episode.create({ ...parsed.data, isFeatured: false });
  if (shouldFeature) {
    await Episode.updateMany({ _id: { $ne: episode._id } }, { $set: { isFeatured: false } });
    episode.isFeatured = true;
    await episode.save();
  }
  return res.status(201).json({ episode });
}));

router.put("/episodes/:id", tryRoute(async (req, res) => {
  const parsed = episodePayload(req.body || {});
  if (parsed.error) return res.status(400).json({ error: parsed.error });
  if (parsed.data.category && !await Category.exists({ name: parsed.data.category })) {
    return res.status(400).json({ error: "Choose an existing category." });
  }
  const existing = await Episode.findById(req.params.id);
  if (!existing) return res.status(404).json({ error: "Episode not found." });
  if (existing.isFeatured && (parsed.data.status === "draft" || parsed.data.isFeatured === false)) {
    return res.status(409).json({ error: "Pick another featured episode first." });
  }
  if (parsed.data.isFeatured && (parsed.data.status || existing.status) !== "published") {
    return res.status(400).json({ error: "Only published episodes can be featured." });
  }
  const shouldFeature = parsed.data.isFeatured === true;
  if (shouldFeature) {
    await Episode.updateMany({ _id: { $ne: existing._id } }, { $set: { isFeatured: false } });
  }
  Object.assign(existing, parsed.data);
  const episode = await existing.save();
  if (!episode) return res.status(404).json({ error: "Episode not found." });
  return res.json({ episode });
}));

router.patch("/episodes/:id/feature", tryRoute(async (req, res) => {
  const episode = await Episode.findById(req.params.id);
  if (!episode) return res.status(404).json({ error: "Episode not found." });
  if (episode.status !== "published") {
    return res.status(400).json({ error: "Only published episodes can be featured." });
  }
  await Episode.updateMany({ _id: { $ne: req.params.id } }, { $set: { isFeatured: false } });
  episode.isFeatured = true;
  await episode.save();
  return res.json({ episode });
}));

router.patch("/episodes/:id/status", tryRoute(async (req, res) => {
  const status = req.body?.status;
  if (!["published", "draft"].includes(status)) return res.status(400).json({ error: "Status must be published or draft." });
  const episode = await Episode.findById(req.params.id);
  if (!episode) return res.status(404).json({ error: "Episode not found." });
  if (episode.isFeatured && status === "draft") {
    return res.status(409).json({ error: "Pick another featured episode first." });
  }
  episode.status = status;
  episode.publishedAt = status === "published" ? new Date() : null;
  await episode.save();
  return res.json({ episode });
}));

router.delete("/episodes/:id", tryRoute(async (req, res) => {
  const episode = await Episode.findById(req.params.id);
  if (!episode) return res.status(404).json({ error: "Episode not found." });
  if (episode.isFeatured) return res.status(409).json({ error: "Pick another featured episode first." });
  await episode.deleteOne();
  return res.status(204).end();
}));

router.get("/categories", tryRoute(async (req, res) => {
  res.json(await Category.find().sort({ name: 1 }).lean());
}));

router.post("/categories", tryRoute(async (req, res) => {
  const name = cleanString(req.body?.name, 80);
  if (!name) return res.status(400).json({ error: "A category name is required." });
  return res.status(201).json(await Category.create({ name }));
}));

router.put("/categories/:id", tryRoute(async (req, res) => {
  const name = cleanString(req.body?.name, 80);
  if (!name) return res.status(400).json({ error: "A category name is required." });
  const category = await Category.findById(req.params.id);
  if (!category) return res.status(404).json({ error: "Category not found." });
  const oldName = category.name;
  category.name = name;
  await category.save();
  await Episode.updateMany({ category: oldName }, { $set: { category: name } });
  return res.json(category);
}));

router.delete("/categories/:id", tryRoute(async (req, res) => {
  const category = await Category.findById(req.params.id);
  if (!category) return res.status(404).json({ error: "Category not found." });
  if (await Episode.exists({ category: category.name })) {
    return res.status(409).json({ error: "This category is used by one or more episodes and cannot be deleted." });
  }
  await category.deleteOne();
  return res.status(204).end();
}));

router.get("/settings", tryRoute(async (req, res) => {
  const settings = await Setting.findOneAndUpdate(
    { singleton: "main" },
    { $setOnInsert: { singleton: "main" } },
    { upsert: true, new: true }
  );
  return res.json(settings);
}));

router.put("/settings", tryRoute(async (req, res) => {
  const fields = ["youtubeUrl", "instagramUrl", "facebookUrl", "whatsappUrl", "cloudinaryCloudName", "cloudinaryUploadPreset"];
  const data = {};
  for (const field of fields) {
    if (req.body?.[field] === undefined) continue;
    const value = cleanString(req.body[field], 500);
    if (["youtubeUrl", "instagramUrl", "facebookUrl", "whatsappUrl"].includes(field) && value && !isHttpUrl(value)) {
      return res.status(400).json({ error: `${field} must be a valid HTTP(S) URL.` });
    }
    data[field] = value;
  }
  const settings = await Setting.findOneAndUpdate(
    { singleton: "main" },
    { $set: data, $setOnInsert: { singleton: "main" } },
    { new: true, upsert: true, runValidators: true }
  );
  return res.json({ settings });
}));

router.get("/messages", tryRoute(async (req, res) => {
  res.json(await ContactMessage.find().sort({ createdAt: -1 }).lean());
}));

router.patch("/messages/:id", tryRoute(async (req, res) => {
  if (typeof req.body?.read !== "boolean") return res.status(400).json({ error: "Read must be true or false." });
  const message = await ContactMessage.findByIdAndUpdate(req.params.id, { read: req.body.read }, { new: true });
  if (!message) return res.status(404).json({ error: "Message not found." });
  return res.json(message);
}));

router.delete("/messages/:id", tryRoute(async (req, res) => {
  const message = await ContactMessage.findByIdAndDelete(req.params.id);
  if (!message) return res.status(404).json({ error: "Message not found." });
  return res.status(204).end();
}));

router.get("/subscribers", tryRoute(async (req, res) => {
  res.json(await Subscriber.find().sort({ createdAt: -1 }).lean());
}));

router.get("/subscribers/export", tryRoute(async (req, res) => {
  const subscribers = await Subscriber.find().sort({ createdAt: -1 }).lean();
  const cell = (value) => `"${String(value ?? "").replace(/"/g, '""').replace(/^[=+\-@]/, "'$&")}"`;
  const csv = ["email,createdAt", ...subscribers.map((item) => `${cell(item.email)},${cell(item.createdAt?.toISOString?.() || "")}`)].join("\r\n");
  res.type("text/csv").attachment("subscribers.csv").send(csv);
}));

router.delete("/subscribers/:id", tryRoute(async (req, res) => {
  const subscriber = await Subscriber.findByIdAndDelete(req.params.id);
  if (!subscriber) return res.status(404).json({ error: "Subscriber not found." });
  return res.status(204).end();
}));

module.exports = router;
