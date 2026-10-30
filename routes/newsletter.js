const express = require("express");
const Subscriber = require("../models/Subscriber");
const { newsletterLimiter } = require("../middleware/rateLimit");
const { cleanString, isEmail } = require("../middleware/validation");

const router = express.Router();

router.post("/", newsletterLimiter, async (req, res, next) => {
  const email = cleanString(req.body?.email, 254).toLowerCase();
  if (!isEmail(email)) return res.status(400).json({ error: "A valid email address is required." });
  try {
    const subscriber = await Subscriber.create({ email });
    console.log("Subscriber saved:", subscriber._id);
  } catch (error) {
    if (error?.code === 11000) return res.status(409).json({ ok: false, message: "You're already subscribed." });
    return next(error);
  }
  return res.status(201).json({ ok: true, message: "Thank you for subscribing." });
});

module.exports = router;
