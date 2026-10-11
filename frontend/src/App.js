import "./App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "react-hot-toast";
import Signup from "./pages/Signup";
import Login from "./pages/Login";
import Home from "./pages/Home";
import EditorPage from "./pages/EditorPage";

// Don't mount the editor (and its socket) without a stored identity
function EditorRoute() {
  const hasIdentity = !!localStorage.getItem("username");
  return hasIdentity ? <EditorPage /> : <Navigate to="/" replace />;
}

function App() {
  return (
    <>
      <div>
        <Toaster
          position="top-right"
          toastOptions={{
            success: {
              theme: {
                primary: "#4aed88",
              },
            },
          }}
        ></Toaster>
      </div>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Home />}></Route>
          <Route path="/signup" element={<Signup />}></Route>
          <Route path="/login" element={<Login />}></Route>
          <Route path="/home" element={<Navigate to="/" replace />}></Route>
          <Route path="/editor/:roomId" element={<EditorRoute />}></Route>
          <Route path="*" element={<Navigate to="/" replace />}></Route>
        </Routes>
      </BrowserRouter>
    </>
  );
}

export default App;
