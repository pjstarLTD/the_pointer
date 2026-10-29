const express = require("express");
const ContactMessage = require("../models/ContactMessage");
const { contactLimiter } = require("../middleware/rateLimit");
const { cleanString, isEmail } = require("../middleware/validation");

const router = express.Router();

router.post("/", contactLimiter, async (req, res, next) => {
  try {
    const name = cleanString(req.body?.name, 120);
    const email = cleanString(req.body?.email, 254).toLowerCase();
    const subject = cleanString(req.body?.subject, 100);
    const message = cleanString(req.body?.message, 5000);
    if (!name || !isEmail(email) || !subject || !message) {
      return res.status(400).json({ error: "Name, valid email, subject, and message are required." });
    }
    await ContactMessage.create({ name, email, subject, message });
    return res.status(201).json({ message: "Your message has been received." });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
