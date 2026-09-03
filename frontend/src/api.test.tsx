import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import {
  consumeImportHandoff,
  saveImportHandoff,
  loadHandoff,
  saveHandoff,
  loadReviewSession,
  saveReviewSession,
  usePingBackend,
} from "./api";

function mockStorage() {
  const store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { Object.keys(store).forEach((k) => delete store[k]); },
  };
}

describe("localStorage handoff helpers", () => {
  let storage: ReturnType<typeof mockStorage>;

  beforeEach(() => {
    storage = mockStorage();
    vi.stubGlobal("localStorage", storage);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("save and consume import handoff", () => {
    const data = { savedAt: 1, filename: "test.csv", texts: ["a", "b"] };
    saveImportHandoff(data);
    expect(consumeImportHandoff()).toEqual(data);
    expect(consumeImportHandoff()).toBeNull();
  });

  it("consume returns null when nothing stored", () => {
    expect(consumeImportHandoff()).toBeNull();
  });

  it("ignores corrupted import handoff", () => {
    storage.setItem("echodesk:imported-texts", "not-json");
    expect(consumeImportHandoff()).toBeNull();
  });

  it("save and load PRD handoff", () => {
    const data = {
      savedAt: 2,
      productName: "P",
      topics: [],
      stats: { total: 1, n_clusters: 1, noise_count: 0, method: "hdbscan", embed_backend: "local" },
    };
    saveHandoff(data);
    expect(loadHandoff()).toEqual(data);
  });

  it("save and load review session", () => {
    const data = {
      savedAt: 3,
      sessionId: "s-1",
      productName: "P",
      aiDraft: "draft",
      draft: "edited",
      elapsed: 10,
      topics: [],
      stats: { total: 1, n_clusters: 1, noise_count: 0, method: "hdbscan", embed_backend: "local" },
    };
    saveReviewSession(data);
    expect(loadReviewSession()).toEqual(data);
  });

  it("saveReviewSession swallows quota errors (does not throw)", () => {
    // 模拟 localStorage 配额写满：setItem 抛 QuotaExceededError
    const quotaStorage = mockStorage();
    vi.stubGlobal("localStorage", {
      ...quotaStorage,
      setItem: () => { throw new DOMException("quota", "QuotaExceededError"); },
    });
    const data = {
      savedAt: 3,
      sessionId: "s-1",
      productName: "P",
      aiDraft: "draft",
      draft: "edited",
      elapsed: 10,
      topics: [],
      stats: { total: 1, n_clusters: 1, noise_count: 0, method: "hdbscan", embed_backend: "local" },
    };
    // 不应抛出，也不应中断流程
    expect(() => saveReviewSession(data)).not.toThrow();
  });
});

describe("usePingBackend", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function MockPing() {
    const status = usePingBackend();
    return <span data-testid="status">{status}</span>;
  }

  it("returns ok when health endpoint succeeds", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
    render(<MockPing />);
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("ok"));
  });

  it("returns down when health endpoint fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
    render(<MockPing />);
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("未连接"));
  });

  it("returns down when fetch throws", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network")));
    render(<MockPing />);
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("未连接"));
  });
});
