import { useState, useRef, useEffect, useCallback } from "react";
import toast from "react-hot-toast";
import ACTIONS from "../Actions";
import { apiUrl } from "../api";

// ── Language → icon / ext mapping ────────────────────────────────────────────
const LANG_MAP = {
  js:   { icon: "🟨", lang: "javascript" },
  py:   { icon: "🐍", lang: "python" },
  cpp:  { icon: "⚙️", lang: "cpp" },
  c:    { icon: "⚙️", lang: "cpp" },
  java: { icon: "☕", lang: "java" },
  ts:   { icon: "🔷", lang: "javascript" },
  json: { icon: "📋", lang: "javascript" },
  md:   { icon: "📝", lang: "javascript" },
  html: { icon: "🌐", lang: "html" },
  css:  { icon: "🎨", lang: "css" },
  sh:   { icon: "🖥️", lang: "javascript" },
};

function getFileIcon(name) {
  const ext = name.split(".").pop().toLowerCase();
  return LANG_MAP[ext]?.icon || "📄";
}
function getFileLang(name) {
  const ext = name.split(".").pop().toLowerCase();
  return LANG_MAP[ext]?.lang || "javascript";
}

// ── Context Menu ──────────────────────────────────────────────────────────────
function ContextMenu({ x, y, items, onClose }) {
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="ctx-menu"
      style={{ top: y, left: x }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {items.map((item, i) =>
        item === "---" ? (
          <div key={i} className="ctx-separator" />
        ) : (
          <button
            key={i}
            className={`ctx-item${item.danger ? " ctx-danger" : ""}`}
            onClick={() => { item.action(); onClose(); }}
            disabled={item.disabled}
          >
            <span className="ctx-icon">{item.icon}</span>
            {item.label}
          </button>
        )
      )}
    </div>
  );
}

// ── Inline editable label ─────────────────────────────────────────────────────
function InlineEdit({ initialValue, onConfirm, onCancel }) {
  const [val, setVal] = useState(initialValue);
  const ref = useRef(null);
  // Enter unmounts the input which fires blur — confirm/cancel exactly once
  const doneRef = useRef(false);
  useEffect(() => { ref.current?.select(); }, []);
  const confirm = (v) => {
    if (doneRef.current) return;
    doneRef.current = true;
    onConfirm(v);
  };
  const cancel = () => {
    if (doneRef.current) return;
    doneRef.current = true;
    onCancel();
  };
  return (
    <input
      ref={ref}
      className="explorer-inline-input"
      value={val}
      autoFocus
      onChange={(e) => setVal(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") { e.stopPropagation(); confirm(val.trim()); }
        if (e.key === "Escape") { e.stopPropagation(); cancel(); }
      }}
      onBlur={() => confirm(val.trim())}
      onClick={(e) => e.stopPropagation()}
    />
  );
}

