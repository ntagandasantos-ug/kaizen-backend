const express = require("express");
const { pool } = require("../db");
const { requireAuth, requireRole } = require("../middleware/auth");

const router = express.Router();

router.get("/", async (req, res) => {
  const { from, to } = req.query;
  const params = [];
  let query = "SELECT * FROM events";
  if (from && to) { query += " WHERE event_date >= $1 AND event_date <= $2"; params.push(from, to); }
  query += " ORDER BY event_date";
  const { rows } = await pool.query(query, params);
  res.json(rows);
});

router.post("/", requireAuth, requireRole("admin"), async (req, res) => {
  const { title, event_date, event_type, department_ids, auditor_id } = req.body;
  const { rows } = await pool.query(
    `INSERT INTO events (title, event_date, event_type, department_ids, auditor_id)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [title, event_date, event_type, department_ids || [], auditor_id || null]
  );
  res.status(201).json(rows[0]);
});

router.delete("/:id", requireAuth, requireRole("admin"), async (req, res) => {
  await pool.query("DELETE FROM events WHERE id = $1", [req.params.id]);
  res.status(204).end();
});

module.exports = router;
