/**
 * Builds a self-contained HTML document for the sandboxed Live Preview iframe.
 * Handles relative CSS (<link rel="stylesheet">) and JS (<script src="...">) resolution,
 * path mapping for nested project folders, auto-wrapping HTML snippets, and console log bridging.
 */

// Build a path lookup for a given folder id
function getFolderPath(folderId, foldersMap) {
  if (!folderId || !foldersMap[folderId]) return "";
  const parts = [];
  let curr = foldersMap[folderId];
  while (curr) {
    parts.unshift(curr.name);
    curr = curr.parentId ? foldersMap[curr.parentId] : null;
  }
  return parts.join("/");
}

/**
 * Normalizes relative path for fuzzy matching.
 * e.g., "./style.css" -> "style.css", "css/style.css" -> "css/style.css"
 */
function cleanPath(p) {
  if (!p) return "";
  return p.replace(/^\.\//, "").replace(/^\//, "").trim();
}

/**
 * Maps all files across openTabs and savedFiles into path-indexed code.
 */
export function buildFileMap(openTabs = [], savedFiles = [], folders = []) {
  const foldersMap = {};
  folders.forEach((f) => {
    foldersMap[f._id] = f;
  });

  const fileMap = {}; // key -> fileCode

  // Helper to register paths for a file
  const registerFile = (file) => {
    const dir = getFolderPath(file.folderId, foldersMap);
    const fullPath = dir ? `${dir}/${file.name}` : file.name;
    const baseName = file.name;
    const code = file.code || "";

    // Register by full path, basename, and variations
    fileMap[fullPath.toLowerCase()] = code;
    fileMap[cleanPath(fullPath).toLowerCase()] = code;
    fileMap[baseName.toLowerCase()] = code;
    fileMap[cleanPath(baseName).toLowerCase()] = code;
  };

  // Saved files first
  savedFiles.forEach(registerFile);

  // Open tabs override saved files (they have live, unsaved in-editor code)
  openTabs.forEach(registerFile);

  return fileMap;
}

/**
 * Returns sample HTML to preview standalone CSS files.
 */
function getCssDemoHtml(cssCode) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>CSS Preview</title>
  <style>
${cssCode}
  </style>
</head>
<body>
  <div style="font-family: system-ui, sans-serif; padding: 24px; max-width: 800px; margin: 0 auto;">
    <h1>CSS Live Preview</h1>
    <p>This is a live preview of your CSS stylesheet with common HTML elements.</p>
    <div style="margin: 20px 0; display: flex; gap: 10px;">
      <button class="btn btn-primary">Primary Button</button>
      <button class="btn btn-secondary">Secondary Button</button>
    </div>
    <div class="card" style="border: 1px solid #ccc; padding: 16px; border-radius: 8px; margin: 16px 0;">
      <h2>Card Title</h2>
      <p>Card content paragraph with styled elements.</p>
      <a href="#" class="link">Sample Link</a>
    </div>
    <form style="display: flex; flex-direction: column; gap: 8px; max-width: 320px;">
      <label for="name">Input Field</label>
      <input type="text" id="name" placeholder="Type here..." style="padding: 8px;" />
    </form>
  </div>
</body>
</html>`;
}

/**
 * Builds the complete HTML bundle.
 */
export function buildPreviewHtml({
  activeCode,
  activeLanguage,
  openTabs = [],
  savedFiles = [],
  folders = [],
}) {
  const fileMap = buildFileMap(openTabs, savedFiles, folders);

  // If the active file is CSS and there is no HTML file open
  if (activeLanguage === "css") {
    // Check if an index.html or any .html exists in openTabs or savedFiles
    const htmlTab = openTabs.find((t) => t.name.toLowerCase().endsWith(".html"));
    const htmlSaved = savedFiles.find((f) => f.name.toLowerCase().endsWith(".html"));
    const targetHtml = htmlTab || htmlSaved;

    if (!targetHtml) {
      return getCssDemoHtml(activeCode);
    }
  }

  // Determine base HTML
  let html = activeCode || "";
  if (activeLanguage !== "html") {
    // User is viewing JS or CSS or other tab, find best HTML file in project
    const htmlTab = openTabs.find((t) => t.name.toLowerCase().endsWith(".html"));
    const htmlSaved = savedFiles.find((f) => f.name.toLowerCase().endsWith(".html"));
    const target = htmlTab || htmlSaved;
    if (target) {
      html = target.code || "";
    } else {
      html = `<!DOCTYPE html><html><head><title>Preview</title></head><body style="font-family: sans-serif; padding: 20px;"><h2>Live Preview</h2><p>Create or open an <code>index.html</code> file to preview your project.</p></body></html>`;
    }
  }

  // Replace relative <link rel="stylesheet" href="...">
  // Matches <link ... href="..." ...> or <link ... rel="stylesheet" ...>
  html = html.replace(/<link\s+([^>]*?)href=["']([^"']+)["']([^>]*?)\/?>/gi, (match, before, href, after) => {
    // If external link (http/https/cdn), leave untouched
    if (/^(https?:|\/\/|data:)/i.test(href)) {
      return match;
    }
    // Only replace stylesheet links
    const fullTag = before + after;
    if (!/rel=["']stylesheet["']/i.test(fullTag) && !match.toLowerCase().includes("stylesheet")) {
      return match;
    }

    const key = cleanPath(href).toLowerCase();
    const cssContent = fileMap[key];

    if (typeof cssContent === "string") {
      return `\n<style data-href="${href}">\n${cssContent}\n</style>\n`;
    }
    return match;
  });

  // Also replace <link ... rel="stylesheet" ... href="..."> when rel comes before href
  html = html.replace(/<link\s+([^>]*?)rel=["']stylesheet["']([^>]*?)href=["']([^"']+)["']([^>]*?)\/?>/gi, (match, before, mid, href) => {
    if (/^(https?:|\/\/|data:)/i.test(href)) {
      return match;
    }
    const key = cleanPath(href).toLowerCase();
    const cssContent = fileMap[key];
    if (typeof cssContent === "string") {
      return `\n<style data-href="${href}">\n${cssContent}\n</style>\n`;
    }
    return match;
  });

  // Replace relative <script ... src="..."></script>
  html = html.replace(/<script\s+([^>]*?)src=["']([^"']+)["']([^>]*?)>\s*<\/script>/gi, (match, before, src, after) => {
    if (/^(https?:|\/\/|data:)/i.test(src)) {
      return match;
    }
    const key = cleanPath(src).toLowerCase();
    const jsContent = fileMap[key];
    if (typeof jsContent === "string") {
      return `\n<script data-src="${src}" ${before} ${after}>\n${jsContent}\n</script>\n`;
    }
    return match;
  });

  // Wrap in HTML5 template if bare snippet
  if (!/<html[\s>]/i.test(html)) {
    html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Live Preview</title>
</head>
<body>
${html}
</body>
</html>`;
  }

  // Inject console bridge & error logger script
  const consoleBridge = `
<script>
(function() {
  function send(level, args) {
    try {
      var msg = args.map(function(a) {
        if (typeof a === 'object') {
          try { return JSON.stringify(a, null, 2); } catch(e) { return String(a); }
        }
        return String(a);
      }).join(' ');
      window.parent.postMessage({ type: 'preview-console', level: level, message: msg }, window.location.origin);
    } catch(e) {}
  }
  var _log = console.log, _warn = console.warn, _error = console.error, _info = console.info;
  console.log = function() { _log.apply(console, arguments); send('log', Array.prototype.slice.call(arguments)); };
  console.warn = function() { _warn.apply(console, arguments); send('warn', Array.prototype.slice.call(arguments)); };
  console.error = function() { _error.apply(console, arguments); send('error', Array.prototype.slice.call(arguments)); };
  console.info = function() { _info.apply(console, arguments); send('info', Array.prototype.slice.call(arguments)); };
  window.onerror = function(msg, url, line) {
    send('error', [msg + (line ? ' (line ' + line + ')' : '')]);
  };
})();
</script>
`;

  if (/<head[\s>]/i.test(html)) {
    html = html.replace(/<head[\s>]/i, (match) => `${match}\n${consoleBridge}`);
  } else {
    html = consoleBridge + html;
  }

  return html;
}

