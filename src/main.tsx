import React, { Suspense, lazy } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource-variable/golos-text";
import "@fontsource/ibm-plex-mono/400.css";
import "./styles.css";
import "./readability.css";
import "./workspace.css";
import Workspace from "./workspace";

const Prototype = lazy(() => import("./prototype"));
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {import.meta.env.DEV && (window.location.pathname === "/design" ||
    new URLSearchParams(location.search).has("v")) ? (
      <Suspense fallback={<p>Загрузка макета…</p>}>
        <Prototype />
      </Suspense>
    ) : (
      <Workspace />
    )}
  </React.StrictMode>,
);
