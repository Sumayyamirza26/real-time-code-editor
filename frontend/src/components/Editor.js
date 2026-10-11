import React, { useEffect, useRef } from "react";
import Codemirror from "codemirror";
import "codemirror/lib/codemirror.css";
import "codemirror/theme/dracula.css";
import "codemirror/mode/javascript/javascript";
import "codemirror/mode/python/python";
import "codemirror/mode/clike/clike";
import "codemirror/mode/xml/xml";
import "codemirror/mode/css/css";
import "codemirror/mode/htmlmixed/htmlmixed";
import "codemirror/addon/edit/closetag";
import "codemirror/addon/edit/closebrackets";
import ACTIONS from "../Actions";

const Editor = ({
  socketRef,
  socket,
  roomId,
  language,
  editorSettings,
  onCodeChange,
  onEditorInit,
}) => {
  const editorRef = useRef(null);

  const getMode = (lang) => {
    switch (lang) {
      case "javascript":
        return { name: "javascript", json: true };
      case "python":
        return { name: "python" };
      case "cpp":
        return { name: "text/x-c++src" };
      case "java":
        return { name: "text/x-java" };
      case "html":
        return { name: "htmlmixed" };
      case "css":
        return { name: "css" };
      default:
        return { name: "javascript", json: true };
    }
  };

  useEffect(() => {
    async function init() {
      editorRef.current = Codemirror.fromTextArea(
        document.getElementById("realtimeEditor"),
        {
          mode: getMode(language),
          theme: "dracula",
          autoCloseTags: true,
          autoCloseBrackets: true,
          lineNumbers: true,
        }
      );

      if (onEditorInit) {
        onEditorInit(editorRef.current);
      }

      editorRef.current.on("change", (instance, changes) => {
        const { origin } = changes;
        const code = instance.getValue();
        onCodeChange(code);

        if (origin !== "setValue") {
          const activeSocket = socket || socketRef?.current;
          if (activeSocket) {
            activeSocket.emit(ACTIONS.CODE_CHANGE, {
              roomId,
              code,
            });
          }
        }
      });
    }

    init();
  }, []);

  useEffect(() => {
    if (editorRef.current) {
      editorRef.current.setOption("mode", getMode(language));
    }
  }, [language]);

  useEffect(() => {
    if (editorRef.current && editorSettings) {
      editorRef.current.setOption("lineWrapping", editorSettings.wordWrap);
      
      const cmElement = editorRef.current.getWrapperElement();
      if (cmElement) {
        cmElement.style.fontSize = `${editorSettings.fontSize}px`;
        editorRef.current.refresh();
      }
    }
  }, [editorSettings]);

  useEffect(() => {
    const activeSocket = socket || socketRef?.current;
    if (activeSocket) {
      const handleCodeChange = ({ code }) => {
        if (code !== null && editorRef.current) {
          const currentCode = editorRef.current.getValue();
          if (code !== currentCode) {
            editorRef.current.setValue(code);
          }
        }
      };

      activeSocket.on(ACTIONS.CODE_CHANGE, handleCodeChange);

      return () => {
        activeSocket.off(ACTIONS.CODE_CHANGE, handleCodeChange);
      };
    }
  }, [socket, socketRef?.current]);

  return <textarea id="realtimeEditor"></textarea>;
};

export default Editor;
