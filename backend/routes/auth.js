const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const mongoose = require("mongoose");
const auth = require("../middleware/auth");
const fileStore = require("../utils/fileStore");

const isDbConnected = () => mongoose.connection.readyState === 1;

const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "7d";

const signToken = (user) => {
  if (!process.env.JWT_SECRET) {
    throw new Error("Server auth misconfigured");
  }
  return jwt.sign(
    { userId: user._id.toString(), username: user.username },
    process.env.JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
};

router.post("/signup", async (req, res) => {
  try {
    const { email, password, username } = req.body;
    if (!email || !password || !username) {
      return res.status(400).json({ message: "Email, password, and username are required." });
    }
    const hashedPassword = await bcrypt.hash(password, 10);

    let user;
    if (isDbConnected()) {
      const existing = await User.findOne({ email });
      if (existing) {
        return res.status(400).json({ message: "Email already registered." });
      }
      user = new User({ email, password: hashedPassword, username });
      await user.save();
    } else {
      // Fallback: local JSON store
      user = fileStore.users.create({ email, password: hashedPassword, username });
    }

    const token = signToken(user);
    res.status(201).json({ token, username: user.username });
  } catch (error) {
    if (error.message === "Server auth misconfigured") {
      return res.status(500).json({ message: error.message });
    }
    res.status(400).json({ message: error.message });
  }
});

router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ message: "Email and password are required." });
    }
    let user;

    if (isDbConnected()) {
      user = await User.findOne({ email });
    } else {
      user = fileStore.users.findByEmail(email);
    }

    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ message: "Invalid email or password." });
    }
    const token = signToken(user);
    res.json({ token, username: user.username });
  } catch (error) {
    if (error.message === "Server auth misconfigured") {
      return res.status(500).json({ message: error.message });
    }
    res.status(500).json({ message: error.message });
  }
});

// ── GET /api/auth/me ──────────────────────────────────────────────────────────
router.get("/me", auth, async (req, res) => {
  try {
    const userId = req.user.userId;
    let user;
    if (isDbConnected()) {
      user = await User.findById(userId).select("-password");
    } else {
      user = fileStore.users.findById(userId);
    }
    if (!user) {
      return res.json({ userId, username: req.user.username });
    }
    res.json({ userId: user._id, username: user.username, email: user.email });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
