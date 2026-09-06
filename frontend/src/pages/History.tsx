import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  deleteReviewSession,
  listReviewSessions,
  saveHandoff,
  saveReviewSession,
  type ReviewSession,
} from "../api";
import { Badge, Button, Card, EmptyState, Stat } from "../components/ui";

function formatSavedAt(timestamp: number): string {
  return new Date(timestamp).toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function HistoryPage() {
  const navigate = useNavigate();
  const [sessions, setSessions] = useState<ReviewSession[]>(() => listReviewSessions());

  function openSession(session: ReviewSession) {
    saveReviewSession(session);
    saveHandoff({
      savedAt: session.savedAt,
      productName: session.productName,
      topics: session.topics,
      stats: session.stats,
    });
    navigate("/review");
  }

  function removeSession(sessionId: string) {
    if (!deleteReviewSession(sessionId)) return;
    setSessions((current) => current.filter((session) => session.sessionId !== sessionId));
  }

  return (
    <section className="container-narrow">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="h2" style={{ marginTop: 0, marginBottom: 4 }}>处理历史</h2>
          <p className="text-muted" style={{ marginTop: 0 }}>
            本地保存最近 12 次分析与审核结果，仅存储在当前浏览器中。
          </p>
        </div>
        <Link to="/insights" style={{ color: "var(--brand)", fontSize: "var(--text-sm)" }}>
          返回洞察
        </Link>
      </div>

      {sessions.length === 0 ? (
        <EmptyState icon="🕘">
          暂无处理历史。完成一次 PRD 生成后，会自动出现在这里。
        </EmptyState>
      ) : (
        <div className="flex flex-col gap-3 mt-4">
          {sessions.map((session) => (
            <Card key={session.sessionId}>
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="h3" style={{ margin: 0 }}>{session.productName || "未命名产品"}</h3>
                    {session.draft !== session.aiDraft ? (
                      <Badge tone="warning">已修改</Badge>
                    ) : (
                      <Badge tone="success">未修改</Badge>
                    )}
                  </div>
                  <p className="text-muted mt-1" style={{ fontSize: "var(--text-xs)" }}>
                    保存于 {formatSavedAt(session.savedAt)} · 会话 {session.sessionId}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="primary" size="sm" onClick={() => openSession(session)}>
                    打开审核
                  </Button>
                  <Button variant="danger" size="sm" onClick={() => removeSession(session.sessionId)}>
                    删除
                  </Button>
                </div>
              </div>
              <div className="flex flex-wrap gap-2 mt-3">
                <Stat label="反馈" value={session.stats.total} />
                <Stat label="主题" value={session.topics.length} />
                <Stat label="任务卡" value={session.taskCards?.length ?? 0} />
                <Stat label="生成耗时" value={`${(session.elapsed / 1000).toFixed(1)}s`} />
              </div>
            </Card>
          ))}
        </div>
      )}
    </section>
  );
}
