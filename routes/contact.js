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
    const savedMessage = await ContactMessage.create({ name, email, subject, message });
    console.log("Contact message saved:", savedMessage._id);
    return res.status(201).json({ ok: true });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
