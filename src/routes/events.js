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
  const { title, event_date, end_date, event_type, department_ids, auditor_id } = req.body;
  if (!title || !event_date) {
    return res.status(400).json({ error: "title and event_date are required." });
  }
  if (end_date && end_date < event_date) {
    return res.status(400).json({ error: "End date can't be before the start date." });
  }
  const { rows } = await pool.query(
    `INSERT INTO events (title, event_date, end_date, event_type, department_ids, auditor_id)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [title, event_date, end_date || null, event_type, department_ids || [], auditor_id || null]
  );
  res.status(201).json(rows[0]);
});

router.patch("/:id", requireAuth, requireRole("admin"), async (req, res) => {
  const { title, event_date, end_date, event_type, department_ids, auditor_id } = req.body;
  if (end_date && event_date && end_date < event_date) {
    return res.status(400).json({ error: "End date can't be before the start date." });
  }
  const { rows } = await pool.query(
    `UPDATE events SET
       title = COALESCE($1, title), event_date = COALESCE($2, event_date),
       end_date = $3, event_type = COALESCE($4, event_type),
       department_ids = COALESCE($5, department_ids), auditor_id = COALESCE($6, auditor_id)
     WHERE id = $7 RETURNING *`,
    [title, event_date, end_date || null, event_type, department_ids, auditor_id, req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ error: "Event not found." });
  res.json(rows[0]);
});

router.delete("/:id", requireAuth, requireRole("admin"), async (req, res) => {
  await pool.query("DELETE FROM events WHERE id = $1", [req.params.id]);
  res.status(204).end();
});

module.exports = router;
