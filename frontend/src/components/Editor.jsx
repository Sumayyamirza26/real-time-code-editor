import { useEffect, useRef } from "react";
import { EditorView, basicSetup } from "codemirror";
import { Compartment, Annotation, EditorState } from "@codemirror/state";
import { javascript } from "@codemirror/lang-javascript";
import { python } from "@codemirror/lang-python";
import { cpp } from "@codemirror/lang-cpp";
import { java } from "@codemirror/lang-java";
import { html } from "@codemirror/lang-html";
import { css } from "@codemirror/lang-css";
import { oneDark } from "@codemirror/theme-one-dark";
import ACTIONS from "../Actions";

// Marks transactions applied from collaborators so they are not echoed back
const remoteAnnotation = Annotation.define();

const languageCompartment = new Compartment();
const wrapCompartment = new Compartment();

const getLanguageExtension = (lang) => {
  switch (lang) {
    case "python":
      return python();
    case "cpp":
      return cpp();
    case "java":
      return java();
    case "html":
      return html();
    case "css":
      return css();
    case "javascript":
    default:
      return javascript();
  }
};

const Editor = ({
  socketRef,
  socket,
  roomId,
  language,
  editorSettings,
  onCodeChange,
  onEditorInit,
}) => {
  const mountRef = useRef(null);
  const viewRef = useRef(null);

  // Always call the latest callbacks/socket without re-creating the editor
  const liveRef = useRef({ onCodeChange, roomId, socket, socketRef });
  useEffect(() => {
    liveRef.current = { onCodeChange, roomId, socket, socketRef };
  });

  const setRemoteCode = (code) => {
    const view = viewRef.current;
    if (!view) return;
    const text = code ?? "";
    if (text === view.state.doc.toString()) return;
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: text },
      annotations: remoteAnnotation.of(true),
    });
  };

  useEffect(() => {
    if (!mountRef.current || viewRef.current) return;

    const view = new EditorView({
      parent: mountRef.current,
      state: EditorState.create({
        doc: "",
        extensions: [
          basicSetup,
          oneDark,
          languageCompartment.of(getLanguageExtension(language)),
          wrapCompartment.of(editorSettings?.wordWrap ? EditorView.lineWrapping : []),
          EditorView.updateListener.of((update) => {
            if (!update.docChanged) return;
            const code = update.state.doc.toString();
            liveRef.current.onCodeChange(code);
            // Remote-applied edits must not be echoed back to the room
            if (update.transactions.some((tr) => tr.annotation(remoteAnnotation))) return;
            const activeSocket =
              liveRef.current.socket || liveRef.current.socketRef?.current;
            if (activeSocket) {
              activeSocket.emit(ACTIONS.CODE_CHANGE, {
                roomId: liveRef.current.roomId,
                code,
              });
            }
          }),
        ],
      }),
    });
    viewRef.current = view;
    if (editorSettings) {
      view.dom.style.fontSize = `${editorSettings.fontSize || 14}px`;
    }

    if (onEditorInit) {
      onEditorInit({
        setValue: setRemoteCode,
        getValue: () => view.state.doc.toString(),
        refresh: () => view.requestMeasure(),
      });
    }

    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const view = viewRef.current;
    if (view) {
      view.dispatch({
        effects: languageCompartment.reconfigure(getLanguageExtension(language)),
      });
    }
  }, [language]);

  useEffect(() => {
    const view = viewRef.current;
    if (view && editorSettings) {
      view.dispatch({
        effects: wrapCompartment.reconfigure(
          editorSettings.wordWrap ? EditorView.lineWrapping : []
        ),
      });
      view.dom.style.fontSize = `${editorSettings.fontSize || 14}px`;
    }
  }, [editorSettings]);

  useEffect(() => {
    const activeSocket = socket || socketRef?.current;
    if (!activeSocket || typeof activeSocket.on !== "function") return;

    const handleCodeChange = ({ code }) => {
      if (code != null) setRemoteCode(code);
    };

    activeSocket.on(ACTIONS.CODE_CHANGE, handleCodeChange);

    return () => {
      activeSocket.off(ACTIONS.CODE_CHANGE, handleCodeChange);
    };
  }, [socket, socketRef]);

  return <div ref={mountRef} className="cm6Host" />;
};

export default Editor;
