const express = require("express");
const app = express();
const http = require("http");
const path = require("path");
const { Server } = require("socket.io");
const ACTIONS = require("./utils/Actions");
const mongoose = require("mongoose");
const cors = require("cors");
const Room = require("./models/Room");
const CodeExecutor = require("./utils/codeExecutor");
require("dotenv").config();

// Ensure IPv4 localhost resolves correctly on modern Node versions
const dns = require("dns");
if (dns.setDefaultResultOrder) {
  dns.setDefaultResultOrder("ipv4first");
}

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
  pingTimeout: 60000,
  pingInterval: 25000,
});

// Disable command buffering so DB errors don't hang and crash the socket server
mongoose.set("bufferCommands", false);

const isDbConnected = () => mongoose.connection.readyState === 1;

// Connect to MongoDB
const mongoUri =
  process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/realtime-code-editor";

mongoose
  .connect(mongoUri, {
    serverSelectionTimeoutMS: 5000,
  })
  .then(() => console.log("MongoDB connected successfully"))
  .catch((err) => {
    console.warn("MongoDB connection warning:", err.message);
    console.warn("Server will continue running in memory mode for real-time editor.");
  });

app.use(cors());
app.use(express.json());

// Routes
app.use("/api/auth", require("./routes/auth"));
app.use("/api/rooms", require("./routes/rooms"));
app.use("/api/files", require("./routes/files"));
app.use("/api/folders", require("./routes/folders"));

// POST /execute endpoint – simple one-shot HTTP execution (no stdin)
app.post("/execute", (req, res) => {
  const { code, language } = req.body;
  if (!code || !language) {
    return res.status(400).json({ error: "code and language are required." });
  }

  const executor = new CodeExecutor(null, code, language, false);
  let output = "";
  let errOutput = "";

  executor.start({
    onOutput: (chunk) => { output += chunk; },
    onError:  (chunk) => { errOutput += chunk; },
    onClose:  (exitCode, spawnError) => {
      if (spawnError) {
        return res.status(200).json({ output: output || null, error: spawnError });
      }
      if (errOutput && !output) {
        return res.status(200).json({ output: null, error: errOutput.trim() });
      }
      res.status(200).json({
        output: output.trim() || null,
        error: errOutput.trim() || null,
        exitCode,
      });
    },
  });
});

app.use(express.static("../frontend/build"));
app.use((req, res, next) => {
  res.sendFile(path.join(__dirname, "../frontend/build", "index.html"));
});

const userSocketMap = {};

// Track active executors per socket so TERMINAL_INPUT can write to them
const socketExecutors = {};

function getAllConnectedClients(roomId) {
  return Array.from(io.sockets.adapter.rooms.get(roomId) || []).map(
    (socketId) => {
      return {
        socketId,
        username: userSocketMap[socketId] || "Anonymous",
      };
    }
  );
}

