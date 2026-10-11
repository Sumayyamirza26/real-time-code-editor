const express = require("express");
const router = express.Router();
const File = require("../models/File");
const auth = require("../middleware/auth");
const mongoose = require("mongoose");
const fileStore = require("../utils/fileStore");

const isDbConnected = () => mongoose.connection.readyState === 1;

// ── POST /save-file ──────────────────────────────────────────────────────────
router.post("/save-file", auth, async (req, res) => {
  const { name, code, language, folderId } = req.body;
  if (!name || name.trim() === "") {
    return res.status(400).json({ error: "File name is required." });
  }
  const userId = req.user.userId;

  if (!isDbConnected()) {
    // Fallback: persist to local JSON store
    try {
      const file = fileStore.files.upsert({ name: name.trim(), code, userId, language, folderId });
      return res.json({ message: "File saved successfully", file });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // MongoDB path
  try {
    let file = await File.findOne({ name: name.trim(), userId, folderId: folderId || null });
    if (file) {
      file.code = code;
      file.language = language || file.language || "javascript";
      file.updatedAt = new Date();
      file.versions.push({ code, createdAt: new Date() });
      await file.save();
    } else {
      file = new File({
        name: name.trim(),
        code,
        userId,
        folderId: folderId || null,
        language: language || "javascript",
        versions: [{ code, createdAt: new Date() }],
      });
      await file.save();
    }
    res.json({ message: "File saved successfully", file });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /saved-files ─────────────────────────────────────────────────────────
router.get("/saved-files", auth, async (req, res) => {
  res.set("Cache-Control", "no-cache, no-store, must-revalidate");
  const userId = req.user.userId;

  if (!isDbConnected()) {
    try {
      const files = fileStore.files.findAll(userId);
      return res.json(files);
    } catch (err) {
      return res.json([]);
    }
  }

  try {
    const files = await File.find({ userId }).select("name updatedAt _id language folderId").sort({ updatedAt: -1 });
    res.json(files);
  } catch (err) {
    try {
      const fallbackFiles = fileStore.files.findAll(userId);
      return res.json(fallbackFiles);
    } catch {
      res.json([]);
    }
  }
});

// ── GET /file/:id ─────────────────────────────────────────────────────────────
router.get("/file/:id", auth, async (req, res) => {
  const userId = req.user.userId;
  const fileId = req.params.id;

  if (isDbConnected() && mongoose.isValidObjectId(fileId)) {
    try {
      const file = await File.findById(fileId);
      if (file && file.userId.toString() === userId) {
        return res.json(file);
      }
    } catch (err) {
      console.warn("MongoDB get file error:", err.message);
    }
  }

  // Fallback to fileStore
  try {
    const file = fileStore.files.findById(fileId);
    if (!file || file.userId !== userId) {
      return res.status(404).json({ error: "File not found." });
    }
    return res.json(file);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ── PATCH /file/:id/rename ────────────────────────────────────────────────────
router.patch("/file/:id/rename", auth, async (req, res) => {
  const { name } = req.body;
  if (!name || name.trim() === "") {
    return res.status(400).json({ error: "New file name is required." });
  }
  const userId = req.user.userId;
  const fileId = req.params.id;

  if (isDbConnected() && mongoose.isValidObjectId(fileId)) {
    try {
      const file = await File.findOne({ _id: fileId, userId });
      if (file) {
        const conflict = await File.findOne({
          name: name.trim(),
          userId,
          folderId: file.folderId || null,
          _id: { $ne: fileId },
        });
        if (conflict) {
          return res.status(400).json({ error: "A file with that name already exists." });
        }
        file.name = name.trim();
        file.updatedAt = new Date();
        await file.save();
        try { fileStore.files.rename(fileId, name.trim(), userId); } catch {}
        return res.json({ message: "File renamed", file });
      }
    } catch (err) {
      console.warn("MongoDB rename error:", err.message);
    }
  }

  // Fallback to fileStore
  try {
    const file = fileStore.files.rename(fileId, name.trim(), userId);
    return res.json({ message: "File renamed", file });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

// ── DELETE /file/:id ──────────────────────────────────────────────────────────
router.delete("/file/:id", auth, async (req, res) => {
  const userId = req.user.userId;
  const fileId = req.params.id;
  let deleted = false;

  // 1. Try deleting from MongoDB if connected and valid ObjectId
  if (isDbConnected() && mongoose.isValidObjectId(fileId)) {
    try {
      const file = await File.findOneAndDelete({ _id: fileId, userId });
      if (file) deleted = true;
    } catch (err) {
      console.warn("MongoDB delete error:", err.message);
    }
  }

  // 2. Also clean up fileStore
  try {
    const all = fileStore.files.findAll(userId);
    if (all.some((f) => f._id === fileId)) {
      fileStore.files.delete(fileId, userId);
      deleted = true;
    }
  } catch (err) {
    console.warn("fileStore delete error:", err.message);
  }

  if (deleted) {
    return res.json({ message: "File deleted" });
  }

  return res.status(404).json({ error: "File not found." });
});

module.exports = router;
