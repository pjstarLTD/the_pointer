const express = require("express");
const Setting = require("../models/Setting");

const router = express.Router();

router.get("/", async (req, res, next) => {
  try {
    const settings = await Setting.findOne({ singleton: "main" }).lean();
    return res.json({
      youtubeUrl: settings?.youtubeUrl || "https://youtube.com/@thepointer",
      instagramUrl: settings?.instagramUrl || "",
      facebookUrl: settings?.facebookUrl || "",
      whatsappUrl: settings?.whatsappUrl || ""
    });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
