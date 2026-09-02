import { Routes, Route, NavLink } from "react-router-dom";
import ImportPage from "./pages/Import";
import InsightsPage from "./pages/Insights";
import ReviewPage from "./pages/Review";
import ExportPage from "./pages/Export";
import { usePingBackend } from "./api";

const navItems = [
  { to: "/", label: "导入数据", end: true },
  { to: "/insights", label: "洞察主题" },
  { to: "/review", label: "PRD 审核" },
  { to: "/export", label: "导出" },
];

export default function App() {
  const backend = usePingBackend();

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <header
        style={{
          position: "sticky",
          top: 0,
          zIndex: 50,
          height: "var(--header-h)",
          background: "rgba(255,255,255,0.92)",
          backdropFilter: "blur(8px)",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <div className="container flex items-center justify-between" style={{ height: "100%" }}>
          <div className="flex items-center gap-3">
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 9,
                background: "linear-gradient(135deg, var(--brand), #7c3aed)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#fff",
                fontWeight: 700,
                fontSize: 15,
              }}
            >
              E
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: "var(--text-md)", lineHeight: 1 }}>EchoDesk</div>
              <div style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)", marginTop: 2 }}>AI 需求工作台</div>
            </div>
          </div>

          <nav className="flex items-center" style={{ gap: 6 }}>
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) => (isActive ? "nav-link active" : "nav-link")}
              >
                {item.label}
              </NavLink>
            ))}
          </nav>

          <div className="flex items-center gap-2" style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>
            <span
              style={{
                width: 7,
                height: 7,
                borderRadius: "50%",
                background: backend === "ok" ? "var(--success)" : "var(--danger)",
              }}
            />
            后端 {backend === "ok" ? "已连接" : "未连接"}
          </div>
        </div>
      </header>

      <main style={{ flex: 1, padding: "24px 0 40px" }}>
        <Routes>
          <Route path="/" element={<ImportPage />} />
          <Route path="/insights" element={<InsightsPage />} />
          <Route path="/review" element={<ReviewPage />} />
          <Route path="/export" element={<ExportPage />} />
        </Routes>
      </main>
    </div>
  );
}
