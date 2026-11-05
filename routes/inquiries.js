const express = require("express");
const Inquiry = require("../models/Inquiry");
const { inquiryLimiter } = require("../middleware/rateLimit");
const { isEmail } = require("../middleware/validation");

const router = express.Router();
const areasOfInterest = new Set([
  "Media Consultancy & Training",
  "Conference & Event Organization",
  "General Merchandise & Contracts",
  "Import & Export Services",
  "Partnership with The Pointer",
  "Other"
]);

router.post("/", inquiryLimiter, async (req, res, next) => {
  try {
    const body = req.body || {};
    if (body.website !== undefined && typeof body.website !== "string") {
      return res.status(400).json({ error: "The inquiry form is invalid." });
    }
    if (typeof body.website === "string" && body.website.trim()) {
      return res.status(201).json({ ok: true });
    }

    const requiredFields = ["fullName", "email", "areaOfInterest", "message"];
    if (requiredFields.some((field) => typeof body[field] !== "string") ||
      ["organization", "phone"].some((field) => body[field] !== undefined && typeof body[field] !== "string")) {
      return res.status(400).json({ error: "Please complete the inquiry form with valid text values." });
    }

    const inquiry = {
      fullName: body.fullName.trim(),
      email: body.email.trim().toLowerCase(),
      organization: typeof body.organization === "string" ? body.organization.trim() : "",
      phone: typeof body.phone === "string" ? body.phone.trim() : "",
      areaOfInterest: body.areaOfInterest.trim(),
      message: body.message.trim(),
      consent: body.consent === true
    };

    if (!inquiry.fullName || inquiry.fullName.length > 120) {
      return res.status(400).json({ error: "Full name is required and must be 120 characters or fewer." });
    }
    if (!isEmail(inquiry.email)) {
      return res.status(400).json({ error: "Enter a valid email address." });
    }
    if (inquiry.organization.length > 160 || inquiry.phone.length > 40) {
      return res.status(400).json({ error: "Organization or phone number is too long." });
    }
    if (inquiry.phone && !/^\+?[\d\s().-]{5,40}$/.test(inquiry.phone)) {
      return res.status(400).json({ error: "Enter a valid phone number." });
    }
    if (!areasOfInterest.has(inquiry.areaOfInterest)) {
      return res.status(400).json({ error: "Choose a valid area of interest." });
    }
    if (!inquiry.message || inquiry.message.length > 5000) {
      return res.status(400).json({ error: "Your message is required and must be 5,000 characters or fewer." });
    }
    if (!inquiry.consent) {
      return res.status(400).json({ error: "Please agree to be contacted about your inquiry." });
    }

    await Inquiry.create(inquiry);
    return res.status(201).json({ ok: true });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
