const express = require("express");
const Subscriber = require("../models/Subscriber");
const { newsletterLimiter } = require("../middleware/rateLimit");
const { cleanString, isEmail } = require("../middleware/validation");

const router = express.Router();

router.post("/", newsletterLimiter, async (req, res, next) => {
  const email = cleanString(req.body?.email, 254).toLowerCase();
  if (!isEmail(email)) return res.status(400).json({ error: "A valid email address is required." });
  try {
    await Subscriber.create({ email });
  } catch (error) {
    if (error?.code === 11000) return res.status(409).json({ error: "You're already subscribed." });
    return next(error);
  }
  return res.status(201).json({ message: "Thank you for subscribing." });
});

module.exports = router;
