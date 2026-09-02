"""API 层集成测试：覆盖管线端点的典型成功与错误路径。"""

from fastapi.testclient import TestClient

from app.main import create_app


client = TestClient(create_app())


def test_health():
    resp = client.get("/api/health")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "ok"


def test_clean_endpoint():
    resp = client.post("/api/pipeline/clean", json={"texts": ["  hello  ", "", "hello", "world"]})
    assert resp.status_code == 200
    data = resp.json()
    assert data["stage"] == "clean"
    assert data["status"] == "ok"
    assert data["original_count"] == 4
    assert data["valid_count"] == 2
    assert data["dropped_empty"] == 1
    assert data["dropped_duplicate"] == 1


def test_clean_rejects_non_list_texts():
    resp = client.post("/api/pipeline/clean", json={"texts": "not-a-list"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "error"
    assert "数组" in data["message"]


def test_cluster_endpoint():
    texts = ["登录很慢", "登录失败", "导出乱码", "导出格式不对", "客服不回复", "客服排队久"]
    resp = client.post("/api/pipeline/cluster", json={"texts": texts, "min_samples": 2})
    assert resp.status_code == 200
    data = resp.json()
    assert data["stage"] == "cluster"
    assert data["status"] == "ok"
    assert data["total"] == len(texts)
    assert data["n_clusters"] >= 1
    assert "topics" in data
    assert data["llm"]["llm_mode"] == "mock"


def test_cluster_rejects_empty_texts():
    resp = client.post("/api/pipeline/cluster", json={"texts": []})
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "error"


def test_cluster_rejects_non_list_texts():
    resp = client.post("/api/pipeline/cluster", json={"texts": "hello"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "error"


def test_prd_gen_endpoint():
    topics = [
        {
            "name": "登录问题",
            "description": "用户无法正常登录",
            "sentiment": "negative",
            "size": 5,
            "representative": "登录一直失败",
            "samples": ["登录失败", "密码错误"],
        }
    ]
    resp = client.post("/api/pipeline/prd-gen", json={"product_name": "Test", "topics": topics})
    assert resp.status_code == 200
    data = resp.json()
    assert data["stage"] == "prd_gen"
    assert data["status"] == "ok"
    assert "[mock]" in data["prd_markdown"]
    assert data["llm"]["llm_mode"] == "mock"


def test_prd_gen_rejects_empty_topics():
    resp = client.post("/api/pipeline/prd-gen", json={"product_name": "Test", "topics": []})
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "error"


def test_import_csv_endpoint():
    csv = "feedback\n登录很慢\n导出失败".encode("utf-8")
    resp = client.post("/api/pipeline/import?has_header=true", files={"file": ("test.csv", csv, "text/csv")})
    assert resp.status_code == 200
    data = resp.json()
    assert data["stage"] == "ingest"
    assert data["status"] == "ok"
    assert data["format"] == "csv"
    assert data["n_rows"] == 2


def test_import_missing_file():
    resp = client.post("/api/pipeline/import")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "error"
    assert "未收到文件" in data["message"]


def test_review_log_endpoint_and_stats():
    resp = client.post("/api/review-log", json={"event": "prd_generated", "payload": {"session_id": "s1"}})
    assert resp.status_code == 200
    assert resp.json()["status"] == "ok"

    resp = client.post("/api/review-log", json={"event": "prd_downloaded", "payload": {"session_id": "s1"}})
    assert resp.status_code == 200

    resp = client.get("/api/review-log/stats")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "ok"
    assert data["prd_generated"] >= 1
    assert data["prd_downloaded"] >= 1


def test_review_log_rejects_unknown_event():
    resp = client.post("/api/review-log", json={"event": "unknown", "payload": {}})
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "error"
