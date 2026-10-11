const { v4: uuidv4 } = require("uuid");
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

class CodeExecutor {
  constructor(roomId, code, language, isDocker) {
    this.roomId = roomId;
    this.code = code;
    this.language = language;
    this.isDocker = isDocker;
    this.child = null;
    this.tempDir = null;
    this.timeout = null;
  }

  start({ onOutput, onError, onClose }) {
    if (typeof this.code !== "string") {
      onClose(null, "Invalid code provided");
      return;
    }

    const fileMap = {
      javascript: "file.js",
      python: "file.py",
      cpp: "file.cpp",
      java: "Main.java",
    };

    const filename = fileMap[this.language];
    if (!filename) {
      onClose(null, `Unsupported language: ${this.language}`);
      return;
    }

    const tempId = uuidv4();
    this.tempDir = path.join(__dirname, "..", "..", "temp", tempId);

    try {
      fs.mkdirSync(this.tempDir, { recursive: true });
      const filePath = path.join(this.tempDir, filename);
      fs.writeFileSync(filePath, this.code);

      let command = "";
      let args = [];

      if (this.isDocker) {
        const absTempDir = path.resolve(this.tempDir).replace(/\\/g, "/");
        command = "docker";
        
        args = ["run", "--rm", "-i", "--memory=256m", "--cpus=0.5", "--network=none", "-v", `${absTempDir}:/workspace`];
        
        if (this.language === "javascript") {
          args.push("realtime-code-editor-node", "node", filename);
        } else if (this.language === "python") {
          args.push("realtime-code-editor-python", "python", "-u", filename);
        } else if (this.language === "cpp") {
          args.push("realtime-code-editor-cpp", "bash", "-c", `g++ ${filename} -o output && ./output`);
        } else if (this.language === "java") {
          args.push("realtime-code-editor-java", "bash", "-c", `javac ${filename} && java Main`);
        }
      } else {
        if (this.language === "javascript") {
          command = "node";
          args = [filePath];
        } else if (this.language === "python") {
          command = process.platform === "win32" ? "python" : "python3";
          args = ["-u", filePath];
        } else if (this.language === "cpp") {
          // Compile and run directly in the temp dir via a shell script/command
          if (process.platform === "win32") {
            command = "cmd.exe";
            args = ["/c", `g++ ${filename} -o output.exe && output.exe`];
          } else {
            command = "bash";
            args = ["-c", `g++ ${filename} -o output && ./output`];
          }
        } else if (this.language === "java") {
          if (process.platform === "win32") {
            command = "cmd.exe";
            args = ["/c", `javac ${filename} && java Main`];
          } else {
            command = "bash";
            args = ["-c", `javac ${filename} && java Main`];
          }
        }
      }

      this.child = spawn(command, args, { cwd: this.tempDir });

      this.timeout = setTimeout(() => {
        this.kill();
        onError("\nExecution timed out.");
      }, 15000);

      this.child.stdout.on("data", (data) => {
        onOutput(data.toString());
      });

      this.child.stderr.on("data", (data) => {
        onError(data.toString());
      });

      this.child.on("close", (exitCode) => {
        clearTimeout(this.timeout);
        this.cleanup();
        onClose(exitCode, null);
      });

      this.child.on("error", (err) => {
        clearTimeout(this.timeout);
        this.cleanup();
        onClose(null, err.message);
      });
    } catch (err) {
      this.cleanup();
      onClose(null, "Failed to execute code: " + err.message);
    }
  }

  write(data) {
    if (this.child && this.child.stdin) {
      this.child.stdin.write(data);
    }
  }

  kill() {
    if (this.child) {
      this.child.kill();
    }
    this.cleanup();
  }

  cleanup() {
    if (this.tempDir) {
      fs.rm(this.tempDir, { recursive: true, force: true }, () => {});
      this.tempDir = null;
    }
  }
}

module.exports = CodeExecutor;
