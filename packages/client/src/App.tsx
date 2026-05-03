import { useState } from "react";
import { Header, type WorkspaceTab } from "./layout/Header";
import { Footer } from "./layout/Footer";
import { Workspace } from "./layout/Workspace";
import { ConnectionOverlay } from "./connection/ConnectionOverlay";

export function App() {
  const [activeTab, setActiveTab] = useState<WorkspaceTab>("fx");

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        backgroundColor: "var(--bg-primary)",
        color: "var(--text-primary)",
      }}
    >
      <Header activeTab={activeTab} onTabChange={setActiveTab} />
      <Workspace activeTab={activeTab} />
      <Footer />
      <ConnectionOverlay />
    </div>
  );
}
