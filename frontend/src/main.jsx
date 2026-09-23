import React, { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import InstalacaoPwa from "./pwa/InstalacaoPwa.jsx";
import "./styles.css";

const elementoRaiz = document.getElementById("root");
const raiz = createRoot(elementoRaiz);

raiz.render(
  <StrictMode>
    <App />
    <InstalacaoPwa />
  </StrictMode>
);

