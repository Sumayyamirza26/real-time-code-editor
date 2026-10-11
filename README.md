# CodeSync — Real-Time Collaborative Code Editor

CodeSync is a browser-based collaborative code editor that lets multiple developers write, run, and share code together in real time. Just create a room, share the ID, and anyone can join and code together instantly.

---

## ✨ Features

- **Real-time collaboration** — Multiple users can edit the same code simultaneously via WebSockets
- **Multi-language support** — JavaScript, Python, C++, Java, HTML, and CSS
- **Code execution** — Run code directly in the browser (Standard and Docker sandbox modes)
- **Live HTML/CSS preview** — Instant visual preview for web files
- **File Explorer** — Create, rename, delete, and organize files in folders
- **Multiple editor tabs** — Open and switch between several files at once
- **Auto-save** — Changes are saved automatically every 30 seconds
- **User authentication** — Sign up / log in to persist your files securely
- **Dark theme** — Clean VS Code-inspired UI

---

## 🛠️ Tech Stack

| Layer    | Technology                              |
| -------- | --------------------------------------- |
| Frontend | React 17, CodeMirror 5, Socket.IO Client |
| Backend  | Node.js, Express, Socket.IO             |
| Database | MongoDB (with JSON file fallback)       |
| Auth     | JWT (JSON Web Tokens), bcrypt           |

---

## 🚀 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) v16 or higher
- [MongoDB](https://www.mongodb.com/) (optional — the app runs without it using a local file store)

### Installation

```bash
# 1. Clone the repository
git clone https://github.com/Sumayyamirza26/real-time-code-editor.git
cd real-time-code-editor

# 2. Install dependencies (backend + frontend)
npm run install:all
```

### Configuration

Copy the example env files and adjust values:

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
```

`backend/.env`:

```env
PORT=5000
MONGODB_URI=mongodb://127.0.0.1:27017/realtime-code-editor
JWT_SECRET=change_me_to_a_long_random_string
JWT_EXPIRES_IN=7d
FRONTEND_URL=http://localhost:3000,http://localhost:5000,http://localhost:5173
```

`frontend/.env`:

```env
REACT_APP_BACKEND_URL=http://localhost:5000
```

> **Note:** MongoDB is optional. If it is not running, the app automatically falls back to local JSON file storage. `JWT_SECRET` is required — the backend refuses to start without it. Running code (Run button / `/execute`) requires a logged-in user.

### Running the App

**Production mode** (builds the frontend and starts the server):

```bash
npm start
```

Then open [http://localhost:5000](http://localhost:5000) in your browser.

**Development mode** (frontend dev server + backend separately):

```bash
# Terminal 1 — start the backend
npm run server:dev

# Terminal 2 — start the React frontend
npm run start:front
```

Frontend runs on `http://localhost:5173`, backend on `http://localhost:5000`.

---

## 📖 Usage

1. Open the app and **create a new room** or **enter an existing Room ID**.
2. Share the **Room ID** with collaborators — they join the same live session.
3. Select a language, write code, and click **Run Code** to execute it.
4. Log in to **save files**, manage them in the File Explorer, and use the **Live Preview** for HTML/CSS projects.

---

## 👩‍💻 Authors

|      Name         |               GitHub                  |               LinkedIn                |
| ----------------  | ------------------------------------- | ------------------------------------- |
| **Sumayya Mirza** | https://github.com/Sumayyamirza26     | https://linkedin.com/in/sumayya-mirza |
| **Syeda Ramsha**  |  https://github.com/ramsha1554        |       syedaramsha1554@gmail.com       |

---

## 📄 License

This project is for educational purposes. All rights reserved by the authors.

