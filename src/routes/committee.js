const express = require("express");
const { pool } = require("../db");
const { requireAuth, requireRole } = require("../middleware/auth");

const router = express.Router();

router.get("/", async (req, res) => {
  const { rows } = await pool.query("SELECT * FROM committee_members ORDER BY is_lead DESC, name");
  res.json(rows);
});

router.post("/", requireAuth, requireRole("admin"), async (req, res) => {
  const { name, role, photo_url, is_lead, attached_departments } = req.body;
  const { rows } = await pool.query(
    `INSERT INTO committee_members (name, role, photo_url, is_lead, attached_departments)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [name, role, photo_url || null, !!is_lead, attached_departments || []]
  );
  res.status(201).json(rows[0]);
});

router.patch("/:id", requireAuth, requireRole("admin"), async (req, res) => {
  const { name, role, photo_url, attached_departments } = req.body;
  const { rows } = await pool.query(
    `UPDATE committee_members
     SET name = COALESCE($1, name), role = COALESCE($2, role),
         photo_url = COALESCE($3, photo_url), attached_departments = COALESCE($4, attached_departments)
     WHERE id = $5 RETURNING *`,
    [name, role, photo_url, attached_departments, req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ error: "Committee member not found." });
  res.json(rows[0]);
});

router.delete("/:id", requireAuth, requireRole("admin"), async (req, res) => {
  await pool.query("DELETE FROM committee_members WHERE id = $1", [req.params.id]);
  res.status(204).end();
});

module.exports = router;
