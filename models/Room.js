const mongoose = require("mongoose");

const roomSchema = new mongoose.Schema(
  {
    roomId: {
      type: String,
      required: true,
      unique: true,
    },
    ownerId: {
      type: String,
      required: true,
    },
    language: {
      type: String,
      required: true,
    },
    participants: [
      {
        userId: String,
        username: String,
        role: {
          type: String,
          enum: ["viewer", "editor", "runner", "co-admin", "admin"],
          default: "viewer",
        },
      },
    ],
    files: [
      {
        filename: String,
        content: String,
        updatedAt: Date,
      },
    ],
    versions: [
      {
        versionId: Number,
        timestamp: Date,
        snapshot: Object,
      },
    ],
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Room", roomSchema);
