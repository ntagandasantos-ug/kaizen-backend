const express = require("express");
const { pool } = require("../db");
const { requireAuth, requireRole } = require("../middleware/auth");

const router = express.Router();

// GET /api/audits?year=2026&department=<uuid> — public read
router.get("/", async (req, res) => {
  const { year = new Date().getFullYear(), department } = req.query;
  const params = [`${year}-01-01`, `${Number(year) + 1}-01-01`];
  let query = `
    SELECT a.*, d.name AS department_name
    FROM audits a
    JOIN departments d ON d.id = a.department_id
    WHERE a.month >= $1 AND a.month < $2
  `;
  if (department) { params.push(department); query += ` AND a.department_id = $3`; }
  query += " ORDER BY a.month, d.name";
  const { rows } = await pool.query(query, params);
  res.json(rows);
});

// GET /api/audits/rankings?year=2026 — replaces client-side computeStandings()
router.get("/rankings", async (req, res) => {
  const year = req.query.year || new Date().getFullYear();
  const { rows } = await pool.query(
    `SELECT d.id, d.name AS department,
            COALESCE(AVG(a.score), 0) AS ytd_avg,
            COUNT(a.score) AS months_scored,
            json_agg(json_build_object('month', a.month, 'score', a.score) ORDER BY a.month) AS monthly
     FROM departments d
     LEFT JOIN audits a ON a.department_id = d.id
       AND a.month >= $1 AND a.month < $2
     GROUP BY d.id, d.name
     ORDER BY ytd_avg DESC`,
    [`${year}-01-01`, `${Number(year) + 1}-01-01`]
  );
  res.json(rows);
});

// GET /api/audits/monthly-winners?year=2026
router.get("/monthly-winners", async (req, res) => {
  const year = req.query.year || new Date().getFullYear();
  const { rows } = await pool.query(
    `SELECT DISTINCT ON (a.month) a.month, d.name AS department, a.score
     FROM audits a
     JOIN departments d ON d.id = a.department_id
     WHERE a.month >= $1 AND a.month < $2 AND a.score IS NOT NULL
     ORDER BY a.month, a.score DESC`,
    [`${year}-01-01`, `${Number(year) + 1}-01-01`]
  );
  res.json(rows);
});

// GET /api/audits/current-winner-media — powers the homepage photo marquee.
// Finds the highest-scoring department for the most recently scored month,
// and returns that department's uploaded photos/videos for display.
router.get("/current-winner-media", async (req, res) => {
  const { rows: winnerRows } = await pool.query(
    `SELECT a.id AS audit_id, a.month, a.score, d.name AS department
     FROM audits a
     JOIN departments d ON d.id = a.department_id
     WHERE a.score IS NOT NULL
     ORDER BY a.month DESC, a.score DESC
     LIMIT 1`
  );
  const winner = winnerRows[0];
  if (!winner) return res.json({ winner: null, media: [] });

  const { rows: media } = await pool.query(
    `SELECT * FROM audit_media WHERE audit_id = $1 AND file_type IN ('photo','video') ORDER BY uploaded_at`,
    [winner.audit_id]
  );
  res.json({ winner, media });
});

// Auditors and admins can submit/update a score for a department+month.
// UPSERT keeps this idempotent — re-submitting the same month updates it.
router.put("/", requireAuth, requireRole("auditor", "admin"), async (req, res) => {
  const {
    department_id, month, score, sort_score, set_in_order_score,
    shine_score, standardize_score, sustain_score, safety_score, notes,
  } = req.body;

  if (!department_id || !month) {
    return res.status(400).json({ error: "department_id and month are required." });
  }

  const { rows } = await pool.query(
    `INSERT INTO audits (department_id, month, score, sort_score, set_in_order_score,
                          shine_score, standardize_score, sustain_score, safety_score,
                          notes, auditor_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,
             (SELECT id FROM committee_members WHERE user_id = $11 LIMIT 1))
     ON CONFLICT (department_id, month) DO UPDATE SET
       score = EXCLUDED.score, sort_score = EXCLUDED.sort_score,
       set_in_order_score = EXCLUDED.set_in_order_score, shine_score = EXCLUDED.shine_score,
       standardize_score = EXCLUDED.standardize_score, sustain_score = EXCLUDED.sustain_score,
       safety_score = EXCLUDED.safety_score, notes = EXCLUDED.notes, updated_at = now()
     RETURNING *`,
    [department_id, month, score, sort_score, set_in_order_score, shine_score,
     standardize_score, sustain_score, safety_score, notes, req.user.sub]
  );

  await pool.query(
    `INSERT INTO audit_log (user_id, action, target_table, target_id, details)
     VALUES ($1, 'audit.score.upsert', 'audits', $2, $3)`,
    [req.user.sub, rows[0].id, JSON.stringify({ department_id, month, score })]
  );

  res.json(rows[0]);
});

module.exports = router;
