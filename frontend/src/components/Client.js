import React from 'react';

const hueFor = (name) => {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % 360;
};

const initialsFor = (name) =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w.charAt(0).toUpperCase())
    .join("") || "?";

const Client = ({ username }) => {
    const name = username || "Anonymous";
    return (
        <div className="client">
            <span
              aria-hidden="true"
              style={{
                width: 50,
                height: 50,
                borderRadius: 14,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                fontWeight: 700,
                fontSize: 18,
                color: "#fff",
                background: `hsl(${hueFor(name)} 55% 38%)`,
                flexShrink: 0,
              }}
            >
              {initialsFor(name)}
            </span>
            <span className="userName">{name}</span>
        </div>
    );
};

export default Client;
