import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Badge from "./Badge";

describe("Badge", () => {
  it("renders children", () => {
    render(<Badge tone="brand">品牌</Badge>);
    expect(screen.getByText("品牌")).toBeInTheDocument();
  });

  it.each([
    ["negative", "badge-negative"],
    ["positive", "badge-positive"],
    ["neutral", "badge-neutral"],
    ["warning", "badge-warning"],
    ["brand", "badge-brand"],
    ["success", "badge-success"],
  ] as const)("applies tone class for %s", (tone, expectedClass) => {
    render(<Badge tone={tone}>{tone}</Badge>);
    expect(screen.getByText(tone)).toHaveClass(expectedClass);
  });

  it("forwards title", () => {
    render(<Badge tone="warning" title="降级提示">mock</Badge>);
    expect(screen.getByTitle("降级提示")).toBeInTheDocument();
  });
});
