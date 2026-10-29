const mongoose = require("mongoose");

const episodeSchema = new mongoose.Schema({
  number: { type: Number, required: true, min: 1, unique: true },
  title: { type: String, required: true, trim: true, maxlength: 200 },
  category: { type: String, required: true, trim: true, maxlength: 80 },
  videoUrl: { type: String, required: true, trim: true, maxlength: 2000 },
  duration: {
    type: String,
    trim: true,
    default: "",
    validate: {
      validator(value) { return !value || /^(?:\d{1,2}:)?[0-5]?\d:[0-5]\d$/.test(value); },
      message: "Duration must be mm:ss or h:mm:ss."
    }
  },
  description: { type: String, trim: true, maxlength: 3000, default: "" },
  thumbnailUrl: { type: String, trim: true, maxlength: 2000, default: "" },
  show: { type: String, trim: true, maxlength: 100, default: "The Pointer" },
  status: { type: String, enum: ["published", "draft"], default: "draft", index: true },
  isFeatured: { type: Boolean, default: false },
  publishedAt: { type: Date, default: null }
}, { timestamps: true, autoIndex: false });

episodeSchema.index({ status: 1, publishedAt: -1 });
episodeSchema.index({ isFeatured: 1 }, { unique: true, partialFilterExpression: { isFeatured: true } });

module.exports = mongoose.model("Episode", episodeSchema);
