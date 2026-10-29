const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { loginLimiter } = require("../middleware/rateLimit");
const { cleanString } = require("../middleware/validation");

const router = express.Router();
let passwordHashPromise;

async function configuredPasswordHash(password) {
  if (/^\$2[aby]\$/.test(password)) return password;
  if (!passwordHashPromise) passwordHashPromise = bcrypt.hash(password, 12);
  return passwordHashPromise;
}

router.post("/login", loginLimiter, async (req, res, next) => {
  try {
    const email = cleanString(req.body?.email, 254).toLowerCase();
    const password = typeof req.body?.password === "string" ? req.body.password : "";
    const configuredEmail = cleanString(process.env.ADMIN_EMAIL, 254).toLowerCase();
    const configuredPassword = process.env.ADMIN_PASSWORD;
    if (!configuredEmail || !configuredPassword || !process.env.JWT_SECRET) {
      return res.status(503).json({ error: "Admin authentication is not configured." });
    }

    const expectedHash = await configuredPasswordHash(configuredPassword);
    const passwordMatches = await bcrypt.compare(password, expectedHash);
    if (email !== configuredEmail || !passwordMatches) return res.status(401).json({ error: "Invalid email or password." });
    const token = jwt.sign({ sub: configuredEmail, role: "admin" }, process.env.JWT_SECRET, { expiresIn: "8h" });
    return res.json({ token, expiresIn: 28800 });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
