import React, { useState, useEffect } from "react";
import { v4 as uuidV4 } from "uuid";
import toast from "react-hot-toast";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "../api";

const Home = () => {
  const navigate = useNavigate();
  const [token, setToken] = useState(localStorage.getItem("token"));
  const [roomId, setRoomId] = useState("");
  const [username, setUsername] = useState(localStorage.getItem("username") || "");

  useEffect(() => {
    const storedToken = localStorage.getItem("token");
    if (storedToken) {
      apiFetch("/api/auth/me")
        .then((res) => {
          if (res.ok) return res.json();
          throw new Error("Session expired");
        })
        .then((user) => {
          if (user?.username) {
            setUsername(user.username);
            localStorage.setItem("username", user.username);
          }
        })
        .catch(() => {
          localStorage.removeItem("token");
          setToken(null);
        });
    }
  }, []);

  const createNewRoom = (e) => {
    e.preventDefault();
    const id = uuidV4();
    setRoomId(id);
    toast.success("Created a new room");
  };

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("username");
    localStorage.removeItem("lastRoomId");
    setToken(null);
    setUsername("");
    toast.success("Logged out successfully");
  };

  const joinRoom = () => {
    if (!roomId.trim() || !username.trim()) {
      toast.error("ROOM ID & username are required");
      return;
    }

    // Persist username and room for seamless refresh
    localStorage.setItem("username", username.trim());
    localStorage.setItem("lastRoomId", roomId.trim());

    // Redirect
    navigate(`/editor/${roomId.trim()}`, {
      state: {
        username: username.trim(),
      },
    });
  };

  const handleInputEnter = (e) => {
    if (e.key === "Enter") {
      joinRoom();
    }
  };

  return (
    <div className="homePageWrapper">
      <div className="formWrapper">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "15px" }}>
          <img
            className="homePageLogo"
            src="/code-sync.png"
            alt="code-sync-logo"
            style={{ marginBottom: 0, height: "45px" }}
          />
          {token ? (
            <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "12px", color: "var(--text-muted)" }}>
              <span>👤 <strong style={{ color: "var(--accent-green)" }}>{username || "User"}</strong></span>
              <button
                onClick={handleLogout}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "#ef4444",
                  cursor: "pointer",
                  fontSize: "12px",
                  padding: "2px 6px",
                  textDecoration: "underline",
                }}
              >
                Logout
              </button>
            </div>
          ) : (
            <div style={{ display: "flex", gap: "8px" }}>
              <button
                onClick={() => navigate("/login")}
                style={{
                  background: "var(--bg-tertiary)",
                  border: "1px solid var(--border-color)",
                  color: "var(--text-main)",
                  borderRadius: "4px",
                  padding: "4px 10px",
                  fontSize: "12px",
                  cursor: "pointer",
                }}
              >
                Log in
              </button>
              <button
                onClick={() => navigate("/signup")}
                style={{
                  background: "var(--accent-green)",
                  border: "none",
                  color: "#fff",
                  borderRadius: "4px",
                  padding: "4px 10px",
                  fontSize: "12px",
                  cursor: "pointer",
                }}
              >
                Sign up
              </button>
            </div>
          )}
        </div>

        <h4 className="mainLabel" style={{ marginBottom: "16px" }}>Paste invitation ROOM ID</h4>
        <div className="inputGroup">
          <input
            type="text"
            className="inputBox"
            placeholder="ROOM ID"
            onChange={(e) => setRoomId(e.target.value)}
            value={roomId}
            onKeyUp={handleInputEnter}
          />
          <input
            type="text"
            className="inputBox"
            placeholder="USERNAME"
            onChange={(e) => setUsername(e.target.value)}
            value={username}
            onKeyUp={handleInputEnter}
          />
          <button className="btn joinBtn" onClick={joinRoom} style={{ width: "100%", marginLeft: 0 }}>
            Join Room
          </button>
          <span className="createInfo" style={{ marginTop: "16px" }}>
            If you don't have an invite then create &nbsp;
            <button type="button" onClick={createNewRoom} className="createNewBtn">
              new room
            </button>
          </span>
          {!token && (
            <span style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "12px", textAlign: "center" }}>
              💡 Tip: <span style={{ color: "var(--accent-green)", cursor: "pointer" }} onClick={() => navigate("/login")}>Log in</span> to save files persistently across sessions.
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

export default Home;
