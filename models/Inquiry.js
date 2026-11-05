const mongoose = require("mongoose");

const inquirySchema = new mongoose.Schema({
  fullName: { type: String, required: true, trim: true, maxlength: 120 },
  email: { type: String, required: true, trim: true, lowercase: true, maxlength: 254 },
  organization: { type: String, trim: true, maxlength: 160, default: "" },
  phone: { type: String, trim: true, maxlength: 40, default: "" },
  areaOfInterest: {
    type: String,
    required: true,
    enum: [
      "Media Consultancy & Training",
      "Conference & Event Organization",
      "General Merchandise & Contracts",
      "Import & Export Services",
      "Partnership with The Pointer",
      "Other"
    ]
  },
  message: { type: String, required: true, trim: true, maxlength: 5000 },
  consent: { type: Boolean, required: true, default: false },
  status: { type: String, enum: ["new", "contacted", "closed"], default: "new", index: true },
  read: { type: Boolean, default: false, index: true }
}, { timestamps: true });

module.exports = mongoose.model("Inquiry", inquirySchema);
