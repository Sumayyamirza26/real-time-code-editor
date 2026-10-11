import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import toast from "react-hot-toast";

const Signup = () => {
  const [formData, setFormData] = useState({
    email: "",
    password: "",
    username: "",
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    if (!formData.username || !formData.email || !formData.password) {
      setError("All fields are required.");
      return;
    }
    setError("");
    setLoading(true);
    try {
      const response = await axios.post("/api/auth/signup", formData);
      localStorage.setItem("token", response.data.token);
      localStorage.setItem("username", response.data.username);
      toast.success(`Account created! Welcome, ${response.data.username}!`);
      navigate("/home");
    } catch (err) {
      const msg = err.response?.data?.message || "Signup failed. Please try again.";
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleInputEnter = (e) => {
    if (e.key === "Enter") {
      handleSubmit(e);
    }
  };

  return (
    <div className="homePageWrapper">
      <div className="formWrapper signupForm">
        <img
          className="homePageLogo"
          src="/code-sync.png"
          alt="code-sync-logo"
        />
        <h4 className="mainLabel">Create your account</h4>

        <div className="inputGroup">
          <input
            type="text"
            className="inputBox"
            placeholder="USERNAME"
            name="username"
            value={formData.username}
            onChange={handleChange}
            onKeyUp={handleInputEnter}
            required
          />

          <input
            type="email"
            className="inputBox"
            placeholder="EMAIL"
            name="email"
            value={formData.email}
            onChange={handleChange}
            onKeyUp={handleInputEnter}
            required
          />

          <input
            type="password"
            className="inputBox"
            placeholder="PASSWORD"
            name="password"
            value={formData.password}
            onChange={handleChange}
            onKeyUp={handleInputEnter}
            required
          />

          {error && (
            <div style={{ color: "#ef4444", fontSize: "0.85rem", marginBottom: "10px" }}>
              {error}
            </div>
          )}

          <button className="btn joinBtn" onClick={handleSubmit} disabled={loading} style={{ width: "100%", marginLeft: 0 }}>
            {loading ? "Creating account..." : "Sign up"}
          </button>

          <span className="createInfo" style={{ marginTop: "16px", display: "block" }}>
            Already have an account? &nbsp;
            <span
              onClick={() => navigate("/login")}
              className="createNewBtn"
              style={{ cursor: "pointer", color: "var(--accent-green)" }}
            >
              Log in
            </span>
          </span>
          <span className="createInfo" style={{ marginTop: "8px", display: "block" }}>
            Or continue as guest &nbsp;
            <span
              onClick={() => navigate("/home")}
              className="createNewBtn"
              style={{ cursor: "pointer", color: "var(--text-muted)" }}
            >
              Go to Home
            </span>
          </span>
        </div>
      </div>
    </div>
  );
};

export default Signup;
