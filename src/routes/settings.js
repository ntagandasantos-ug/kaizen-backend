const express = require("express");
const { pool } = require("../db");
const { requireAuth, requireRole } = require("../middleware/auth");
const { asyncHandler } = require("../utils");

const router = express.Router();

// Public — every visitor needs these to render the homepage
router.get("/", asyncHandler(async (req, res) => {
  const { rows } = await pool.query("SELECT key, value FROM site_settings");
  const settings = {};
  rows.forEach((r) => { settings[r.key] = r.value; });
  res.json(settings);
}));

// Admin — update any subset of settings, e.g. { logo: "<url>" } or
// { chairpersonMessage: "...", chairpersonName: "...", chairpersonPhoto: "<url>" }
router.patch("/", requireAuth, requireRole("admin"), asyncHandler(async (req, res) => {
  const entries = Object.entries(req.body);
  if (entries.length === 0) return res.status(400).json({ error: "No settings provided." });

  for (const [key, value] of entries) {
    await pool.query(
      `INSERT INTO site_settings (key, value) VALUES ($1, $2)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
      [key, String(value)]
    );
  }

  const { rows } = await pool.query("SELECT key, value FROM site_settings");
  const settings = {};
  rows.forEach((r) => { settings[r.key] = r.value; });
  res.json(settings);
}));

module.exports = router;
