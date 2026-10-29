const express = require("express");
const Category = require("../models/Category");

const router = express.Router();

router.get("/", async (req, res, next) => {
  try {
    return res.json(await Category.find().sort({ name: 1 }).lean());
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
