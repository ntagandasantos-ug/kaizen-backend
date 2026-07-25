const express = require("express");
const crypto = require("crypto");
const { S3Client, DeleteObjectCommand } = require("@aws-sdk/client-s3");
const { pool } = require("../db");
const { requireAuth, requireRole } = require("../middleware/auth");

const router = express.Router();

const s3 = new S3Client({
  region: process.env.S3_REGION || "auto",
  endpoint: process.env.S3_ENDPOINT,
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY_ID,
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
  },
});

// Public — anyone visiting the site can see the general gallery.
// This is entirely separate from department audit photos: no department,
// no month, just a free-form company gallery.
router.get("/", async (req, res) => {
  const { rows } = await pool.query(
    "SELECT * FROM gallery_media ORDER BY uploaded_at DESC LIMIT 200"
  );
  res.json(rows);
});

// Confirms a direct-to-storage upload (the signed URL itself comes from the
// shared POST /api/media/upload-url with category='gallery') and records it
// in the standalone gallery_media table.
router.post("/confirm", requireAuth, requireRole("auditor", "admin"), async (req, res) => {
  const { key, fileUrl, fileType, fileSizeBytes, caption } = req.body;
  if (!key || !fileUrl || !fileType) {
    return res.status(400).json({ error: "key, fileUrl, and fileType are required." });
  }
  const { rows } = await pool.query(
    `INSERT INTO gallery_media (file_url, file_key, file_type, caption, file_size_bytes, uploaded_by)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [fileUrl, key, fileType, caption || null, fileSizeBytes || null, req.user.sub]
  );
  res.status(201).json(rows[0]);
});

router.delete("/:id", requireAuth, requireRole("admin"), async (req, res) => {
  const { rows } = await pool.query("SELECT * FROM gallery_media WHERE id = $1", [req.params.id]);
  const item = rows[0];
  if (!item) return res.status(404).json({ error: "Not found." });

  await s3.send(new DeleteObjectCommand({ Bucket: process.env.S3_BUCKET, Key: item.file_key }));
  await pool.query("DELETE FROM gallery_media WHERE id = $1", [req.params.id]);
  res.status(204).end();
});

module.exports = router;
