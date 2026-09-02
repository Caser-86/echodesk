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
    <div style={{ minHeight: "100vh" }}>
      <header style={{ borderBottom: "1px solid var(--border)", padding: "12px 20px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
          <strong>EchoDesk · AI 需求工作台</strong>
          <nav style={{ display: "flex", gap: 16 }}>
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                style={({ isActive }) => ({
                  color: isActive ? "var(--brand)" : "var(--text-muted)",
                  textDecoration: "none",
                })}
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
          <span style={{ marginLeft: "auto", fontSize: 12 }}>
            后端状态：{backend === "ok" ? "已连接" : "未连接"}
          </span>
        </div>
      </header>
      <main style={{ padding: 20 }}>
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