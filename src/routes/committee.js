const express = require("express");
const { pool } = require("../db");
const { requireAuth, requireRole } = require("../middleware/auth");

const router = express.Router();

// Sorted by sort_order (the hierarchy position admins set), falling back to
// name for any members that share the same order value.
router.get("/", async (req, res) => {
  const { rows } = await pool.query("SELECT * FROM committee_members ORDER BY sort_order ASC, name ASC");
  res.json(rows);
});

router.post("/", requireAuth, requireRole("admin"), async (req, res) => {
  const { name, role, photo_url, is_lead, attached_departments, sort_order } = req.body;

  // New members default to the bottom of the hierarchy unless a position is given.
  let position = sort_order;
  if (position === undefined || position === null) {
    const { rows } = await pool.query("SELECT COALESCE(MAX(sort_order), 0) + 1 AS next FROM committee_members");
    position = rows[0].next;
  }

  const { rows } = await pool.query(
    `INSERT INTO committee_members (name, role, photo_url, is_lead, attached_departments, sort_order)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [name, role, photo_url || null, !!is_lead, attached_departments || [], position]
  );
  res.status(201).json(rows[0]);
});

router.patch("/:id", requireAuth, requireRole("admin"), async (req, res) => {
  const { name, role, photo_url, is_lead, attached_departments, sort_order } = req.body;
  const { rows } = await pool.query(
    `UPDATE committee_members
     SET name = COALESCE($1, name), role = COALESCE($2, role),
         photo_url = COALESCE($3, photo_url), is_lead = COALESCE($4, is_lead),
         attached_departments = COALESCE($5, attached_departments),
         sort_order = COALESCE($6, sort_order)
     WHERE id = $7 RETURNING *`,
    [name, role, photo_url, is_lead, attached_departments, sort_order, req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ error: "Committee member not found." });
  res.json(rows[0]);
});

// Bulk reorder: accepts [{ id, sort_order }, ...] and applies them all in one
// go — used when an admin drags/moves a member up or down the hierarchy.
router.post("/reorder", requireAuth, requireRole("admin"), async (req, res) => {
  const { order } = req.body; // [{ id, sort_order }, ...]
  if (!Array.isArray(order)) return res.status(400).json({ error: "order must be an array of { id, sort_order }." });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const item of order) {
      await client.query("UPDATE committee_members SET sort_order = $1 WHERE id = $2", [item.sort_order, item.id]);
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }

  const { rows } = await pool.query("SELECT * FROM committee_members ORDER BY sort_order ASC, name ASC");
  res.json(rows);
});

router.delete("/:id", requireAuth, requireRole("admin"), async (req, res) => {
  await pool.query("DELETE FROM committee_members WHERE id = $1", [req.params.id]);
  res.status(204).end();
});

module.exports = router;
