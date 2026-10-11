import { useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import toast from "react-hot-toast";
import { apiUrl } from "../api";

const Login = () => {
  const [formData, setFormData] = useState({
    email: "",
    password: "",
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    if (!formData.email || !formData.password) {
      setError("Please fill in both email and password.");
      return;
    }
    setError("");
    setLoading(true);
    try {
      const response = await axios.post(apiUrl("/api/auth/login"), formData);
      localStorage.setItem("token", response.data.token);
      localStorage.setItem("username", response.data.username);
      toast.success(`Welcome back, ${response.data.username}!`);
      navigate("/home");
    } catch (err) {
      const msg = err.response?.data?.message || "Login failed. Please check your credentials.";
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
      <div className="formWrapper">
        <img
          className="homePageLogo"
          src="/code-sync.png"
          alt="code-sync-logo"
        />
        <h4 className="mainLabel">Log in to your account</h4>
        <div className="inputGroup">
          <label className="srOnly" htmlFor="login-email">Email</label>
          <input
            id="login-email"
            type="email"
            className="inputBox"
            placeholder="EMAIL"
            name="email"
            value={formData.email}
            onChange={handleChange}
            onKeyUp={handleInputEnter}
            required
          />
          <label className="srOnly" htmlFor="login-password">Password</label>
          <input
            id="login-password"
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
            {loading ? "Logging in..." : "Log in"}
          </button>
          <span className="createInfo" style={{ marginTop: "16px", display: "block" }}>
            Don't have an account? &nbsp;
            <button
              type="button"
              onClick={() => navigate("/signup")}
              className="createNewBtn"
              style={{ cursor: "pointer", color: "var(--accent-green)" }}
            >
              Sign up
            </button>
          </span>
          <span className="createInfo" style={{ marginTop: "8px", display: "block" }}>
            Or continue as guest &nbsp;
            <button
              type="button"
              onClick={() => navigate("/home")}
              className="createNewBtn"
              style={{ cursor: "pointer", color: "var(--text-muted)" }}
            >
              Go to Home
            </button>
          </span>
        </div>
      </div>
    </div>
  );
};

export default Login;
