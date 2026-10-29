const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function cleanString(value, maxLength) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxLength);
}

function isEmail(value) {
  return typeof value === "string" && value.length <= 254 && EMAIL_PATTERN.test(value.trim());
}

function isHttpUrl(value) {
  if (typeof value !== "string" || value.length > 2000) return false;
  try {
    const parsed = new URL(value.trim());
    return (parsed.protocol === "http:" || parsed.protocol === "https:") && Boolean(parsed.hostname);
  } catch (error) {
    return false;
  }
}

function slugify(value) {
  return cleanString(value, 200)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function rejectInvalidUrls(payload, fields) {
  for (const field of fields) {
    if (payload[field] !== undefined && payload[field] !== "" && !isHttpUrl(payload[field])) {
      return `${field} must be a valid HTTP(S) URL.`;
    }
  }
  return null;
}

module.exports = { cleanString, isEmail, isHttpUrl, slugify, rejectInvalidUrls };
