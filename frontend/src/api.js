// Central base URL for backend HTTP calls.
// 1. If VITE_BACKEND_URL is set at build time, sanitize and use it.
// 2. If running on Vercel (*.vercel.app) without VITE_BACKEND_URL configured,
//    fall back to the deployed Render backend so authentication and socket calls don't return 405.
// 3. Otherwise (local development), keep relative ("") so the Vite dev proxy works.
const envUrl = (import.meta.env.VITE_BACKEND_URL || "").trim().replace(/\/+$/, "");
const getProductionFallback = () => {
  if (typeof window !== "undefined") {
    const host = window.location.hostname;
    if (host.endsWith(".vercel.app") || host === "real-time-code-editor-blond.vercel.app") {
      return "https://real-time-code-editor-jghh.onrender.com";
    }
  }
  return "";
};

export const API_BASE = envUrl || getProductionFallback();

export const apiUrl = (path) => {
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  return `${API_BASE}${cleanPath}`;
};

export const authHeaders = (extra = {}) => {
  const token = localStorage.getItem("token");
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...extra,
  };
};

export async function apiFetch(path, options = {}) {
  return fetch(apiUrl(path), {
    ...options,
    headers: { ...authHeaders(), ...(options.headers || {}) },
  });
}
