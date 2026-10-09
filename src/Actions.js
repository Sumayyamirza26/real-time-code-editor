const ACTIONS = {
  JOIN: "join",
  JOINED: "joined",
  DISCONNECTED: "disconnected",
  CODE_CHANGE: "code-change",
  SYNC_CODE: "sync-code",
  LEAVE: "leave",
  RUN_CODE: "run-code",
  CODE_RESULT: "code-result",
  DOCKER_RUN_CODE: "docker-run-code",
  DOCKER_CODE_RESULT: "docker-code-result",
  LANGUAGE_CHANGE: "language-change",
  TERMINAL_INPUT: "terminal-input",
  TERMINAL_OUTPUT: "terminal-output",
  FOLDER_CREATED: "folder-created",
  FOLDER_RENAMED: "folder-renamed", 
  FOLDER_DELETED: "folder-deleted",
  FILE_CREATED: "file-created",
  FILE_RENAMED: "file-renamed",
  FILE_DELETED: "file-deleted",
  FILE_EXPLORER_REFRESH: "file-explorer-refresh",
};

module.exports = ACTIONS;
