import React from "react";
import { createRoot } from "react-dom/client";
import EmissionDiagramTool from "./EmissionDiagramTool.jsx";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <EmissionDiagramTool />
  </React.StrictMode>
);
