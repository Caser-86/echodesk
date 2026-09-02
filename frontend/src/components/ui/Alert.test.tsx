import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Alert from "./Alert";

describe("Alert", () => {
  it("renders children", () => {
    render(<Alert tone="info">提示信息</Alert>);
    expect(screen.getByText("提示信息")).toBeInTheDocument();
  });

  it.each([
    ["danger", "alert-danger"],
    ["warning", "alert-warning"],
    ["info", "alert-info"],
    ["success", "alert-success"],
  ] as const)("applies tone class for %s", (tone, expectedClass) => {
    render(<Alert tone={tone}>{tone}</Alert>);
    expect(screen.getByText(tone)).toHaveClass(expectedClass);
  });

  it("renders title when provided", () => {
    render(<Alert tone="danger" title="出错了">详情</Alert>);
    expect(screen.getByText("出错了")).toBeInTheDocument();
    expect(screen.getByText("详情")).toBeInTheDocument();
  });
});
