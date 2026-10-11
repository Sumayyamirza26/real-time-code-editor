// Central base URL for backend HTTP calls.
// Relative by default so the CRA dev proxy and same-origin production both work;
// set REACT_APP_BACKEND_URL to talk to a backend on another origin.
export const API_BASE = process.env.REACT_APP_BACKEND_URL || "";

export const apiUrl = (path) => `${API_BASE}${path}`;

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
