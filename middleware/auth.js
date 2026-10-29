const jwt = require("jsonwebtoken");

function requireAdmin(req, res, next) {
  const authorization = req.get("authorization") || "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);

  if (!match) {
    return res.status(401).json({ error: "Authentication required." });
  }

  try {
    req.admin = jwt.verify(match[1], process.env.JWT_SECRET);
    return next();
  } catch (error) {
    return res.status(401).json({ error: "Invalid or expired authentication token." });
  }
}

module.exports = requireAdmin;
