import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import Button from "./Button";

describe("Button", () => {
  it("renders children", () => {
    render(<Button>点击我</Button>);
    expect(screen.getByRole("button", { name: "点击我" })).toBeInTheDocument();
  });

  it("handles click", async () => {
    const handleClick = vi.fn();
    render(<Button onClick={handleClick}>点击我</Button>);
    await userEvent.click(screen.getByRole("button"));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it("is disabled", async () => {
    const handleClick = vi.fn();
    render(<Button onClick={handleClick} disabled>点击我</Button>);
    const btn = screen.getByRole("button");
    expect(btn).toBeDisabled();
    await userEvent.click(btn);
    expect(handleClick).not.toHaveBeenCalled();
  });

  it("applies variant class", () => {
    const { rerender } = render(<Button variant="primary">按钮</Button>);
    expect(screen.getByRole("button")).toHaveClass("btn-primary");

    rerender(<Button variant="secondary">按钮</Button>);
    expect(screen.getByRole("button")).toHaveClass("btn-secondary");

    rerender(<Button variant="ghost">按钮</Button>);
    expect(screen.getByRole("button")).toHaveClass("btn-ghost");

    rerender(<Button variant="danger">按钮</Button>);
    expect(screen.getByRole("button")).toHaveClass("btn-danger");
  });

  it("applies size class", () => {
    const { rerender } = render(<Button size="sm">按钮</Button>);
    expect(screen.getByRole("button")).toHaveClass("btn-sm");

    rerender(<Button size="lg">按钮</Button>);
    expect(screen.getByRole("button")).toHaveClass("btn-lg");
  });
});
