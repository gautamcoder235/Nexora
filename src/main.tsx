import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

// Block reload/refresh shortcuts (F5, Ctrl+F5, Ctrl+R, Cmd+R, etc.)
window.addEventListener("keydown", (e) => {
  if (
    e.key === "F5" ||
    ((e.ctrlKey || e.metaKey) && (e.key === "r" || e.key === "R"))
  ) {
    e.preventDefault();
  }
});


ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
