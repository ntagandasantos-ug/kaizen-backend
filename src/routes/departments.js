const express = require("express");
const { pool } = require("../db");
const { requireAuth, requireRole } = require("../middleware/auth");

const router = express.Router();

// Public — anyone visiting the site can see the department list
router.get("/", async (req, res) => {
  const { rows } = await pool.query("SELECT * FROM departments ORDER BY name");
  res.json(rows);
});

router.post("/", requireAuth, requireRole("admin"), async (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: "Department name required." });
  try {
    const { rows } = await pool.query(
      "INSERT INTO departments (name) VALUES ($1) RETURNING *",
      [name.trim()]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === "23505") return res.status(409).json({ error: "That department already exists." });
    throw err;
  }
});

router.patch("/:id", requireAuth, requireRole("admin"), async (req, res) => {
  const { name } = req.body;
  const { rows } = await pool.query(
    "UPDATE departments SET name = $1 WHERE id = $2 RETURNING *",
    [name.trim(), req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ error: "Department not found." });
  res.json(rows[0]);
});

// Deleting cascades to that department's audits (see schema: ON DELETE CASCADE)
router.delete("/:id", requireAuth, requireRole("admin"), async (req, res) => {
  await pool.query("DELETE FROM departments WHERE id = $1", [req.params.id]);
  res.status(204).end();
});

module.exports = router;
