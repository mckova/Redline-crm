import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { IconContext } from "@phosphor-icons/react";
import "@fontsource/instrument-sans/latin-400.css";
import "@fontsource/instrument-sans/latin-500.css";
import "@fontsource/instrument-sans/latin-600.css";
import "@fontsource/heebo/hebrew-400.css";
import "@fontsource/heebo/hebrew-500.css";
import "@fontsource/heebo/hebrew-600.css";
import App from "./App";
import { StoreProvider } from "./store";
import "./theme";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <StoreProvider>
        <IconContext.Provider value={{ weight: "light" }}>
          <App />
        </IconContext.Provider>
      </StoreProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
