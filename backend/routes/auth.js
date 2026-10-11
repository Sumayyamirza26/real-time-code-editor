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

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

router.post("/signup", async (req, res) => {
  try {
    let { email, password, username } = req.body;
    if (!email || !password || !username) {
      return res.status(400).json({ message: "Email, password, and username are required." });
    }
    email = String(email).trim().toLowerCase();
    username = String(username).trim();
    if (!EMAIL_RE.test(email)) {
      return res.status(400).json({ message: "Invalid email address." });
    }
    if (String(password).length < 8) {
      return res.status(400).json({ message: "Password must be at least 8 characters." });
    }
    if (username.length < 2 || username.length > 30) {
      return res.status(400).json({ message: "Username must be 2-30 characters." });
    }
    const hashedPassword = await bcrypt.hash(password, 10);

    let user;
    if (isDbConnected()) {
      const existing = await User.findOne({ $or: [{ email }, { username }] });
      if (existing) {
        return res.status(409).json({ message: "Email or username already registered." });
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
    if (error.code === 11000 || /already (registered|taken)/i.test(error.message)) {
      return res.status(409).json({ message: "Email or username already registered." });
    }
    console.error("Signup error:", error.message);
    res.status(500).json({ message: "Signup failed." });
  }
});

router.post("/login", async (req, res) => {
  try {
    let { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ message: "Email and password are required." });
    }
    email = String(email).trim().toLowerCase();
    let user;

    if (isDbConnected()) {
      user = await User.findOne({ email }).select("+password");
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
    console.error("Login error:", error.message);
    res.status(500).json({ message: "Login failed." });
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
    console.error("Auth me error:", error.message);
    res.status(500).json({ message: "Request failed." });
  }
});

module.exports = router;
