const express = require("express");
const episodesRoutes = require("./episodes");
const categoriesRoutes = require("./categories");
const settingsRoutes = require("./settings");
const contactRoutes = require("./contact");
const newsletterRoutes = require("./newsletter");
const inquiriesRoutes = require("./inquiries");

const router = express.Router();

router.use("/episodes", episodesRoutes);
router.use("/categories", categoriesRoutes);
router.use("/settings", settingsRoutes);
router.use("/contact", contactRoutes);
router.use("/newsletter", newsletterRoutes);
router.use("/inquiries", inquiriesRoutes);

module.exports = router;
