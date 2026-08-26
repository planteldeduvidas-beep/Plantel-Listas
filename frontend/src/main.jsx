import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import "./styles.css";

const elementoRaiz = document.getElementById("root");
const raiz = createRoot(elementoRaiz);

raiz.render(
  <StrictMode>
    <App />
  </StrictMode>
);

