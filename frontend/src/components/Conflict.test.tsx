import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("axios", () => {
  const mockAxios = {
    get: vi.fn(),
    post: vi.fn(),
    isCancel: vi.fn(() => false),
    isAxiosError: vi.fn(() => false),
    defaults: {},
  };
  return { default: mockAxios };
});

import axios from "axios";
import ConflictDialog, { type Conflict } from "./Conflict";

const conflicts: Conflict[] = [
  {
    rowId: 1,
    incoming: { postId: 1, name: "Alice", email: "a2@b.com", body: "hi" },
    changes: [{ field: "email", oldValue: "a@b.com", newValue: "a2@b.com" }],
  },
  {
    rowId: 2,
    incoming: { postId: 1, name: "Bobby", email: "b@b.com", body: "yo" },
    changes: [{ field: "name", oldValue: "Bob", newValue: "Bobby" }],
  },
];

describe("<ConflictDialog />", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders a changes table per conflict", () => {
    render(<ConflictDialog conflicts={conflicts} onConflictsChange={vi.fn()} />);

    expect(screen.getByText("id 1")).toBeInTheDocument();
    expect(screen.getByText("id 2")).toBeInTheDocument();
    expect(screen.getByText("a@b.com")).toBeInTheDocument();
    expect(screen.getByText("a2@b.com")).toBeInTheDocument();
  });

  it("Delete removes the conflict locally with no network call at all", async () => {
    const user = userEvent.setup();
    const onConflictsChange = vi.fn();
    render(<ConflictDialog conflicts={conflicts} onConflictsChange={onConflictsChange} />);

    await user.click(screen.getAllByText("Delete")[0]);

    expect(axios.post).not.toHaveBeenCalled();
    expect(onConflictsChange).toHaveBeenCalledWith([conflicts[1]]);
  });

  it("Keep posts rowId+incoming to /api/conflicts/resolve and reports the list minus that conflict", async () => {
    const user = userEvent.setup();
    const onConflictsChange = vi.fn();
    vi.mocked(axios.post).mockResolvedValueOnce({ data: { ok: true } });
    render(<ConflictDialog conflicts={conflicts} onConflictsChange={onConflictsChange} />);

    await user.click(screen.getAllByText("Keep")[0]);

    expect(axios.post).toHaveBeenCalledWith("/api/conflicts/resolve", {
      rowId: 1,
      incoming: conflicts[0].incoming,
    });
    await waitFor(() => expect(onConflictsChange).toHaveBeenCalledWith([conflicts[1]]));
  });

  it("Keep all posts every conflict's rowId+incoming to /api/conflicts/keep-all and clears the list", async () => {
    const user = userEvent.setup();
    const onConflictsChange = vi.fn();
    vi.mocked(axios.post).mockResolvedValueOnce({ data: { ok: true, resolved: 2 } });
    render(<ConflictDialog conflicts={conflicts} onConflictsChange={onConflictsChange} />);

    await user.click(screen.getByText("Keep all"));

    expect(axios.post).toHaveBeenCalledWith("/api/conflicts/keep-all", {
      conflicts: [
        { rowId: 1, incoming: conflicts[0].incoming },
        { rowId: 2, incoming: conflicts[1].incoming },
      ],
    });
    await waitFor(() => expect(onConflictsChange).toHaveBeenCalledWith([]));
  });

  it("Cancel clears the list locally with no network call at all", async () => {
    const user = userEvent.setup();
    const onConflictsChange = vi.fn();
    render(<ConflictDialog conflicts={conflicts} onConflictsChange={onConflictsChange} />);

    await user.click(screen.getByText("Cancel"));

    expect(axios.post).not.toHaveBeenCalled();
    expect(onConflictsChange).toHaveBeenCalledWith([]);
  });

  it("disables Keep/Keep-all/Delete while a Keep-all request is in flight", async () => {
    const user = userEvent.setup();
    let resolve!: (v: any) => void;
    vi.mocked(axios.post).mockReturnValueOnce(new Promise((r) => (resolve = r)));
    render(<ConflictDialog conflicts={conflicts} onConflictsChange={vi.fn()} />);

    await user.click(screen.getByText("Keep all"));

    expect(screen.getByText("Keep all")).toBeDisabled();
    expect(screen.getByText("Cancel")).toBeDisabled();
    expect(screen.getAllByText("Delete")[0]).toBeDisabled();

    resolve({ data: { ok: true } });
    await waitFor(() => expect(screen.getByText("Keep all")).not.toBeDisabled());
  });

  it("shows the server error and does not call onConflictsChange on a failed Keep", async () => {
    const user = userEvent.setup();
    const onConflictsChange = vi.fn();
    vi.mocked(axios.isAxiosError).mockReturnValue(true);
    vi.mocked(axios.post).mockRejectedValueOnce({ response: { data: { error: "Nope" } } });
    render(<ConflictDialog conflicts={conflicts} onConflictsChange={onConflictsChange} />);

    await user.click(screen.getAllByText("Keep")[0]);

    expect(await screen.findByRole("alert")).toHaveTextContent("Nope");
    expect(onConflictsChange).not.toHaveBeenCalled();
  });

  it("falls back to a generic error message for a non-axios failure", async () => {
    const user = userEvent.setup();
    vi.mocked(axios.isAxiosError).mockReturnValue(false);
    vi.mocked(axios.post).mockRejectedValueOnce(new Error("network down"));
    render(<ConflictDialog conflicts={conflicts} onConflictsChange={vi.fn()} />);

    await user.click(screen.getByText("Keep all"));

    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't apply that.");
  });

  it("locks page scroll on mount and restores it on unmount", () => {
    const { unmount } = render(<ConflictDialog conflicts={conflicts} onConflictsChange={vi.fn()} />);
    expect(document.body.style.overflow).toBe("hidden");

    unmount();
    expect(document.body.style.overflow).toBe("");
  });
});