// ── Single tree node ──────────────────────────────────────────────────────────
function TreeNode({
  node, depth, activeFileId, unsavedFileIds,
  onFileClick, onRename, onDelete, onDownload, onNewFile, onNewFolder,
  editingId, setEditingId, editingType,
  onConfirmRename, onConfirmNew,
}) {
  const [open, setOpen] = useState(true);
  const isFolder = node.type === "folder";
  const isFile = node.type === "file";
  const isActive = isFile && node._id === activeFileId;
  const hasUnsaved = isFile && unsavedFileIds.has(node._id);

  const isEditing = editingId === node._id && editingType === "rename";
  const isNewChild = editingId === node._id && editingType !== "rename"; // creating under this folder

  const indent = depth * 14;

  const [ctx, setCtx] = useState(null);

  const handleCtxMenu = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setCtx({ x: e.clientX, y: e.clientY });
  };

  const folderMenuItems = [
    { icon: "📄", label: "New File",   action: () => onNewFile(node._id) },
    { icon: "📁", label: "New Folder", action: () => onNewFolder(node._id) },
    "---",
    { icon: "✏️", label: "Rename", action: () => setEditingId(node._id, "rename") },
    { icon: "🗑️", label: "Delete", action: () => onDelete(node), danger: true },
  ];

  const fileMenuItems = [
    { icon: "📂", label: "Open",     action: () => onFileClick(node) },
    { icon: "⬇️", label: "Download", action: () => onDownload(node) },
    "---",
    { icon: "✏️", label: "Rename", action: () => setEditingId(node._id, "rename") },
    { icon: "🗑️", label: "Delete", action: () => onDelete(node), danger: true },
  ];

  const activate = () => { if (isFile) onFileClick(node); else setOpen(!open); };

  return (
    <div>
      {/* Node row */}
      <div
        className={`tree-row${isActive ? " tree-row-active" : ""}${isFolder ? " tree-folder" : ""}`}
        style={{ paddingLeft: 8 + indent }}
        role="treeitem"
        tabIndex={0}
        aria-selected={isFile ? isActive : undefined}
        aria-expanded={isFolder ? open : undefined}
        onClick={activate}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            // Let inner buttons/inputs handle their own keys
            if (e.target.closest("button,input")) return;
            e.preventDefault();
            activate();
          }
        }}
        onContextMenu={handleCtxMenu}
        title={node.name}
      >
        {/* Expand chevron for folders */}
        {isFolder && (
          <span className="tree-chevron">{open ? "▾" : "▸"}</span>
        )}
        {/* Icon */}
        <span className="tree-icon">
          {isFolder ? (open ? "📂" : "📁") : getFileIcon(node.name)}
        </span>
        {/* Label / inline edit */}
        {isEditing ? (
          <InlineEdit
            initialValue={node.name}
            onConfirm={(v) => onConfirmRename(node, v)}
            onCancel={() => setEditingId(null, null)}
          />
        ) : (
          <span className={`tree-label${isActive ? " tree-label-active" : ""}`}>
            {node.name}
            {hasUnsaved && <span className="tree-unsaved-dot" title="Unsaved changes">●</span>}
          </span>
        )}

        {/* Hover action buttons */}
        {!isEditing && (
          <span className="tree-actions" onClick={(e) => e.stopPropagation()}>
            {isFolder && (
              <>
                <button className="tree-action-btn" title="New File" aria-label={`New file in ${node.name}`} onClick={() => onNewFile(node._id)}>+📄</button>
                <button className="tree-action-btn" title="New Folder" aria-label={`New folder in ${node.name}`} onClick={() => onNewFolder(node._id)}>+📁</button>
              </>
            )}
            <button className="tree-action-btn" title="Rename" aria-label={`Rename ${node.name}`} onClick={() => setEditingId(node._id, "rename")}>✏️</button>
            <button className="tree-action-btn" title="Delete" aria-label={`Delete ${node.name}`} onClick={() => onDelete(node)}>🗑️</button>
          </span>
        )}
      </div>

      {/* Inline "new file/folder" input under this folder */}
      {isNewChild && (
        <div style={{ paddingLeft: 8 + indent + 14 }}>
          <InlineEdit
            initialValue={editingType === "new-file" ? "untitled.js" : "new-folder"}
            onConfirm={(v) => onConfirmNew(node._id, v, editingType)}
            onCancel={() => setEditingId(null, null)}
          />
        </div>
      )}

      {/* Children */}
      {isFolder && open && node.children && node.children.length > 0 && (
        <div role="group" aria-label={`${node.name} contents`}>
          {node.children.map((child) => (
            <TreeNode
              key={child._id}
              node={child}
              depth={depth + 1}
              activeFileId={activeFileId}
              unsavedFileIds={unsavedFileIds}
              onFileClick={onFileClick}
              onRename={onRename}
              onDelete={onDelete}
              onDownload={onDownload}
              onNewFile={onNewFile}
              onNewFolder={onNewFolder}
              editingId={editingId}
              setEditingId={setEditingId}
              editingType={editingType}
              onConfirmRename={onConfirmRename}
              onConfirmNew={onConfirmNew}
            />
          ))}
        </div>
      )}

      {ctx && (
        <ContextMenu
          x={ctx.x} y={ctx.y}
          items={isFolder ? folderMenuItems : fileMenuItems}
          onClose={() => setCtx(null)}
        />
      )}
    </div>
  );
}

