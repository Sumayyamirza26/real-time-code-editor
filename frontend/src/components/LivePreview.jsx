import React, { useState, useEffect, useRef } from "react";

export default function LivePreview({
  htmlContent,
  isOpen,
  onClose,
  width = 500,
  onResize,
}) {
  const [deviceMode, setDeviceMode] = useState("responsive"); // "responsive" | "desktop" | "tablet" | "mobile"
  const [activeTab, setActiveTab] = useState("preview"); // "preview" | "console"
  const [consoleLogs, setConsoleLogs] = useState([]);
  const [refreshKey, setRefreshKey] = useState(0);
  const isDraggingRef = useRef(false);

  // Listen for console logs and errors sent from the sandboxed iframe.
  // The iframe uses srcDoc (same origin) — ignore messages from anywhere else.
  useEffect(() => {
    const handleMessage = (e) => {
      if (e.origin !== window.location.origin) return;
      if (e.data && e.data.type === "preview-console") {
        const newLog = {
          id: Date.now() + Math.random(),
          time: new Date().toLocaleTimeString(),
          level: e.data.level || "log",
          message: e.data.message || "",
        };
        setConsoleLogs((prev) => [...prev.slice(-100), newLog]);
      }
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  const handleRefresh = () => {
    setRefreshKey((k) => k + 1);
  };

  const handlePopOut = () => {
    try {
      const blob = new Blob([htmlContent], { type: "text/html;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
      // Release the blob once the new tab has had a chance to load it
      setTimeout(() => URL.revokeObjectURL(url), 30000);
    } catch {
      const newWin = window.open("", "_blank");
      if (newWin) {
        newWin.document.open();
        newWin.document.write(htmlContent);
        newWin.document.close();
      }
    }
  };

  // Drag resizer
  const handlePointerDown = (e) => {
    isDraggingRef.current = true;
    document.addEventListener("pointermove", handlePointerMove);
    document.addEventListener("pointerup", handlePointerUp);
    e.target.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e) => {
    if (!isDraggingRef.current) return;
    const newWidth = window.innerWidth - e.clientX;
    const constrainedWidth = Math.max(280, Math.min(newWidth, window.innerWidth - 320));
    if (onResize) onResize(constrainedWidth);
  };

  const handlePointerUp = () => {
    isDraggingRef.current = false;
    document.removeEventListener("pointermove", handlePointerMove);
    document.removeEventListener("pointerup", handlePointerUp);
  };

  if (!isOpen) return null;

  const deviceWidths = {
    responsive: "100%",
    desktop: "1024px",
    tablet: "768px",
    mobile: "375px",
  };

  return (
    <div className="previewContainer" style={{ width: `${width}px` }}>
      {/* Resizer bar on left edge */}
      <div className="previewResizer" onPointerDown={handlePointerDown} />

      {/* Preview Header */}
      <div className="previewHeader">
        <div className="previewHeaderLeft">
          <span className="previewTitle">
            <span className="previewLiveDot" /> Live Preview
          </span>

          {/* View Tab Switcher: Preview | Console */}
          <div className="previewTabGroup">
            <button
              className={`previewTabBtn ${activeTab === "preview" ? "active" : ""}`}
              onClick={() => setActiveTab("preview")}
            >
              Preview
            </button>
            <button
              className={`previewTabBtn ${activeTab === "console" ? "active" : ""}`}
              onClick={() => setActiveTab("console")}
            >
              Console
              {consoleLogs.length > 0 && (
                <span className="consoleBadge">{consoleLogs.length}</span>
              )}
            </button>
          </div>
        </div>

        {/* Responsive Device Mode Toggles */}
        {activeTab === "preview" && (
          <div className="previewDeviceGroup">
            <button
              className={`deviceBtn ${deviceMode === "responsive" ? "active" : ""}`}
              onClick={() => setDeviceMode("responsive")}
              title="Responsive (100%)"
            >
              Fluid
            </button>
            <button
              className={`deviceBtn ${deviceMode === "desktop" ? "active" : ""}`}
              onClick={() => setDeviceMode("desktop")}
              title="Desktop (1024px)"
            >
              🖥️
            </button>
            <button
              className={`deviceBtn ${deviceMode === "tablet" ? "active" : ""}`}
              onClick={() => setDeviceMode("tablet")}
              title="Tablet (768px)"
            >
              📱
            </button>
            <button
              className={`deviceBtn ${deviceMode === "mobile" ? "active" : ""}`}
              onClick={() => setDeviceMode("mobile")}
              title="Mobile (375px)"
            >
              📲
            </button>
          </div>
        )}

        {/* Actions: Refresh, Pop out, Close */}
        <div className="previewActionsGroup">
          <button
            className="previewActionIconBtn"
            onClick={handleRefresh}
            title="Reload Preview"
          >
            ↻
          </button>
          <button
            className="previewActionIconBtn"
            onClick={handlePopOut}
            title="Open Preview in New Tab"
          >
            ↗
          </button>
          <button
            className="previewActionIconBtn closePreviewBtn"
            onClick={onClose}
            title="Close Preview"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Main Content: Iframe or Console */}
      <div className="previewBody">
        {activeTab === "preview" ? (
          <div className="iframeViewportWrap">
            <div
              className={`iframeFrameContainer ${deviceMode !== "responsive" ? "deviceFramed" : ""}`}
              style={{
                width: deviceWidths[deviceMode],
                maxWidth: "100%",
              }}
            >
              <iframe
                key={refreshKey}
                title="CodeSync Live Preview"
                srcDoc={htmlContent}
                sandbox="allow-scripts allow-modals allow-forms"
                className="previewIframe"
              />
            </div>
          </div>
        ) : (
          <div className="previewConsoleWrap">
            <div className="previewConsoleToolbar">
              <span className="consoleCountText">
                {consoleLogs.length} message{consoleLogs.length === 1 ? "" : "s"}
              </span>
              <button
                className="clearConsoleBtn"
                onClick={() => setConsoleLogs([])}
              >
                Clear Console
              </button>
            </div>
            <div className="consoleLogsList">
              {consoleLogs.length === 0 ? (
                <div className="consoleEmpty">No console logs yet. Use <code>console.log()</code> in your code.</div>
              ) : (
                consoleLogs.map((log) => (
                  <div key={log.id} className={`consoleLogItem level-${log.level}`}>
                    <span className="consoleLogTime">[{log.time}]</span>
                    <span className="consoleLogLevel">[{log.level.toUpperCase()}]</span>
                    <span className="consoleLogMsg">{log.message}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

