import React, { useState, useRef, useEffect, useMemo, useCallback } from "react";
import toast from "react-hot-toast";
import axios from "axios";
import ACTIONS from "../Actions";
import Client from "../components/Client";
import Editor from "../components/Editor";
import FileExplorer from "../components/FileExplorer";
import LivePreview from "../components/LivePreview";
import { buildPreviewHtml } from "../utils/previewBuilder";
import { initSocket } from "../socket";
import {
  useLocation,
  useNavigate,
  Navigate,
  useParams,
} from "react-router-dom";

const languages = [
  { value: "javascript", label: "JavaScript", ext: "js", icon: "🟨" },
  { value: "python", label: "Python", ext: "py", icon: "🐍" },
  { value: "cpp", label: "C++", ext: "cpp", icon: "⚙️" },
  { value: "java", label: "Java", ext: "java", icon: "☕" },
  { value: "html", label: "HTML", ext: "html", icon: "🌐" },
  { value: "css", label: "CSS", ext: "css", icon: "🎨" },
];

const AUTO_SAVE_DELAY = 30000; // 30 seconds

const EditorPage = () => {
  const socketRef = useRef(null);
  const codeRef = useRef(null);
  const connectFailedRef = useRef(false);
  const editorInstanceRef = useRef(null);
  const autoSaveTimerRef = useRef(null);
  const location = useLocation();
  const { roomId } = useParams();
  const reactNavigator = useNavigate();

  // Resolved user identity (supports refresh from localStorage)
  const stateUsername = location.state?.username;
  const currentUsername = useMemo(
    () => stateUsername || localStorage.getItem("username") || "",
    [stateUsername]
  );

  // Auth state
  const [authToken, setAuthToken] = useState(localStorage.getItem("token"));
  const [authUsername, setAuthUsername] = useState(localStorage.getItem("username") || currentUsername);

  // Editor & Terminal state
  const [socket, setSocket] = useState(null);
  const [clients, setClients] = useState([]);
  const [terminalOutput, setTerminalOutput] = useState([]);
  const [selectedLanguage, setSelectedLanguage] = useState("javascript");
  const [terminalInput, setTerminalInput] = useState("");
  const [terminalHeight, setTerminalHeight] = useState(200);
  const [isTerminalMaximized, setIsTerminalMaximized] = useState(false);
  const [isTerminalCollapsed, setIsTerminalCollapsed] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const [runMode, setRunMode] = useState("standard");
  const [editorSettings, setEditorSettings] = useState({ fontSize: 14, wordWrap: true, minimap: false });
  const [showSettings, setShowSettings] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const settingsRef = useRef(null);
  const userMenuRef = useRef(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // Save Modal state
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [saveModalName, setSaveModalName] = useState("");
  const [saveModalError, setSaveModalError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  // Inline Auth Modal state (when user clicks Save but is not logged in)
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authTab, setAuthTab] = useState("login"); // "login" | "signup"
  const [authForm, setAuthForm] = useState({ email: "", password: "", username: "" });
  const [authError, setAuthError] = useState("");
  const [authLoading, setAuthLoading] = useState(false);

  // Unsaved changes tracking
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [autoSaveStatus, setAutoSaveStatus] = useState(""); // "", "saving", "saved"
  const [currentFileName, setCurrentFileName] = useState(null);
  const [currentFileId, setCurrentFileId] = useState(null);

  // Editor Tabs state
  const [openTabs, setOpenTabs] = useState([
    { id: "scratch", name: "untitled.js", language: "javascript", code: "", dirty: false, folderId: null }
  ]);
  const [activeTabId, setActiveTabId] = useState("scratch");
  const activeTabIdRef = useRef("scratch");
  useEffect(() => {
    activeTabIdRef.current = activeTabId;
  });

  // Live Preview state
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [previewWidth, setPreviewWidth] = useState(520);
  const [projectFiles, setProjectFiles] = useState([]);
  const [projectFolders, setProjectFolders] = useState([]);
  const [previewTrigger, setPreviewTrigger] = useState(0);

  const previewHtml = useMemo(() => {
    if (!isPreviewOpen) return "";
    return buildPreviewHtml({
      activeCode: codeRef.current || "",
      activeLanguage: selectedLanguage,
      activeFileName: currentFileName,
      openTabs,
      savedFiles: projectFiles,
      folders: projectFolders,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPreviewOpen, previewTrigger, selectedLanguage, currentFileName, openTabs, projectFiles, projectFolders]);

  const handleFilesUpdate = useCallback(({ folders, files }) => {
    setProjectFolders(folders);
    setProjectFiles(files);

    if (!Array.isArray(files)) return;
    const validFileIds = new Set(files.map((f) => f._id));

    // Find stale open tabs — tabs whose file was deleted from the backend
    setOpenTabs((prev) => {
      const staleTabs = prev.filter((t) => t.id !== "scratch" && !validFileIds.has(t.id));
      if (staleTabs.length === 0) return prev; // nothing to remove, bail early

      // Cancel pending auto-save since the file may no longer exist
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
        autoSaveTimerRef.current = null;
      }

      const remaining = prev.filter((t) => t.id === "scratch" || validFileIds.has(t.id));
      return remaining.length > 0 ? remaining : [{
        id: "scratch",
        name: "untitled.js",
        language: "javascript",
        code: "",
        dirty: false,
        folderId: null,
      }];
    });

    // Separately fix active tab if needed (outside the setOpenTabs updater to avoid side-effects in updater)
    setActiveTabId((currActive) => {
      if (currActive === "scratch" || validFileIds.has(currActive)) return currActive;
      // Active tab was for a deleted file — reset to scratch
      setCurrentFileId(null);
      setCurrentFileName(null);
      setHasUnsavedChanges(false);
      codeRef.current = "";
      setSelectedLanguage("javascript");
      if (editorInstanceRef.current) {
        editorInstanceRef.current.setValue("");
      }
      return "scratch";
    });
  }, []);

  const handleFileDelete = useCallback((fileId) => {
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = null;
    }

    setOpenTabs((prev) => {
      const remaining = prev.filter((t) => t.id !== fileId);
      if (remaining.length === prev.length) return prev;

      setActiveTabId((currActive) => {
        if (currActive === fileId) {
          if (remaining.length > 0) {
            const nextTab = remaining[remaining.length - 1];
            setCurrentFileId(nextTab.id === "scratch" ? null : nextTab.id);
            setCurrentFileName(nextTab.id === "scratch" ? null : nextTab.name);
            setHasUnsavedChanges(!!nextTab.dirty);
            if (editorInstanceRef.current) {
              editorInstanceRef.current.setValue(nextTab.code || "");
            }
            codeRef.current = nextTab.code || "";
            if (nextTab.language) {
              setSelectedLanguage(nextTab.language);
              if (socketRef.current) {
                socketRef.current.emit(ACTIONS.LANGUAGE_CHANGE, { roomId, language: nextTab.language });
              }
            }
            return nextTab.id;
          } else {
            setCurrentFileId(null);
            setCurrentFileName(null);
            setHasUnsavedChanges(false);
            if (editorInstanceRef.current) {
              editorInstanceRef.current.setValue("");
            }
            codeRef.current = "";
            setSelectedLanguage("javascript");
            return "scratch";
          }
        }
        return currActive;
      });

      return remaining.length > 0 ? remaining : [{
        id: "scratch",
        name: "untitled.js",
        language: "javascript",
        code: "",
        dirty: false,
        folderId: null,
      }];
    });
  }, [roomId]);

  const handleFolderDelete = useCallback((folderId, deletedFolderIds) => {
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = null;
    }
    const folderIdsSet = new Set(deletedFolderIds || [folderId]);

    setOpenTabs((prev) => {
      const tabsInDeletedFolder = prev.filter((t) => folderIdsSet.has(t.folderId));
      if (tabsInDeletedFolder.length === 0) return prev;

      const remaining = prev.filter((t) => !folderIdsSet.has(t.folderId));

      setActiveTabId((currActive) => {
        const activeWasDeleted = tabsInDeletedFolder.some((t) => t.id === currActive);
        if (activeWasDeleted) {
          if (remaining.length > 0) {
            const nextTab = remaining[remaining.length - 1];
            setCurrentFileId(nextTab.id === "scratch" ? null : nextTab.id);
            setCurrentFileName(nextTab.id === "scratch" ? null : nextTab.name);
            setHasUnsavedChanges(!!nextTab.dirty);
            if (editorInstanceRef.current) {
              editorInstanceRef.current.setValue(nextTab.code || "");
            }
            codeRef.current = nextTab.code || "";
            if (nextTab.language) {
              setSelectedLanguage(nextTab.language);
              if (socketRef.current) {
                socketRef.current.emit(ACTIONS.LANGUAGE_CHANGE, { roomId, language: nextTab.language });
              }
            }
            return nextTab.id;
          } else {
            setCurrentFileId(null);
            setCurrentFileName(null);
            setHasUnsavedChanges(false);
            if (editorInstanceRef.current) {
              editorInstanceRef.current.setValue("");
            }
            codeRef.current = "";
            setSelectedLanguage("javascript");
            return "scratch";
          }
        }
        return currActive;
      });

      return remaining.length > 0 ? remaining : [{
        id: "scratch",
        name: "untitled.js",
        language: "javascript",
        code: "",
        dirty: false,
        folderId: null,
      }];
    });
  }, [roomId]);

  const handleFileRename = useCallback((fileId, newName) => {
    setOpenTabs((prev) =>
      prev.map((t) => (t.id === fileId ? { ...t, name: newName } : t))
    );
    setActiveTabId((currActive) => {
      if (currActive === fileId) {
        setCurrentFileName(newName);
      }
      return currActive;
    });
  }, []);

  const isDraggingRef = useRef(false);

  // ── Verify auth token on mount ────────────────────────────────────────────
  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) return;
    fetch("/api/auth/me", {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => {
        if (res.ok) return res.json();
        throw new Error("Invalid session");
      })
      .then((data) => {
        if (data.username) {
          setAuthUsername(data.username);
          localStorage.setItem("username", data.username);
        }
      })
      .catch(() => {
        // Token expired/invalid
        localStorage.removeItem("token");
        setAuthToken(null);
      });
  }, []);

  // ── Auto-save ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!hasUnsavedChanges || !currentFileName || !authToken) return;
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(() => {
      performSave(currentFileName, false);
    }, AUTO_SAVE_DELAY);
    return () => clearTimeout(autoSaveTimerRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasUnsavedChanges, currentFileName, authToken]);

  // ── Unsaved-changes warning on tab/window close ───────────────────────────
  useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [hasUnsavedChanges]);

  // ── Ctrl+S global shortcut ────────────────────────────────────────────────
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        handleSaveFileClick();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentFileName, authToken]);

  // ── Terminal resize ───────────────────────────────────────────────────────
  const handlePointerDown = (e) => {
    isDraggingRef.current = true;
    document.addEventListener("pointermove", handlePointerMove);
    document.addEventListener("pointerup", handlePointerUp);
    e.target.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e) => {
    if (!isDraggingRef.current) return;
    const newHeight = window.innerHeight - e.clientY;
    const constrainedHeight = Math.max(80, Math.min(newHeight, window.innerHeight - 180));
    setTerminalHeight(constrainedHeight);
    if (isTerminalCollapsed) setIsTerminalCollapsed(false);
    if (isTerminalMaximized) setIsTerminalMaximized(false);
    if (editorInstanceRef.current) editorInstanceRef.current.refresh();
  };

  const handlePointerUp = () => {
    isDraggingRef.current = false;
    document.removeEventListener("pointermove", handlePointerMove);
    document.removeEventListener("pointerup", handlePointerUp);
  };

  // ── Socket setup ──────────────────────────────────────────────────────────
  useEffect(() => {
    let s = null;
    let onReconnect = null;

    const init = async () => {
      s = await initSocket();
      socketRef.current = s;
      setSocket(s);

      const joinRoom = () => {
        if (!s) return;
        s.emit(ACTIONS.JOIN, {
          roomId,
          username: currentUsername || "User",
          token: localStorage.getItem("token") || undefined,
        });
      };

      s.on("connect", () => {
        connectFailedRef.current = false;
        joinRoom();
      });
      if (s.connected) joinRoom();

      // Toast only the first failure per outage — retries stay silent
      s.on("connect_error", () => {
        if (!connectFailedRef.current) {
          connectFailedRef.current = true;
          toast.error("Could not reach the server. Retrying…");
        }
      });
      // Reconnect events fire on the manager (s.io), not the socket, in v4 clients
      onReconnect = () => {
        toast.success("Reconnected to room");
        joinRoom();
      };
      if (s.io && typeof s.io.on === "function") s.io.on("reconnect", onReconnect);
      s.on("error", (err) => {
        if (err?.message) toast.error(err.message);
      });

      s.on(ACTIONS.JOINED, ({ clients, username, socketId }) => {
        if (username !== currentUsername) {
          toast.success(`${username} joined the room.`);
        }
        setClients(clients);
        // Only existing members answer — the newcomer must not echo its own (empty) code back
        if (socketId && socketId !== s.id) {
          s.emit(ACTIONS.SYNC_CODE, { code: codeRef.current, socketId });
        }
      });

      // Apply a collaborator's language switch to the active tab (never re-emitted)
      s.on(ACTIONS.LANGUAGE_CHANGE, ({ language }) => {
        if (!language) return;
        setSelectedLanguage(language);
        const tabId = activeTabIdRef.current;
        setOpenTabs((prev) => prev.map((t) => (t.id === tabId ? { ...t, language } : t)));
      });

      s.on(ACTIONS.DISCONNECTED, ({ socketId, username }) => {
        if (username) toast.success(`${username} left the room.`);
        setClients((prev) => prev.filter((c) => c.socketId !== socketId));
      });

      s.on(ACTIONS.CODE_RESULT, ({ result, error }) => {
        setIsExecuting(false);
        const ts = new Date().toLocaleTimeString();
        if (error) {
          setTerminalOutput((p) => [...p, `\n── Execution failed [${ts}] ──`]);
          toast.error("Execution failed — see terminal for details.");
        } else {
          setTerminalOutput((p) => [...p, `\n── Done [${ts}] ──`]);
          toast.success("Code executed successfully.");
        }
      });

      s.on(ACTIONS.DOCKER_CODE_RESULT, ({ result, error }) => {
        setIsExecuting(false);
        const ts = new Date().toLocaleTimeString();
        if (error) {
          setTerminalOutput((p) => [...p, `\n── Docker execution failed [${ts}] ──`]);
          toast.error("Docker execution failed — see terminal for details.");
        } else {
          setTerminalOutput((p) => [...p, `\n── Docker done [${ts}] ──`]);
          toast.success("Docker code executed successfully.");
        }
      });

      // Stream output/stderr chunks directly — do NOT trim so newlines are preserved
      s.on(ACTIONS.TERMINAL_OUTPUT, ({ output }) => {
        setTerminalOutput((p) => [...p, output]);
      });
    };

    init();

    return () => {
      if (s) {
        if (s.io && typeof s.io.off === "function" && onReconnect) s.io.off("reconnect", onReconnect);
        s.disconnect();
        [
          "connect",
          "connect_error",
          "error",
          ACTIONS.JOINED,
          ACTIONS.DISCONNECTED,
          ACTIONS.CODE_RESULT,
          ACTIONS.DOCKER_CODE_RESULT,
          ACTIONS.TERMINAL_OUTPUT,
          ACTIONS.LANGUAGE_CHANGE,
        ].forEach((ev) => s.off(ev));
      }
    };
  }, [roomId, currentUsername]);

  // ── Helpers ───────────────────────────────────────────────────────────────
  async function copyRoomId() {
    try {
      await navigator.clipboard.writeText(roomId);
      toast.success("Room ID copied to clipboard");
    } catch {
      toast.error("Could not copy the Room ID");
    }
  }

  function leaveRoom() {
    if (hasUnsavedChanges) {
      if (!window.confirm("You have unsaved changes. Leave anyway?")) return;
    }
    reactNavigator("/");
  }

  const handleExecute = () => {
    if (selectedLanguage === "html" || selectedLanguage === "css") {
      setIsPreviewOpen(true);
      setPreviewTrigger((p) => p + 1);
      toast.success("Live Preview updated");
      return;
    }
    if (isExecuting) return;
    setIsExecuting(true);
    if (isTerminalCollapsed) setIsTerminalCollapsed(false);
    // Clear previous output and show a header line for the new run
    const ts = new Date().toLocaleTimeString();
    setTerminalOutput([`── Running ${selectedLanguage.toUpperCase()} [${ts}] ──\n`]);
    const action = runMode === "standard" ? ACTIONS.RUN_CODE : ACTIONS.DOCKER_RUN_CODE;
    const payload = {
      roomId,
      code: codeRef.current,
      language: selectedLanguage,
      token: localStorage.getItem("token") || undefined,
    };
    if (socketRef.current) socketRef.current.emit(action, payload);
  };

  function handleLanguageChange(e) {
    const newLanguage = e.target.value;
    setSelectedLanguage(newLanguage);
    setOpenTabs((prev) =>
      prev.map((t) => (t.id === activeTabId ? { ...t, language: newLanguage } : t))
    );
    if (socketRef.current) {
      socketRef.current.emit(ACTIONS.LANGUAGE_CHANGE, { roomId, language: newLanguage });
    }
  }

  function handleTerminalInput(e) {
    if (e.key === "Enter") {
      if (socketRef.current) {
        socketRef.current.emit(ACTIONS.TERMINAL_INPUT, { roomId, input: terminalInput });
      }
      setTerminalInput("");
    }
  }

  function clearTerminal() {
    setTerminalOutput([]);
  }

  const handleLogout = () => {
    localStorage.removeItem("token");
    setAuthToken(null);
    setShowUserMenu(false);
    toast.success("Logged out successfully");
  };

  // ── Click outside handler for popovers ────────────────────────────────────
  useEffect(() => {
    const handleDocumentClick = (e) => {
      if (settingsRef.current && !settingsRef.current.contains(e.target)) {
        setShowSettings(false);
      }
      if (userMenuRef.current && !userMenuRef.current.contains(e.target)) {
        setShowUserMenu(false);
      }
    };
    document.addEventListener("mousedown", handleDocumentClick);
    return () => document.removeEventListener("mousedown", handleDocumentClick);
  }, []);

  // ── Save logic ────────────────────────────────────────────────────────────
  const getLangExt = (lang) => languages.find((l) => l.value === lang)?.ext || "txt";

  function handleSaveFileClick() {
    const token = localStorage.getItem("token");
    if (!token) {
      setAuthError("");
      setShowAuthModal(true);
      return;
    }
    if (currentFileName) {
      performSave(currentFileName, true);
    } else {
      openSaveModal();
    }
  }

  function openSaveModal() {
    const defaultName = currentFileName || `untitled.${getLangExt(selectedLanguage)}`;
    setSaveModalName(defaultName);
    setSaveModalError("");
    setShowSaveModal(true);
  }

  async function performSave(name, showSuccessToast = true) {
    const token = localStorage.getItem("token");
    if (!token) {
      toast.error("Please log in to save files.");
      setShowAuthModal(true);
      return false;
    }
    setAutoSaveStatus("saving");
    setIsSaving(true);
    try {
      const activeTab = openTabs.find((t) => t.id === activeTabId);
      const folderId = activeTab?.folderId || null;

      const response = await fetch("/api/files/save-file", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name,
          code: codeRef.current,
          language: selectedLanguage,
          folderId,
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (response.ok) {
        const savedFile = body.file;
        const newId = savedFile?._id || currentFileId;
        setCurrentFileName(name);
        if (newId) setCurrentFileId(newId);
        setHasUnsavedChanges(false);
        setAutoSaveStatus("saved");
        if (showSuccessToast) toast.success(`Saved as "${name}"`);

        setOpenTabs((prev) =>
          prev.map((t) =>
            t.id === activeTabId
              ? {
                  ...t,
                  id: newId || t.id,
                  name,
                  language: selectedLanguage,
                  code: codeRef.current,
                  dirty: false,
                  folderId: savedFile?.folderId || t.folderId,
                }
              : t
          )
        );
        if (newId && activeTabId !== newId) {
          setActiveTabId(newId);
        }

        if (socketRef.current) {
          socketRef.current.emit(ACTIONS.FILE_EXPLORER_REFRESH, { roomId });
        }

        setTimeout(() => setAutoSaveStatus(""), 3000);
        return true;
      } else {
        setAutoSaveStatus("");
        if (response.status === 401) {
          localStorage.removeItem("token");
          setAuthToken(null);
          toast.error("Session expired. Please log in again.");
          setShowAuthModal(true);
          return false;
        }
        const msg = body.error || body.message || "Failed to save file";
        if (showSuccessToast) toast.error(msg);
        return false;
      }
    } catch {
      setAutoSaveStatus("");
      if (showSuccessToast) toast.error("Network error — could not reach server");
      return false;
    } finally {
      setIsSaving(false);
    }
  }

  async function handleSaveModalConfirm() {
    const name = saveModalName.trim();
    if (!name) {
      setSaveModalError("File name cannot be empty.");
      return;
    }
    const ok = await performSave(name, true);
    if (ok) setShowSaveModal(false);
  }

  // ── Inline Auth Modal submission ──────────────────────────────────────────
  async function handleAuthSubmit(e) {
    if (e) e.preventDefault();
    setAuthError("");
    setAuthLoading(true);
    const endpoint = authTab === "login" ? "/api/auth/login" : "/api/auth/signup";
    try {
      const res = await axios.post(endpoint, authForm);
      const { token, username } = res.data;
      localStorage.setItem("token", token);
      localStorage.setItem("username", username);
      setAuthToken(token);
      setAuthUsername(username);
      toast.success(authTab === "login" ? `Welcome back, ${username}!` : `Account created! Welcome, ${username}!`);
      setShowAuthModal(false);
      // Automatically open the save modal after successful login
      openSaveModal();
    } catch (err) {
      const msg = err.response?.data?.message || `${authTab === "login" ? "Login" : "Sign up"} failed.`;
      setAuthError(msg);
    } finally {
      setAuthLoading(false);
    }
  }

  // ── Tab Management ────────────────────────────────────────────────────────
  function handleSelectTab(tabId) {
    if (tabId === activeTabId) return;

    setOpenTabs((prev) => {
      const updated = prev.map((t) =>
        t.id === activeTabId ? { ...t, code: codeRef.current } : t
      );
      const target = updated.find((t) => t.id === tabId);
      if (target) {
        setActiveTabId(target.id);
        setCurrentFileId(target.id === "scratch" ? null : target.id);
        setCurrentFileName(target.id === "scratch" ? null : target.name);
        setHasUnsavedChanges(!!target.dirty);

        if (editorInstanceRef.current) {
          editorInstanceRef.current.setValue(target.code || "");
        }
        codeRef.current = target.code || "";
        if (socketRef.current) {
          socketRef.current.emit(ACTIONS.CODE_CHANGE, { roomId, code: target.code || "" });
        }
        if (target.language) {
          setSelectedLanguage(target.language);
          if (socketRef.current) {
            socketRef.current.emit(ACTIONS.LANGUAGE_CHANGE, { roomId, language: target.language });
          }
        }
      }
      return updated;
    });
  }

  function handleCloseTab(tabId, e) {
    if (e) e.stopPropagation();
    const tabToClose = openTabs.find((t) => t.id === tabId);
    if (tabToClose && tabToClose.dirty) {
      if (!window.confirm(`"${tabToClose.name}" has unsaved changes. Close anyway?`)) {
        return;
      }
    }

    const remaining = openTabs.filter((t) => t.id !== tabId);
    setOpenTabs(remaining);

    if (activeTabId === tabId) {
      if (remaining.length > 0) {
        const nextTab = remaining[remaining.length - 1];
        setActiveTabId(nextTab.id);
        setCurrentFileId(nextTab.id === "scratch" ? null : nextTab.id);
        setCurrentFileName(nextTab.id === "scratch" ? null : nextTab.name);
        setHasUnsavedChanges(!!nextTab.dirty);
        if (editorInstanceRef.current) {
          editorInstanceRef.current.setValue(nextTab.code || "");
        }
        codeRef.current = nextTab.code || "";
        if (nextTab.language) {
          setSelectedLanguage(nextTab.language);
          if (socketRef.current) {
            socketRef.current.emit(ACTIONS.LANGUAGE_CHANGE, { roomId, language: nextTab.language });
          }
        }
      } else {
        const defaultScratch = {
          id: "scratch",
          name: "untitled.js",
          language: "javascript",
          code: "",
          dirty: false,
          folderId: null,
        };
        setOpenTabs([defaultScratch]);
        setActiveTabId("scratch");
        setCurrentFileId(null);
        setCurrentFileName(null);
        setHasUnsavedChanges(false);
        if (editorInstanceRef.current) {
          editorInstanceRef.current.setValue("");
        }
        codeRef.current = "";
        setSelectedLanguage("javascript");
      }
    }
  }

  // ── File explorer actions ─────────────────────────────────────────────────
  async function handleLoadFile(fileId) {
    const token = localStorage.getItem("token");
    if (!token) {
      toast.error("Please log in to load files.");
      setShowAuthModal(true);
      return;
    }
    try {
      const response = await fetch(`/api/files/file/${fileId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const file = await response.json();
      if (!response.ok) {
        toast.error(file.error || file.message || "Failed to load file");
        return;
      }

      setOpenTabs((prev) => {
        const existing = prev.find((t) => t.id === file._id);
        if (existing) {
          return prev;
        }
        if (prev.length === 1 && prev[0].id === "scratch" && !prev[0].dirty && !prev[0].code) {
          return [
            {
              id: file._id,
              name: file.name,
              language: file.language || "javascript",
              code: file.code || "",
              dirty: false,
              folderId: file.folderId || null,
            },
          ];
        }
        return [
          ...prev,
          {
            id: file._id,
            name: file.name,
            language: file.language || "javascript",
            code: file.code || "",
            dirty: false,
            folderId: file.folderId || null,
          },
        ];
      });

      setActiveTabId(file._id);
      setCurrentFileId(file._id);
      setCurrentFileName(file.name);
      setHasUnsavedChanges(false);

      if (editorInstanceRef.current) {
        editorInstanceRef.current.setValue(file.code || "");
      }
      codeRef.current = file.code || "";
      if (socketRef.current) {
        socketRef.current.emit(ACTIONS.CODE_CHANGE, { roomId, code: file.code || "" });
      }
      if (file.language) {
        setSelectedLanguage(file.language);
        if (socketRef.current) {
          socketRef.current.emit(ACTIONS.LANGUAGE_CHANGE, { roomId, language: file.language });
        }
      }
      setIsSidebarOpen(false);
      toast.success(`Loaded "${file.name}"`);
    } catch {
      toast.error("Error loading file");
    }
  }

  async function handleDownloadFileById(fileId) {
    const token = localStorage.getItem("token");
    try {
      const res = await fetch(`/api/files/file/${fileId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const file = await res.json();
      if (res.ok) {
        handleDownloadFile(file);
      } else {
        toast.error("Failed to download file");
      }
    } catch {
      toast.error("Download failed");
    }
  }

  function handleDownloadFile(file) {
    const blob = new Blob([file.code || ""], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = file.name;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Downloaded ${file.name}`);
  }

  // ── Early return if not in room or missing identity ───────────────────────
  if (!currentUsername) {
    return <Navigate to="/" />;
  }

  const langInfo = languages.find((l) => l.value === selectedLanguage);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="mainWrap">
      {/* ── SIDEBAR ─────────────────────────────────────────────────────── */}
      <div className={`aside ${isSidebarOpen ? "open" : ""}`}>
        <div className="asideInner">
          <div className="logo">
            <img className="logoImage" src="/code-sync.png" alt="logo" />
          </div>

          <h3 className="asideTitle">Connected ({clients.length})</h3>
          <div className="clientsList">
            {clients.map((client) => (
              <Client key={client.socketId} username={client.username} />
            ))}
          </div>

          <h3 className="asideTitle" style={{ marginTop: "20px" }}>
            File Explorer
          </h3>
          <FileExplorer
            authToken={authToken}
            activeFileId={activeTabId}
            unsavedFileIds={new Set(openTabs.filter((t) => t.dirty).map((t) => t.id))}
            onFileOpen={handleLoadFile}
            onAuthRequired={() => setShowAuthModal(true)}
            onDownload={handleDownloadFileById}
            socket={socket}
            roomId={roomId}
            onFilesUpdate={handleFilesUpdate}
            onFileDelete={handleFileDelete}
            onFolderDelete={handleFolderDelete}
            onFileRename={handleFileRename}
          />
        </div>

        <button className="btn copyBtn" onClick={copyRoomId} title="Copy Room ID">
          Copy ROOM ID
        </button>
        <button className="btn leaveBtn" onClick={leaveRoom}>
          Leave
        </button>
      </div>

      {/* ── EDITOR AREA ─────────────────────────────────────────────────── */}
      <div className="editorWrap">
        <div className="editorHeader">
          {/* Left: Mobile hamburger + Language selector */}
          <div className="toolbarSection toolbarSectionLeft">
            <button
              className="toolbarHamburgerBtn"
              style={{ display: window.innerWidth <= 768 ? "flex" : "none" }}
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              title="Toggle sidebar"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            </button>

            <div className="toolbarSelectWrapper">
              <select
                value={selectedLanguage}
                onChange={handleLanguageChange}
                className="toolbarSelect"
                title="Select programming language"
              >
                {languages.map((lang) => (
                  <option key={lang.value} value={lang.value}>
                    {lang.icon} {lang.label}
                  </option>
                ))}
              </select>
              <svg className="toolbarSelectChevron" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </div>
          </div>

          {/* Center: Split Run Button (Run Code + Environment Select) or Live Preview */}
          <div className="toolbarSection toolbarSectionCenter">
            {selectedLanguage === "html" || selectedLanguage === "css" ? (
              <button
                className="runMainBtn previewRunBtn"
                onClick={() => {
                  setIsPreviewOpen(true);
                  setPreviewTrigger((p) => p + 1);
                  toast.success("Live Preview updated");
                }}
                title="Open Live Preview"
                style={{ padding: "0 16px" }}
              >
                <span>🌐</span>
                <span>Live Preview</span>
              </button>
            ) : (
              <div className="splitRunGroup">
                <button
                  className="runMainBtn"
                  onClick={handleExecute}
                  disabled={isExecuting}
                  title={isExecuting ? "Executing code..." : "Run Code"}
                >
                  {isExecuting ? (
                    <span className="runSpinner" />
                  ) : (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M8 5v14l11-7z" />
                    </svg>
                  )}
                  <span>{isExecuting ? "Running…" : "Run Code"}</span>
                </button>
                <div className="runDropdownWrapper">
                  <select
                    value={runMode}
                    onChange={(e) => setRunMode(e.target.value)}
                    className="runModeSelect"
                    title="Execution environment"
                  >
                    <option value="standard">Standard Run</option>
                    <option value="docker">Docker Sandbox</option>
                  </select>
                  <svg className="runChevron" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </div>
              </div>
            )}

            <button
              className={`toolbarPreviewBtn ${isPreviewOpen ? "active" : ""}`}
              onClick={() => {
                setIsPreviewOpen(!isPreviewOpen);
                setPreviewTrigger((p) => p + 1);
              }}
              title={isPreviewOpen ? "Hide Live Preview" : "Show Live Preview"}
            >
              <span>🌐</span>
              <span>{isPreviewOpen ? "Hide Preview" : "Preview"}</span>
            </button>
          </div>

          {/* Right: Unsaved status + Save Button + Settings + User Menu */}
          <div className="toolbarSection toolbarSectionRight">
            {hasUnsavedChanges && (
              <span className="unsavedIndicator" title="Unsaved changes">
                <span className="unsavedDot" />
              </span>
            )}
            {autoSaveStatus === "saving" && <span className="autoSaveTag saving">Saving…</span>}
            {autoSaveStatus === "saved" && <span className="autoSaveTag saved">✓ Saved</span>}

            <button
              className="toolbarSaveBtn"
              onClick={handleSaveFileClick}
              disabled={isSaving}
              title={currentFileName ? `Save ${currentFileName} (Ctrl+S)` : "Save File (Ctrl+S)"}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                <polyline points="17 21 17 13 7 13 7 21" />
                <polyline points="7 3 7 8 15 8" />
              </svg>
              <span>{isSaving ? "Saving…" : currentFileName ? `Save (${currentFileName})` : "Save File"}</span>
            </button>

            {/* Settings button with tooltip & popover */}
            <div className="toolbarPopoverWrapper" ref={settingsRef}>
              <button
                className={`toolbarIconBtn ${showSettings ? "active" : ""}`}
                onClick={() => setShowSettings(!showSettings)}
                title="Editor Settings"
                aria-label="Editor Settings"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1 0-2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
                </svg>
              </button>
              {showSettings && (
                <div className="settingsDropdown popoverCard">
                  <h4 style={{ margin: "0 0 14px 0", borderBottom: "1px solid var(--border-color)", paddingBottom: "8px", fontSize: "13px", fontWeight: "600" }}>
                    Editor Settings
                  </h4>
                  <div className="settingsRow">
                    <span>Font Size</span>
                    <input
                      type="number"
                      value={editorSettings.fontSize}
                      onChange={(e) => setEditorSettings({ ...editorSettings, fontSize: parseInt(e.target.value) || 14 })}
                      style={{ width: "54px", background: "var(--bg-tertiary)", color: "var(--text-main)", border: "1px solid var(--border-color)", borderRadius: "4px", padding: "4px 6px", fontSize: "12px" }}
                      min="10" max="30"
                    />
                  </div>
                  <div className="settingsRow">
                    <span>Word Wrap</span>
                    <input type="checkbox" checked={editorSettings.wordWrap} onChange={(e) => setEditorSettings({ ...editorSettings, wordWrap: e.target.checked })} />
                  </div>
                  <div className="settingsRow" title="Minimap (Requires WebGL/Advanced Addon)">
                    <span>Minimap</span>
                    <input type="checkbox" checked={editorSettings.minimap} onChange={(e) => setEditorSettings({ ...editorSettings, minimap: e.target.checked })} />
                  </div>
                </div>
              )}
            </div>

            {/* Compact User Menu */}
            {authToken ? (
              <div className="toolbarPopoverWrapper" ref={userMenuRef}>
                <button
                  className={`userMenuPill ${showUserMenu ? "active" : ""}`}
                  onClick={() => setShowUserMenu(!showUserMenu)}
                  title={`Signed in as ${authUsername}`}
                >
                  <span className="userAvatar">
                    {(authUsername || "U").charAt(0).toUpperCase()}
                  </span>
                  <span className="userMenuName">{authUsername || "User"}</span>
                  <svg className="userMenuChevron" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </button>
                {showUserMenu && (
                  <div className="userDropdown popoverCard">
                    <div className="userDropdownHeader">
                      <div className="userAvatarLarge">
                        {(authUsername || "U").charAt(0).toUpperCase()}
                      </div>
                      <div className="userDropdownInfo">
                        <span className="userDropdownTitle">{authUsername}</span>
                        <span className="userDropdownSubtitle">Authenticated</span>
                      </div>
                    </div>
                    <div className="userDropdownDivider" />
                    <button
                      className="userDropdownItem logoutItem"
                      onClick={() => {
                        setShowUserMenu(false);
                        handleLogout();
                      }}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                        <polyline points="16 17 21 12 16 7" />
                        <line x1="21" y1="12" x2="9" y2="12" />
                      </svg>
                      <span>Log out</span>
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <button
                className="toolbarLoginBtn"
                onClick={() => setShowAuthModal(true)}
                title="Log in to save files"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
                <span>Log In</span>
              </button>
            )}
          </div>
        </div>

        <div className="editorAndPreviewWrap">
          <div className="editorMainColumn">
            {/* VS Code-style Editor Tabs */}
            {openTabs.length > 0 && (
              <div className="editorTabsBar">
                {openTabs.map((tab) => (
                  <div
                    key={tab.id}
                    className={`editorTab ${tab.id === activeTabId ? "active" : ""}`}
                    onClick={() => handleSelectTab(tab.id)}
                    title={tab.name}
                  >
                    <span className="editorTabIcon">
                      {languages.find((l) => l.value === tab.language)?.icon || "📄"}
                    </span>
                    <span className="editorTabTitle">{tab.name}</span>
                    {tab.dirty && <span className="editorTabUnsaved" title="Unsaved changes">●</span>}
                    <button
                      className="editorTabClose"
                      onClick={(e) => handleCloseTab(tab.id, e)}
                      title="Close tab"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}

            <Editor
              socketRef={socketRef}
              socket={socket}
              roomId={roomId}
              language={selectedLanguage}
              editorSettings={editorSettings}
              onCodeChange={(code) => {
                codeRef.current = code;
                setHasUnsavedChanges(true);
                setOpenTabs((prev) =>
                  prev.map((t) => (t.id === activeTabId ? { ...t, code, dirty: true } : t))
                );
                setPreviewTrigger((p) => p + 1);
              }}
              onEditorInit={(editor) => {
                editorInstanceRef.current = editor;
              }}
            />
          </div>

          <LivePreview
            isOpen={isPreviewOpen}
            onClose={() => {
              setIsPreviewOpen(false);
              setTimeout(() => {
                if (editorInstanceRef.current) editorInstanceRef.current.refresh();
              }, 50);
            }}
            htmlContent={previewHtml}
            width={previewWidth}
            onResize={(w) => {
              setPreviewWidth(w);
              if (editorInstanceRef.current) editorInstanceRef.current.refresh();
            }}
          />
        </div>

        {!isTerminalCollapsed && (
          <>
            <div className="terminalResizer" onPointerDown={handlePointerDown} />
            <div
              className="terminalWrap"
              style={{
                height: isTerminalMaximized ? "calc(100vh - 50px)" : `${terminalHeight}px`,
                position: isTerminalMaximized ? "absolute" : "relative",
                bottom: 0,
                left: isTerminalMaximized ? "250px" : "auto",
                right: 0,
                width: isTerminalMaximized ? "calc(100% - 250px)" : "auto",
                zIndex: isTerminalMaximized ? 100 : 1,
              }}
            >
              <div className="terminalHeader">
                <span className="terminalTitle">
                  ● Terminal ({runMode === "docker" ? "Docker" : "Standard"})
                </span>
                <div style={{ display: "flex", gap: "5px" }}>
                  <button className="clearBtn" onClick={() => setIsTerminalMaximized(!isTerminalMaximized)}>
                    {isTerminalMaximized ? "Restore" : "Maximize"}
                  </button>
                  <button className="clearBtn" onClick={() => setIsTerminalCollapsed(true)}>Collapse</button>
                  <button className="clearBtn" onClick={clearTerminal}>Clear</button>
                </div>
              </div>
              <pre className="terminalOutput">{terminalOutput.join("")}</pre>
              <div style={{ display: "flex", alignItems: "center", marginTop: "10px" }}>
                <span style={{ color: "#50fa7b", marginRight: "5px" }}>❯</span>
                <input
                  type="text"
                  className="terminalInput"
                  style={{ border: "none", paddingLeft: 0, flex: 1 }}
                  value={terminalInput}
                  onChange={(e) => setTerminalInput(e.target.value)}
                  onKeyDown={handleTerminalInput}
                  placeholder="Type command and press Enter..."
                />
              </div>
            </div>
          </>
        )}
        {isTerminalCollapsed && (
          <div style={{ padding: "5px 15px", backgroundColor: "var(--bg-primary)", display: "flex", justifyContent: "flex-end", borderTop: "1px solid var(--border-color)" }}>
            <button className="clearBtn" onClick={() => setIsTerminalCollapsed(false)}>_ Show Terminal</button>
          </div>
        )}
      </div>

      {/* ── SAVE FILE MODAL ──────────────────────────────────────────────── */}
      {showSaveModal && (
        <div className="modalOverlay" onClick={(e) => { if (e.target === e.currentTarget) setShowSaveModal(false); }}>
          <div className="modalBox">
            <h3 className="modalTitle">💾 Save File</h3>
            <p className="modalHint">
              Language: <strong>{langInfo?.icon} {langInfo?.label}</strong> — extension will be <code>.{langInfo?.ext}</code>
            </p>
            <label className="modalLabel">File name</label>
            <input
              className="modalInput"
              type="text"
              autoFocus
              value={saveModalName}
              onChange={(e) => { setSaveModalName(e.target.value); setSaveModalError(""); }}
              onKeyDown={(e) => { if (e.key === "Enter") handleSaveModalConfirm(); if (e.key === "Escape") setShowSaveModal(false); }}
              placeholder={`e.g. solution.${langInfo?.ext}`}
            />
            {saveModalError && <p className="modalError">{saveModalError}</p>}
            <div className="modalActions">
              <button className="btn modalCancelBtn" onClick={() => setShowSaveModal(false)}>Cancel</button>
              <button className="btn modalSaveBtn" onClick={handleSaveModalConfirm} disabled={isSaving}>
                {isSaving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── INLINE AUTH MODAL ────────────────────────────────────────────── */}
      {showAuthModal && (
        <div className="modalOverlay" onClick={(e) => { if (e.target === e.currentTarget) setShowAuthModal(false); }}>
          <div className="modalBox">
            <h3 className="modalTitle">🔒 Authentication Required</h3>
            <p className="modalHint">
              Log in or create an account to save files and manage your workspace.
            </p>

            <div className="authTabs">
              <div
                className={`authTab ${authTab === "login" ? "active" : ""}`}
                onClick={() => { setAuthTab("login"); setAuthError(""); }}
              >
                Log In
              </div>
              <div
                className={`authTab ${authTab === "signup" ? "active" : ""}`}
                onClick={() => { setAuthTab("signup"); setAuthError(""); }}
              >
                Sign Up
              </div>
            </div>

            <form onSubmit={handleAuthSubmit}>
              {authTab === "signup" && (
                <div style={{ marginBottom: "12px" }}>
                  <label className="modalLabel">Username</label>
                  <input
                    className="modalInput"
                    type="text"
                    required
                    value={authForm.username}
                    onChange={(e) => setAuthForm({ ...authForm, username: e.target.value })}
                    placeholder="Choose a username"
                  />
                </div>
              )}

              <div style={{ marginBottom: "12px" }}>
                <label className="modalLabel">Email</label>
                <input
                  className="modalInput"
                  type="email"
                  required
                  value={authForm.email}
                  onChange={(e) => setAuthForm({ ...authForm, email: e.target.value })}
                  placeholder="name@example.com"
                />
              </div>

              <div style={{ marginBottom: "12px" }}>
                <label className="modalLabel">Password</label>
                <input
                  className="modalInput"
                  type="password"
                  required
                  value={authForm.password}
                  onChange={(e) => setAuthForm({ ...authForm, password: e.target.value })}
                  placeholder="••••••••"
                />
              </div>

              {authError && <p className="modalError" style={{ marginBottom: "10px" }}>{authError}</p>}

              <div className="modalActions">
                <button
                  type="button"
                  className="btn modalCancelBtn"
                  onClick={() => setShowAuthModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn modalSaveBtn"
                  disabled={authLoading}
                >
                  {authLoading
                    ? "Authenticating…"
                    : authTab === "login"
                    ? "Log In & Continue"
                    : "Sign Up & Continue"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default EditorPage;
