const mongoose = require("mongoose");

const settingSchema = new mongoose.Schema({
  singleton: { type: String, default: "main", unique: true },
  youtubeUrl: { type: String, trim: true, maxlength: 500, default: "https://youtube.com/@thepointer" },
  instagramUrl: { type: String, trim: true, maxlength: 500, default: "" },
  facebookUrl: { type: String, trim: true, maxlength: 500, default: "" },
  whatsappUrl: { type: String, trim: true, maxlength: 500, default: "" },
  cloudinaryCloudName: { type: String, trim: true, maxlength: 100, default: "" },
  cloudinaryUploadPreset: { type: String, trim: true, maxlength: 100, default: "" }
}, { timestamps: true });

module.exports = mongoose.model("Setting", settingSchema);
