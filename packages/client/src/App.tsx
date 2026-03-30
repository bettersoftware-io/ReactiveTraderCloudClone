import { Header } from "./layout/header";
import { Footer } from "./layout/footer";
import { Workspace } from "./layout/workspace";
import { ConnectionOverlay } from "./connection/connection-overlay";

export function App() {
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
      <Header />
      <Workspace />
      <Footer />
      <ConnectionOverlay />
    </div>
  );
}