io.on("connection", (socket) => {
  console.log("Socket connected:", socket.id);

  socket.on(ACTIONS.JOIN, async ({ roomId, username, token }) => {
    try {
      if (!roomId) return;
      const displayName = username || "Anonymous";
      userSocketMap[socket.id] = displayName;
      socket.join(roomId);

      // Verify token optionally for authenticated users
      let user = null;
      if (token && process.env.JWT_SECRET) {
        try {
          const jwt = require("jsonwebtoken");
          user = jwt.verify(token, process.env.JWT_SECRET);
        } catch (jwtErr) {
          // Guest or invalid token allowed for collaboration
        }
      }

      // Check room in DB if DB is connected
      let room = null;
      if (isDbConnected()) {
        try {
          room = await Room.findOne({ roomId });
          if (!room && user) {
            room = new Room({
              roomId,
              ownerId: user.userId,
              language: "javascript",
              participants: [
                { userId: user.userId, username: displayName, role: "admin" },
              ],
              files: [],
              versions: [],
            });
            await room.save();
          } else if (room && user) {
            const existingParticipant = room.participants.find(
              (p) => p.userId === user.userId
            );
            if (!existingParticipant) {
              room.participants.push({
                userId: user.userId,
                username: displayName,
                role: "editor",
              });
              await room.save();
            }
          }
        } catch (dbErr) {
          console.warn("DB operation warning in JOIN:", dbErr.message);
        }
      }

      const clients = getAllConnectedClients(roomId);
      clients.forEach(({ socketId }) => {
        io.to(socketId).emit(ACTIONS.JOINED, {
          clients,
          username: displayName,
          socketId: socket.id,
        });
      });

      if (room) {
        socket.emit("room_data", room);
      }
    } catch (error) {
      console.error("Error in ACTIONS.JOIN:", error);
    }
  });

  socket.on(ACTIONS.CODE_CHANGE, async ({ roomId, code, filename }) => {
    try {
      if (!roomId) return;
      socket.in(roomId).emit(ACTIONS.CODE_CHANGE, { code, filename });

      // Update file in DB if connected
      if (isDbConnected()) {
        try {
          const room = await Room.findOne({ roomId });
          if (room) {
            const file = room.files.find((f) => f.filename === filename);
            if (file) {
              file.content = code;
              file.updatedAt = new Date();
            } else {
              room.files.push({
                filename: filename || "main",
                content: code,
                updatedAt: new Date(),
              });
            }
            await room.save();
          }
        } catch (dbErr) {
          // Ignore DB save errors during active typing to avoid interrupting socket sync
        }
      }
    } catch (err) {
      console.error("Error in CODE_CHANGE:", err.message);
    }
  });

  socket.on(ACTIONS.SYNC_CODE, ({ socketId, code }) => {
    if (socketId) {
      io.to(socketId).emit(ACTIONS.CODE_CHANGE, { code });
    }
  });

  // ── Standard (non-Docker) execution ───────────────────────────────────────
  socket.on(ACTIONS.RUN_CODE, ({ roomId, code, language }) => {
    // Kill any existing executor for this socket before starting a new one
    if (socketExecutors[socket.id]) {
      socketExecutors[socket.id].kill();
      delete socketExecutors[socket.id];
    }

    console.log(`[Standard] Executing ${language} code for room ${roomId}`);

    const executor = new CodeExecutor(roomId, code, language, false);
    socketExecutors[socket.id] = executor;

    let outputBuffer = "";
    let errorBuffer = "";

    executor.start({
      onOutput: (chunk) => {
        outputBuffer += chunk;
        // Stream output progressively to the terminal
        socket.emit(ACTIONS.TERMINAL_OUTPUT, { output: chunk });
      },
      onError: (chunk) => {
        errorBuffer += chunk;
        // Show stderr in terminal as it arrives
        socket.emit(ACTIONS.TERMINAL_OUTPUT, { output: chunk });
      },
      onClose: (exitCode, spawnError) => {
        delete socketExecutors[socket.id];

        if (spawnError) {
          socket.emit(ACTIONS.CODE_RESULT, { result: outputBuffer || null, error: spawnError });
        } else if (exitCode !== 0 && errorBuffer) {
          socket.emit(ACTIONS.CODE_RESULT, {
            result: outputBuffer || null,
            error: errorBuffer.trim(),
          });
        } else {
          socket.emit(ACTIONS.CODE_RESULT, {
            result: outputBuffer.trim() || "(no output)",
            error: errorBuffer.trim() || null,
          });
        }
      },
    });
  });

  // ── Docker execution ───────────────────────────────────────────────────────
  socket.on(ACTIONS.DOCKER_RUN_CODE, ({ roomId, code, language }) => {
    if (!roomId || !code || !language) {
      socket.emit(ACTIONS.DOCKER_CODE_RESULT, {
        result: null,
        error: "Missing roomId, code, or language.",
      });
      return;
    }

    // Kill any existing executor for this socket
    if (socketExecutors[socket.id]) {
      socketExecutors[socket.id].kill();
      delete socketExecutors[socket.id];
    }

    console.log(`[Docker] Executing ${language} code for room ${roomId}`);

    const executor = new CodeExecutor(roomId, code, language, true);
    socketExecutors[socket.id] = executor;

    let outputBuffer = "";
    let errorBuffer = "";

    executor.start({
      onOutput: (chunk) => {
        outputBuffer += chunk;
        // Broadcast streaming output to the whole room
        io.in(roomId).emit(ACTIONS.TERMINAL_OUTPUT, { output: chunk });
      },
      onError: (chunk) => {
        errorBuffer += chunk;
        io.in(roomId).emit(ACTIONS.TERMINAL_OUTPUT, { output: chunk });
      },
      onClose: (exitCode, spawnError) => {
        delete socketExecutors[socket.id];

        if (spawnError) {
          io.in(roomId).emit(ACTIONS.DOCKER_CODE_RESULT, {
            result: outputBuffer || null,
            error: spawnError,
          });
        } else if (exitCode !== 0 && errorBuffer) {
          io.in(roomId).emit(ACTIONS.DOCKER_CODE_RESULT, {
            result: outputBuffer || null,
            error: errorBuffer.trim(),
          });
        } else {
          io.in(roomId).emit(ACTIONS.DOCKER_CODE_RESULT, {
            result: outputBuffer.trim() || "(no output)",
            error: errorBuffer.trim() || null,
          });
        }
      },
    });
  });

  // ── Interactive stdin from terminal ────────────────────────────────────────
  socket.on(ACTIONS.TERMINAL_INPUT, ({ roomId, input }) => {
    const executor = socketExecutors[socket.id];
    if (executor) {
      // Write user input to the running process's stdin
      executor.write(input + "\n");
      // Echo the input back to the terminal so the user sees what they typed
      socket.emit(ACTIONS.TERMINAL_OUTPUT, { output: input + "\n" });
    } else {
      // No running process — just echo as a no-op prompt
      socket.emit(ACTIONS.TERMINAL_OUTPUT, { output: `(no running process)\n` });
    }
  });

  socket.on(ACTIONS.FILE_EXPLORER_REFRESH, ({ roomId }) => {
    if (roomId) {
      socket.in(roomId).emit(ACTIONS.FILE_EXPLORER_REFRESH);
    }
  });

  socket.on(ACTIONS.SAVE_VERSION, async ({ roomId, snapshot, token }) => {
    try {
      if (!isDbConnected()) {
        socket.emit("version_saved", { message: "DB not connected" });
        return;
      }
      const room = await Room.findOne({ roomId });
      if (room) {
        const versionId = room.versions.length + 1;
        room.versions.push({ versionId, timestamp: new Date(), snapshot });
        await room.save();
        socket.emit("version_saved", { versionId });
      }
    } catch (error) {
      console.error("Error saving version:", error);
    }
  });

  socket.on("disconnecting", () => {
    // Kill any running executor when the socket disconnects
    if (socketExecutors[socket.id]) {
      socketExecutors[socket.id].kill();
      delete socketExecutors[socket.id];
    }
    const rooms = [...socket.rooms];
    rooms.forEach((roomId) => {
      socket.in(roomId).emit(ACTIONS.DISCONNECTED, {
        socketId: socket.id,
        username: userSocketMap[socket.id],
      });
    });
    delete userSocketMap[socket.id];
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`Listening on port ${PORT}`));
