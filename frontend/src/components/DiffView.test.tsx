import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import DiffView from "./DiffView";

describe("DiffView", () => {
  it("renders unchanged lines in both columns", () => {
    render(<DiffView before={"line1\nline2"} after={"line1\nline2"} />);
    expect(screen.getAllByText("line1")).toHaveLength(2);
    expect(screen.getAllByText("line2")).toHaveLength(2);
  });

  it("renders removed lines", () => {
    render(<DiffView before="old line" after="" />);
    expect(screen.getByText("old line")).toHaveClass("diff-removed");
  });

  it("renders added lines", () => {
    render(<DiffView before="" after="new line" />);
    expect(screen.getByText("new line")).toHaveClass("diff-added");
  });

  it("renders column headers", () => {
    render(<DiffView before="a" after="b" />);
    expect(screen.getByText("AI 原稿")).toBeInTheDocument();
    expect(screen.getByText("人工修改后")).toBeInTheDocument();
  });
});
