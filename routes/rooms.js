const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth");
const Room = require("../models/Room");
const { v4: uuidv4 } = require("uuid");

router.post("/", auth, async (req, res) => {
  try {
    const { language } = req.body;
    const roomId = uuidv4();
    const room = new Room({
      roomId,
      ownerId: req.user.userId,
      language,
      participants: [
        { userId: req.user.userId, username: req.user.username, role: "admin" },
      ],
      files: [],
      versions: [],
    });
    await room.save();
    res.status(201).json({ roomId });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.post("/:roomId/join", auth, async (req, res) => {
  try {
    const room = await Room.findOne({ roomId: req.params.roomId });
    if (!room) {
      return res.status(404).json({ message: "Room not found" });
    }
    const existingParticipant = room.participants.find(
      (p) => p.userId === req.user.userId
    );
    if (existingParticipant) {
      return res.status(400).json({ message: "Already joined" });
    }
    room.participants.push({
      userId: req.user.userId,
      username: req.user.username,
      role: "viewer",
    });
    await room.save();
    res.json({ message: "Joined room" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get("/:roomId", auth, async (req, res) => {
  try {
    const room = await Room.findOne({ roomId: req.params.roomId });
    if (!room) {
      return res.status(404).json({ message: "Room not found" });
    }
    res.json(room);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
