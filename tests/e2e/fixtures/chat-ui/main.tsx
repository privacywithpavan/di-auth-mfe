import { createRoot } from "react-dom/client";
import { ChatHost } from "./chat-host";
import "./theme.css";

const root = document.getElementById("root");
if (!root?.dataset.mfeOrigin || !root.dataset.clientId) {
  throw new Error("The chat fixture requires an MFE origin and client ID.");
}
createRoot(root).render(
  <ChatHost
    mfeOrigin={root.dataset.mfeOrigin}
    clientId={root.dataset.clientId}
  />,
);
