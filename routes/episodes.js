const express = require("express");
const Episode = require("../models/Episode");

const router = express.Router();

router.get("/", async (req, res, next) => {
  try {
    const episodes = await Episode.find({ status: "published" })
      .sort({ publishedAt: -1, createdAt: -1 })
      .lean();
    return res.json(episodes.map((episode) => ({
      ...episode,
      id: String(episode._id),
      videoUrl: episode.videoUrl,
      isFeatured: episode.isFeatured === true
    })));
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
