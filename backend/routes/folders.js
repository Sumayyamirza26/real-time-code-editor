const express = require('express');
const router = express.Router();
const Folder = require('../models/Folder');
const File = require('../models/File');
const auth = require('../middleware/auth');
const mongoose = require('mongoose');
const fileStore = require('../utils/fileStore');

const isDbConnected = () => mongoose.connection.readyState === 1;

// Input validation
const isValidName = (name) => {
  if (!name || name.trim() === '') return false;
  if (name.length > 100) return false;
  if (name.includes('/') || name.includes('\\') || name.includes('..')) return false;
  return true;
};

// GET /api/folders
router.get('/', auth, async (req, res) => {
  res.set("Cache-Control", "no-cache, no-store, must-revalidate");
  const userId = req.user.userId;
  if (!isDbConnected()) {
    try {
      const folders = fileStore.folders.findAll(userId);
      return res.json(folders);
    } catch (err) {
      return res.json([]);
    }
  }

  try {
    const folders = await Folder.find({ userId });
    res.json(folders);
  } catch (err) {
    try {
      const fallbackFolders = fileStore.folders.findAll(userId);
      return res.json(fallbackFolders);
    } catch {
      res.json([]);
    }
  }
});

// POST /api/folders
router.post('/', auth, async (req, res) => {
  const { name, parentId } = req.body;
  if (!isValidName(name)) {
    return res.status(400).json({ error: "Invalid folder name" });
  }
  const userId = req.user.userId;

  if (!isDbConnected()) {
    try {
      const folder = fileStore.folders.create({ name: name.trim(), userId, parentId });
      return res.json({ message: "Folder created", folder });
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
  }

  try {
    const conflict = await Folder.findOne({ name: name.trim(), userId, parentId: parentId || null });
    if (conflict) {
      return res.status(400).json({ error: "Folder with that name already exists in this location" });
    }
    const folder = new Folder({ name: name.trim(), userId, parentId: parentId || null });
    await folder.save();
    res.json({ message: "Folder created", folder });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/folders/:id/rename
router.patch('/:id/rename', auth, async (req, res) => {
  const { name } = req.body;
  if (!isValidName(name)) {
    return res.status(400).json({ error: "Invalid folder name" });
  }
  const userId = req.user.userId;
  const folderId = req.params.id;

  if (isDbConnected() && mongoose.isValidObjectId(folderId)) {
    try {
      const folder = await Folder.findOne({ _id: folderId, userId });
      if (folder) {
        const conflict = await Folder.findOne({
          name: name.trim(),
          userId,
          parentId: folder.parentId,
          _id: { $ne: folderId },
        });
        if (conflict) {
          return res.status(400).json({ error: "Folder with that name already exists in this location" });
        }

        folder.name = name.trim();
        folder.updatedAt = new Date();
        await folder.save();
        try { fileStore.folders.rename(folderId, name.trim(), userId); } catch {}
        return res.json({ message: "Folder renamed", folder });
      }
    } catch (err) {
      console.warn("MongoDB folder rename error:", err.message);
    }
  }

  // Fallback to fileStore
  try {
    const folder = fileStore.folders.rename(folderId, name.trim(), userId);
    return res.json({ message: "Folder renamed", folder });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

// DELETE /api/folders/:id
router.delete('/:id', auth, async (req, res) => {
  const userId = req.user.userId;
  const folderId = req.params.id;
  let deleted = false;

  if (isDbConnected() && mongoose.isValidObjectId(folderId)) {
    try {
      const folder = await Folder.findOne({ _id: folderId, userId });
      if (folder) {
        // Recursively delete all descendant folders and their files
        const idsToDelete = [folderId];
        let i = 0;
        while (i < idsToDelete.length) {
          const currentId = idsToDelete[i];
          const children = await Folder.find({ parentId: currentId, userId });
          idsToDelete.push(...children.map((c) => c._id));
          i++;
        }

        await Folder.deleteMany({ _id: { $in: idsToDelete }, userId });
        await File.deleteMany({ folderId: { $in: idsToDelete }, userId });
        deleted = true;
      }
    } catch (err) {
      console.warn("MongoDB folder delete error:", err.message);
    }
  }

  // Also clean up fileStore
  try {
    const allFolders = fileStore.folders.findAll(userId);
    if (allFolders.some((f) => f._id === folderId)) {
      fileStore.folders.delete(folderId, userId);
      deleted = true;
    }
  } catch (err) {
    console.warn("fileStore folder delete error:", err.message);
  }

  if (deleted) {
    return res.json({ message: "Folder deleted" });
  }

  return res.status(404).json({ error: "Folder not found" });
});

module.exports = router;
