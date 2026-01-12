//backend/src/server.js


require("dotenv").config();
const fs = require("fs");
const path = require("path");
const express = require("express");
const cors = require("cors");
const compression = require("compression");

const authRoutes = require("./routes/auth");
const adminRoutes = require("./routes/admin");
const schoolsRoutes = require("./routes/schools");
const normRoutes = require("./routes/norm");
const scenariosRoutes = require("./routes/scenarios");
const metaRoutes = require("./routes/meta");

const app = express();

app.use(cors({
  origin: process.env.CORS_ORIGIN || "*",
  credentials: false
}));

app.use(compression());

app.use(express.json({ limit: "2mb" }));

app.get("/api/health", (req, res) => res.json({ ok: true, name: "feasibility-backend" }));

app.use("/api/auth", authRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/schools", schoolsRoutes);

// norm routes include /schools/:id/norm-config
app.use("/api", normRoutes);

// scenarios routes include /schools/:schoolId/scenarios/...
app.use("/api", scenariosRoutes);

// meta routes include /meta/...
app.use("/api/meta", metaRoutes);

const backendBuildPath = path.join(__dirname, "..", "build");
const frontendBuildPath = path.join(__dirname, "..", "..", "frontend", "build");
const buildPath = fs.existsSync(backendBuildPath) ? backendBuildPath : frontendBuildPath;
const isProduction = process.env.NODE_ENV === "production";
const staticCacheOptions = {
  maxAge: isProduction ? 30 * 24 * 60 * 60 * 1000 : 0,
  immutable: isProduction,
  setHeaders(res, filePath) {
    if (filePath.endsWith(".html")) {
      res.setHeader("Cache-Control", "no-cache");
    }
  },
};
app.use(express.static(buildPath, staticCacheOptions));
app.get("*", (req, res) => {
  const indexPath = path.join(buildPath, "index.html");
  if (!fs.existsSync(indexPath)) {
    res.status(404).send("Frontend build not found.");
    return;
  }
  res.sendFile(indexPath);
});

const port = Number(process.env.PORT || 3000);
app.listen(port, () => console.log(`API running on http://localhost:${port}`));