// ── Helpers: build tree from flat arrays ──────────────────────────────────────
function buildTree(folders, files) {
  // folders: [{_id, name, parentId}]
  // files:   [{_id, name, folderId, language, updatedAt}]

  const folderMap = {};
  folders.forEach((f) => {
    folderMap[f._id] = { ...f, type: "folder", children: [] };
  });

  const roots = [];

  // Place folders
  folders.forEach((f) => {
    if (f.parentId && folderMap[f.parentId]) {
      folderMap[f.parentId].children.push(folderMap[f._id]);
    } else {
      roots.push(folderMap[f._id]);
    }
  });

  // Place files
  files.forEach((file) => {
    const node = { ...file, type: "file" };
    if (file.folderId && folderMap[file.folderId]) {
      folderMap[file.folderId].children.push(node);
    } else {
      roots.push(node);
    }
  });

  // Sort: folders first, then files, alphabetically
  function sortChildren(nodes) {
    nodes.sort((a, b) => {
      if (a.type !== b.type) return a.type === "folder" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    nodes.forEach((n) => { if (n.children) sortChildren(n.children); });
  }
  sortChildren(roots);
  return roots;
}

// ── Main FileExplorer component ───────────────────────────────────────────────
export default function FileExplorer({
  authToken,
  activeFileId,
  unsavedFileIds,
  onFileOpen,
  onAuthRequired,
  onDownload,
  socket,
  roomId,
  onFilesUpdate,
  onFileDelete,
  onFolderDelete,
  onFileRename,
}) {
  const [folders, setFolders] = useState([]);
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingIdState] = useState(null);
  const [editingType, setEditingType] = useState(null); // "rename" | "new-file" | "new-folder"
  // For root-level new file/folder
  const [rootNewType, setRootNewType] = useState(null); // "new-file" | "new-folder"

  const [ctx, setCtx] = useState(null); // root right-click context menu
  const onFilesUpdateRef = useRef(onFilesUpdate);
  const onAuthRequiredRef = useRef(onAuthRequired);
  const onFileOpenRef = useRef(onFileOpen);
  const onDownloadRef = useRef(onDownload);
  const onFileDeleteRef = useRef(onFileDelete);
  const onFolderDeleteRef = useRef(onFolderDelete);
  const onFileRenameRef = useRef(onFileRename);
  const authTokenRef = useRef(authToken);

  const abortControllerRef = useRef(null);
  const inFlightRef = useRef(false);
  const lastErrorToastRef = useRef(0);

  useEffect(() => {
    onFilesUpdateRef.current = onFilesUpdate;
  }, [onFilesUpdate]);

  useEffect(() => {
    onAuthRequiredRef.current = onAuthRequired;
  }, [onAuthRequired]);

  useEffect(() => {
    onFileOpenRef.current = onFileOpen;
  }, [onFileOpen]);

  useEffect(() => {
    onDownloadRef.current = onDownload;
  }, [onDownload]);

  useEffect(() => {
    onFileDeleteRef.current = onFileDelete;
  }, [onFileDelete]);

  useEffect(() => {
    onFolderDeleteRef.current = onFolderDelete;
  }, [onFolderDelete]);

  useEffect(() => {
    onFileRenameRef.current = onFileRename;
  }, [onFileRename]);

  useEffect(() => {
    authTokenRef.current = authToken;
  }, [authToken]);

  // Clean up any pending refresh request on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      inFlightRef.current = false;
      setLoading(false);
    };
  }, []);

  const setEditingId = useCallback((id, type) => {
    setEditingIdState(id);
    setEditingType(type);
  }, []);

  // ── Fetch ─────────────────────────────────────────────────────────────────
  const refresh = useCallback(async (force = false) => {
    const t = authTokenRef.current || localStorage.getItem("token");
    if (!t) {
      setFolders([]);
      setFiles([]);
      setLoading(false);
      inFlightRef.current = false;
      return;
    }

    // If already in flight and not explicitly forced, ignore duplicate trigger
    if (inFlightRef.current && !force) {
      return;
    }

    // Cancel any previous in-flight refresh request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;
    inFlightRef.current = true;
    setLoading(true);

    const timeoutId = setTimeout(() => {
      controller.abort();
    }, 7000);

    try {
      const [fRes, fiRes] = await Promise.all([
        fetch(apiUrl("/api/folders"), {
          headers: {
            Authorization: `Bearer ${t}`,
            "Cache-Control": "no-cache, no-store",
          },
          signal: controller.signal,
        }),
        fetch(apiUrl("/api/files/saved-files"), {
          headers: {
            Authorization: `Bearer ${t}`,
            "Cache-Control": "no-cache, no-store",
          },
          signal: controller.signal,
        }),
      ]);

      if (fRes.status === 401 || fiRes.status === 401) {
        setFolders([]);
        setFiles([]);
        if (onAuthRequiredRef.current) onAuthRequiredRef.current();
        return;
      }

      if (!fRes.ok || !fiRes.ok) {
        throw new Error("Failed to load explorer data");
      }

      const foldersData = await fRes.json().catch(() => []);
      const filesData = await fiRes.json().catch(() => []);
      const validFolders = Array.isArray(foldersData) ? foldersData : [];
      const validFiles = Array.isArray(filesData) ? filesData : [];

      setFolders(validFolders);
      setFiles(validFiles);

      if (onFilesUpdateRef.current) {
        onFilesUpdateRef.current({ folders: validFolders, files: validFiles });
      }
    } catch (err) {
      // Do NOT use early return here — let finally always run to clear inFlightRef
      if (err.name !== "AbortError") {
        const now = Date.now();
        if (now - lastErrorToastRef.current > 6000) {
          lastErrorToastRef.current = now;
          toast.error("Failed to load file explorer", { id: "explorer-load-error" });
        }
      }
    } finally {
      clearTimeout(timeoutId);
      // Always reset state when this is still the current controller
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null;
        inFlightRef.current = false;
        setLoading(false);
      } else {
        // This controller was superseded — but make sure inFlightRef isn't stuck
        // if the new controller has already finished
        if (!abortControllerRef.current) {
          inFlightRef.current = false;
        }
      }
    }
  }, []);

  // Initial + auth-change data load (fetch-on-mount is the valid useEffect use case)
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh(true);
  }, [authToken, refresh]);

  // ── Socket: listen for real-time explorer refresh ─────────────────────────
  useEffect(() => {
    if (!socket) return;
    let timer = null;
    const handler = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        refresh(true);
      }, 300);
    };
    socket.on(ACTIONS.FILE_EXPLORER_REFRESH, handler);
    return () => {
      if (timer) clearTimeout(timer);
      socket.off(ACTIONS.FILE_EXPLORER_REFRESH, handler);
    };
  }, [socket, refresh]);

  // ── Actions ───────────────────────────────────────────────────────────────
  async function apiCall(url, method, body) {
    const token = authTokenRef.current || localStorage.getItem("token");
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);
    try {
      const res = await fetch(apiUrl(url), {
        method,
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
      if (res.status === 401) {
        if (onAuthRequiredRef.current) onAuthRequiredRef.current();
        throw new Error("Session expired. Please log in again.");
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || data.message || "Request failed");
      return data;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async function createFolder(name, parentId) {
    if (!name) return;
    try {
      await apiCall("/api/folders", "POST", { name, parentId: parentId || null });
      toast.success(`Folder "${name}" created`);
      refresh(true);
      if (socket) socket.emit(ACTIONS.FILE_EXPLORER_REFRESH, { roomId });
    } catch (e) { toast.error(e.message); }
  }

  async function renameFolder(folderId, name) {
    if (!name) return;
    try {
      await apiCall(`/api/folders/${folderId}/rename`, "PATCH", { name });
      toast.success("Folder renamed");
      refresh(true);
      if (socket) socket.emit(ACTIONS.FILE_EXPLORER_REFRESH, { roomId });
    } catch (e) { toast.error(e.message); }
  }

  async function deleteFolder(folderId, folderName) {
    if (!window.confirm(`Delete folder "${folderName}" and all its contents? This cannot be undone.`)) return;
    // Find all descendant folders to delete optimistically
    const idsToDelete = [folderId];
    let i = 0;
    while (i < idsToDelete.length) {
      const currentId = idsToDelete[i];
      const childFolders = folders.filter((f) => f.parentId === currentId).map((f) => f._id);
      idsToDelete.push(...childFolders);
      i++;
    }

    // Optimistic UI updates
    setFolders((prev) => prev.filter((f) => !idsToDelete.includes(f._id)));
    setFiles((prev) => prev.filter((f) => !idsToDelete.includes(f.folderId)));
    if (onFolderDeleteRef.current) onFolderDeleteRef.current(folderId, idsToDelete);

    try {
      await apiCall(`/api/folders/${folderId}`, "DELETE");
      toast.success(`Folder "${folderName}" deleted`);
      refresh(true);
      if (socket) socket.emit(ACTIONS.FILE_EXPLORER_REFRESH, { roomId });
    } catch (e) {
      toast.error(e.message);
      refresh(true);
    }
  }

  async function createFile(name, folderId) {
    if (!name) return;
    const lang = getFileLang(name);
    try {
      const res = await apiCall("/api/files/save-file", "POST", {
        name,
        code: "",
        language: lang,
        folderId: folderId || null,
      });
      toast.success(`File "${name}" created`);
      refresh(true);
      if (socket) socket.emit(ACTIONS.FILE_EXPLORER_REFRESH, { roomId });
      if (res?.file?._id && onFileOpenRef.current) {
        onFileOpenRef.current(res.file._id);
      }
    } catch (e) { toast.error(e.message); }
  }

  async function renameFile(fileId, name) {
    if (!name) return;
    try {
      await apiCall(`/api/files/file/${fileId}/rename`, "PATCH", { name });
      toast.success("File renamed");
      if (onFileRenameRef.current) onFileRenameRef.current(fileId, name);
      refresh(true);
      if (socket) socket.emit(ACTIONS.FILE_EXPLORER_REFRESH, { roomId });
    } catch (e) { toast.error(e.message); }
  }

  async function deleteFile(fileId, fileName) {
    if (!window.confirm(`Delete "${fileName}"? This cannot be undone.`)) return;
    // Optimistic removal from explorer
    setFiles((prev) => prev.filter((f) => f._id !== fileId));
    if (onFileDeleteRef.current) onFileDeleteRef.current(fileId);

    try {
      await apiCall(`/api/files/file/${fileId}`, "DELETE");
      toast.success(`"${fileName}" deleted`);
      refresh(true);
      if (socket) socket.emit(ACTIONS.FILE_EXPLORER_REFRESH, { roomId });
    } catch (e) {
      toast.error(e.message);
      refresh(true);
    }
  }

  // ── Unified handlers passed to TreeNode ───────────────────────────────────
  function handleFileClick(node) { onFileOpen(node._id); }

  function handleDelete(node) {
    if (node.type === "folder") deleteFolder(node._id, node.name);
    else deleteFile(node._id, node.name);
  }

  function handleDownload(node) { onDownload(node._id); }

  function handleNewFile(parentFolderId) {
    setEditingId(parentFolderId || "root", "new-file");
    if (!parentFolderId) setRootNewType("new-file");
  }

  function handleNewFolder(parentFolderId) {
    setEditingId(parentFolderId || "root", "new-folder");
    if (!parentFolderId) setRootNewType("new-folder");
  }

  async function handleConfirmRename(node, name) {
    setEditingId(null, null);
    if (!name || name === node.name) return;
    if (node.type === "folder") renameFolder(node._id, name);
    else renameFile(node._id, name);
  }

  async function handleConfirmNew(parentId, name, type) {
    setEditingId(null, null);
    setRootNewType(null);
    if (!name) return;
    if (type === "new-file") createFile(name, parentId === "root" ? null : parentId);
    else createFolder(name, parentId === "root" ? null : parentId);
  }

  // ── Build tree ────────────────────────────────────────────────────────────
  const tree = buildTree(folders, files);

  // ── Root context menu ─────────────────────────────────────────────────────
  const rootMenu = [
    { icon: "📄", label: "New File",    action: () => handleNewFile(null) },
    { icon: "📁", label: "New Folder",  action: () => handleNewFolder(null) },
    "---",
    { icon: "↻",  label: "Refresh",    action: () => refresh() },
  ];

  const handleRootCtx = (e) => {
    e.preventDefault();
    setCtx({ x: e.clientX, y: e.clientY });
  };

  // ── Render ────────────────────────────────────────────────────────────────
  if (!authToken) {
    return (
      <div className="emptyExplorer">
        <span>🔒 Log in to view &amp; save files.</span>
        <button
          className="btn"
          style={{ marginTop: "10px", width: "100%", fontSize: "12px", background: "var(--accent-green)" }}
          onClick={onAuthRequired}
        >
          Log In / Sign Up
        </button>
      </div>
    );
  }

  return (
    <div
      className="file-explorer"
      onContextMenu={handleRootCtx}
      style={{ flex: 1, overflowY: "auto", userSelect: "none" }}
    >
      {/* Explorer toolbar */}
      <div className="explorer-toolbar">
        <button className="explorer-toolbar-btn" title="New File" aria-label="New File" onClick={() => handleNewFile(null)}>📄</button>
        <button className="explorer-toolbar-btn" title="New Folder" aria-label="New Folder" onClick={() => handleNewFolder(null)}>📁</button>
        <button
          className="explorer-toolbar-btn"
          title="Refresh"
          aria-label="Refresh"
          onClick={() => refresh()}
          style={{ marginLeft: "auto" }}
        >
          ↻
        </button>
      </div>

      {loading && <div className="explorer-loading">Loading…</div>}

      {/* Root-level inline create */}
      {rootNewType && editingId === "root" && (
        <div style={{ paddingLeft: 8 }}>
          <InlineEdit
            initialValue={rootNewType === "new-file" ? "untitled.js" : "new-folder"}
            onConfirm={(v) => handleConfirmNew("root", v, rootNewType)}
            onCancel={() => { setEditingId(null, null); setRootNewType(null); }}
          />
        </div>
      )}

      {/* Tree */}
      {tree.length === 0 && !loading && !rootNewType && (
        <div className="emptyExplorer">
          No files yet.<br />
          Click 📄 to create a file, or press <kbd>Ctrl+S</kbd>.
        </div>
      )}

      <div role="tree" aria-label="Project files">
      {tree.map((node) => (
        <TreeNode
          key={node._id}
          node={node}
          depth={0}
          activeFileId={activeFileId}
          unsavedFileIds={unsavedFileIds}
          onFileClick={handleFileClick}
          onRename={(n, name) => handleConfirmRename(n, name)}
          onDelete={handleDelete}
          onDownload={handleDownload}
          onNewFile={handleNewFile}
          onNewFolder={handleNewFolder}
          editingId={editingId}
          setEditingId={setEditingId}
          editingType={editingType}
          onConfirmRename={handleConfirmRename}
          onConfirmNew={handleConfirmNew}
        />
      ))}
      </div>

      {ctx && (
        <ContextMenu
          x={ctx.x} y={ctx.y}
          items={rootMenu}
          onClose={() => setCtx(null)}
        />
      )}
    </div>
  );
}

