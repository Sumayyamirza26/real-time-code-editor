/**
 * fileStore.js — JSON file-based persistence fallback.
 * Used automatically when MongoDB is not connected.
 * All data is stored in .data/ directory as JSON files.
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const DATA_DIR = path.join(__dirname, "..", ".data");
const USERS_FILE = path.join(DATA_DIR, "users.json");
const FILES_FILE = path.join(DATA_DIR, "files.json");
const FOLDERS_FILE = path.join(DATA_DIR, "folders.json");

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function readJson(filePath) {
  if (!fs.existsSync(filePath)) return [];
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return [];
  }
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
}

function newId() {
  return crypto.randomBytes(12).toString("hex");
}

// ── Users ─────────────────────────────────────────────────────────────────────

const users = {
  findByEmail(email) {
    return readJson(USERS_FILE).find((u) => u.email === email) || null;
  },
  findById(id) {
    return readJson(USERS_FILE).find((u) => u._id === id) || null;
  },
  create({ email, password, username }) {
    const all = readJson(USERS_FILE);
    if (all.find((u) => u.email === email)) {
      throw new Error("Email already registered");
    }
    const user = { _id: newId(), email, password, username, createdAt: new Date().toISOString() };
    all.push(user);
    writeJson(USERS_FILE, all);
    return user;
  },
};

// ── Files ─────────────────────────────────────────────────────────────────────

const folders = {
  findAll(userId) {
    return readJson(FOLDERS_FILE).filter((f) => f.userId === userId);
  },
  create({ name, userId, parentId }) {
    const all = readJson(FOLDERS_FILE);
    if (all.find((f) => f.name === name && f.userId === userId && f.parentId === (parentId || null))) {
      throw new Error("Folder already exists in this location");
    }
    const folder = {
      _id: newId(),
      name,
      userId,
      parentId: parentId || null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    all.push(folder);
    writeJson(FOLDERS_FILE, all);
    return folder;
  },
  rename(id, newName, userId) {
    const all = readJson(FOLDERS_FILE);
    const idx = all.findIndex((f) => f._id === id && f.userId === userId);
    if (idx < 0) throw new Error("Folder not found");
    const parentId = all[idx].parentId;
    if (all.find((f) => f.name === newName && f.userId === userId && f.parentId === parentId && f._id !== id)) {
      throw new Error("Folder with that name already exists in this location");
    }
    all[idx].name = newName;
    all[idx].updatedAt = new Date().toISOString();
    writeJson(FOLDERS_FILE, all);
    return all[idx];
  },
  delete(id, userId) {
    const allFolders = readJson(FOLDERS_FILE);
    const allFiles = readJson(FILES_FILE);
    
    const idsToDelete = [id];
    let i = 0;
    while (i < idsToDelete.length) {
      const currentId = idsToDelete[i];
      const children = allFolders.filter(f => f.parentId === currentId && f.userId === userId).map(f => f._id);
      idsToDelete.push(...children);
      i++;
    }
    
    const remainingFolders = allFolders.filter(f => !idsToDelete.includes(f._id) || f.userId !== userId);
    const remainingFiles = allFiles.filter(f => !idsToDelete.includes(f.folderId) || f.userId !== userId);
    
    writeJson(FOLDERS_FILE, remainingFolders);
    writeJson(FILES_FILE, remainingFiles);
  }
};

const files = {
  findAll(userId) {
    return readJson(FILES_FILE)
      .filter((f) => f.userId === userId)
      .map(({ _id, name, updatedAt, language, folderId }) => ({ _id, name, updatedAt, language, folderId }));
  },
  findByName(name, userId, folderId = null) {
    return readJson(FILES_FILE).find((f) => f.name === name && f.userId === userId && f.folderId === folderId) || null;
  },
  findById(id) {
    return readJson(FILES_FILE).find((f) => f._id === id) || null;
  },
  upsert({ name, code, userId, language, folderId }) {
    const all = readJson(FILES_FILE);
    const idx = all.findIndex((f) => f.name === name && f.userId === userId && f.folderId === (folderId || null));
    const now = new Date().toISOString();
    if (idx >= 0) {
      all[idx].code = code;
      all[idx].updatedAt = now;
      all[idx].language = language || all[idx].language || "javascript";
      all[idx].versions = [...(all[idx].versions || []), { code, createdAt: now }].slice(-20);
      writeJson(FILES_FILE, all);
      return all[idx];
    } else {
      const file = {
        _id: newId(),
        name,
        code,
        userId,
        folderId: folderId || null,
        language: language || "javascript",
        versions: [{ code, createdAt: now }],
        createdAt: now,
        updatedAt: now,
      };
      all.push(file);
      writeJson(FILES_FILE, all);
      return file;
    }
  },
  rename(id, newName, userId) {
    const all = readJson(FILES_FILE);
    const idx = all.findIndex((f) => f._id === id && f.userId === userId);
    if (idx < 0) throw new Error("File not found");
    const folderId = all[idx].folderId;
    if (all.find((f) => f.name === newName && f.userId === userId && f.folderId === folderId && f._id !== id)) {
      throw new Error("A file with that name already exists");
    }
    all[idx].name = newName;
    all[idx].updatedAt = new Date().toISOString();
    writeJson(FILES_FILE, all);
    return all[idx];
  },
  delete(id, userId) {
    const all = readJson(FILES_FILE);
    const idx = all.findIndex((f) => f._id === id && f.userId === userId);
    if (idx < 0) throw new Error("File not found");
    all.splice(idx, 1);
    writeJson(FILES_FILE, all);
  },
};

module.exports = { users, files, folders };
