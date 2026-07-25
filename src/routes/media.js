const express = require("express");
const crypto = require("crypto");
const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const { pool } = require("../db");
const { requireAuth, requireRole } = require("../middleware/auth");
const { asyncHandler } = require("../utils");

const router = express.Router();

const s3 = new S3Client({
  region: process.env.S3_REGION || "auto",
  endpoint: process.env.S3_ENDPOINT,
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY_ID,
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
  },
});

const ALLOWED_TYPES = {
  "image/jpeg": "photo", "image/png": "photo", "image/webp": "photo",
  "video/mp4": "video", "video/quicktime": "video",
  "application/pdf": "report",
};
const MAX_BYTES = 500 * 1024 * 1024; // 500MB ceiling for a single video

// Categories this endpoint accepts, and the storage folder each one gets.
// Storage (this file) is shared across categories, but WHERE each upload gets
// recorded in the database differs — see each category's own route:
// 'audit'     -> audit photos/videos/reports tied to a department+month
//                (needs auditId) — recorded via THIS file's /confirm, into
//                audit_media.
// 'gallery'   -> general photos/videos/reports NOT tied to any department
//                (no entityId) — recorded via POST /api/gallery/confirm,
//                into the standalone gallery_media table.
// 'committee' -> a committee member or auditor's headshot (needs entityId) —
//                the frontend saves the returned URL itself via
//                PATCH /api/committee/:id.
// 'site'      -> the site logo / leadership photos (no entityId needed) —
//                the frontend saves the returned URL itself via
//                PATCH /api/settings.
const CATEGORY_FOLDERS = {
  audit: (entityId) => `audits/${entityId}`,
  gallery: () => `gallery`,
  committee: (entityId) => `committee/${entityId}`,
  site: () => `site`,
};

// Step 1: frontend asks for a signed upload URL. The file itself never
// touches this server — it goes straight from the browser to R2/S3. This
// step is identical no matter which category the file belongs to.
router.post("/upload-url", requireAuth, requireRole("auditor", "admin"), asyncHandler(async (req, res) => {
  const { category = "audit", entityId, fileName, contentType, fileSizeBytes } = req.body;

  if (!CATEGORY_FOLDERS[category]) {
    return res.status(400).json({ error: `Unknown category: ${category}` });
  }
  if (category !== "site" && category !== "gallery" && !entityId) {
    return res.status(400).json({ error: "entityId is required for this category." });
  }
  if (!ALLOWED_TYPES[contentType]) {
    return res.status(400).json({ error: `Unsupported file type: ${contentType}` });
  }
  // Logos and committee headshots are always images — enforce that even though
  // the general ALLOWED_TYPES list also permits video/pdf for audit/gallery uploads.
  if ((category === "site" || category === "committee") && ALLOWED_TYPES[contentType] !== "photo") {
    return res.status(400).json({ error: "Logo and profile photos must be an image file." });
  }
  if (fileSizeBytes && fileSizeBytes > MAX_BYTES) {
    return res.status(400).json({ error: "File exceeds 500MB limit." });
  }

  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
  const folder = CATEGORY_FOLDERS[category](entityId);
  const key = `${folder}/${Date.now()}-${crypto.randomUUID()}-${safeName}`;

  const command = new PutObjectCommand({
    Bucket: process.env.S3_BUCKET,
    Key: key,
    ContentType: contentType,
  });
  const uploadUrl = await getSignedUrl(s3, command, { expiresIn: 300 }); // 5 minutes

  res.json({
    uploadUrl,
    key,
    fileUrl: `${process.env.S3_PUBLIC_BASE}/${key}`,
    fileType: ALLOWED_TYPES[contentType],
  });
}));

// Step 2: after the browser finishes the direct upload, it confirms here.
// Only 'audit' category uploads get recorded here, into audit_media.
// 'gallery' uploads are confirmed via POST /api/gallery/confirm instead —
// this endpoint just hands the URL back for those so the frontend can call
// the right place. Committee photos and the site logo are simpler still —
// the frontend saves the returned URL itself via PATCH /api/committee/:id
// or PATCH /api/settings, no confirm step needed.
router.post("/confirm", requireAuth, requireRole("auditor", "admin"), asyncHandler(async (req, res) => {
  const { category = "audit", auditId, key, fileUrl, fileType, fileSizeBytes } = req.body;

  if (category !== "audit") {
    return res.status(200).json({ fileUrl, key });
  }
  if (!auditId) return res.status(400).json({ error: "auditId is required to confirm an audit upload." });

  const { rows } = await pool.query(
    `INSERT INTO audit_media (audit_id, file_url, file_key, file_type, file_size_bytes, uploaded_by)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [auditId, fileUrl, key, fileType, fileSizeBytes || null, req.user.sub]
  );
  res.status(201).json(rows[0]);
}));

// List media for a given audit (public — visitors should be able to see photos)
router.get("/audit/:auditId", asyncHandler(async (req, res) => {
  const { rows } = await pool.query(
    "SELECT * FROM audit_media WHERE audit_id = $1 ORDER BY uploaded_at DESC",
    [req.params.auditId]
  );
  res.json(rows);
}));

// GET /api/media?year=2026 — department-scoped audit media only (photos tied
// to a specific department's audit). For the general, department-independent
// gallery, see GET /api/gallery instead.
router.get("/", asyncHandler(async (req, res) => {
  const year = req.query.year || new Date().getFullYear();
  const { rows } = await pool.query(
    `SELECT m.*, a.month, d.name AS department
     FROM audit_media m
     JOIN audits a ON a.id = m.audit_id
     JOIN departments d ON d.id = a.department_id
     WHERE a.month >= $1 AND a.month < $2
     ORDER BY m.uploaded_at DESC
     LIMIT 100`,
    [`${year}-01-01`, `${Number(year) + 1}-01-01`]
  );
  res.json(rows);
}));

// Generate a short-lived signed URL to view/download a private file.
// (Skip this endpoint entirely if your bucket is public — then file_url
// works directly and this becomes unnecessary.)
router.get("/:id/view-url", asyncHandler(async (req, res) => {
  const { rows } = await pool.query("SELECT * FROM audit_media WHERE id = $1", [req.params.id]);
  const media = rows[0];
  if (!media) return res.status(404).json({ error: "Not found." });

  const command = new GetObjectCommand({ Bucket: process.env.S3_BUCKET, Key: media.file_key });
  const url = await getSignedUrl(s3, command, { expiresIn: 900 }); // 15 minutes
  res.json({ url });
}));

router.delete("/:id", requireAuth, requireRole("admin"), asyncHandler(async (req, res) => {
  const { rows } = await pool.query("SELECT * FROM audit_media WHERE id = $1", [req.params.id]);
  const media = rows[0];
  if (!media) return res.status(404).json({ error: "Not found." });

  await s3.send(new DeleteObjectCommand({ Bucket: process.env.S3_BUCKET, Key: media.file_key }));
  await pool.query("DELETE FROM audit_media WHERE id = $1", [req.params.id]);
  res.status(204).end();
}));

module.exports = router;
