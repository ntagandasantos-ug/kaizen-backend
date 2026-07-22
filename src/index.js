require("dotenv").config();
const express = require("express");
const cors = require("cors");

const authRoutes = require("./routes/auth");
const departmentRoutes = require("./routes/departments");
const committeeRoutes = require("./routes/committee");
const auditRoutes = require("./routes/audits");
const eventRoutes = require("./routes/events");
const mediaRoutes = require("./routes/media");
const settingsRoutes = require("./routes/settings");

const app = express();

app.use(cors({ origin: process.env.CORS_ORIGIN || "*" }));
app.use(express.json({ limit: "2mb" })); // file bytes never pass through this server, so this can stay small

app.get("/health", (req, res) => res.json({ status: "ok", time: new Date().toISOString() }));

app.use("/api/auth", authRoutes);
app.use("/api/departments", departmentRoutes);
app.use("/api/committee", committeeRoutes);
app.use("/api/audits", auditRoutes);
app.use("/api/events", eventRoutes);
app.use("/api/media", mediaRoutes);
app.use("/api/settings", settingsRoutes);

// Central error handler — keeps stack traces out of API responses
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "Something went wrong on our end." });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`Kaizen backend listening on port ${PORT}`));
