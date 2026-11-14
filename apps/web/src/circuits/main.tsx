import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource-variable/geist";
import "@fontsource-variable/jetbrains-mono";
import "./studio.css";
import { Studio } from "./Studio";

document.title = "TSCI Code: Circuit workspace";
document.documentElement.removeAttribute("data-theme-selected");
export const startup = Promise.resolve().then(() => {
  const root = document.getElementById("root");
  if (!root) throw new Error("The application root is missing.");
  createRoot(root).render(
    <StrictMode>
      <Studio />
    </StrictMode>,
  );
});
