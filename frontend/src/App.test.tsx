import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// App's own orchestration logic (conflict state, tab-blocking) is what's
// under test here — the child components' internals are covered by their
// own spec files, so they're stubbed out to keep this file isolated.
vi.mock("./components/Table", () => ({ default: () => <div>TableStub</div> }));
vi.mock("./components/SocketUpdate", () => ({ default: () => <div>SocketStub</div> }));
vi.mock("./components/CsvUpload", () => ({
  default: ({ onUploaded, onFinished }: any) => (
    <div>
      <span>UploadStub</span>
      <button onClick={() => onUploaded([{ rowId: 1, incoming: {}, changes: [] }])}>
        simulate-upload-with-conflict
      </button>
      <button
        onClick={() =>
          onUploaded([
            { rowId: 1, incoming: {}, changes: [] },
            { rowId: 2, incoming: {}, changes: [] },
          ])
        }
      >
        simulate-upload-with-two-conflicts
      </button>
      <button onClick={() => onUploaded([])}>simulate-upload-no-conflicts</button>
      <button onClick={onFinished}>simulate-finished</button>
    </div>
  ),
}));
vi.mock("./components/Conflict", () => ({
  default: ({ conflicts, onConflictsChange }: any) => (
    <div>
      <span>ConflictDialogStub</span>
      <span>count:{conflicts.length}</span>
      <button onClick={() => onConflictsChange([])}>simulate-resolve-all</button>
      <button onClick={() => onConflictsChange(conflicts.slice(1))}>simulate-resolve-one</button>
    </div>
  ),
}));

import App from "./App";

describe("<App />", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders unblocked with no conflicts on a fresh mount", () => {
    render(<App />);
    expect(screen.getByText("TableStub")).toBeInTheDocument();
    expect(screen.queryByText("ConflictDialogStub")).not.toBeInTheDocument();
  });

  it("switching to Update tab shows the upload stub, and its onFinished switches back to view", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("tab", { name: "Update" }));
    expect(screen.getByText("UploadStub")).toBeInTheDocument();

    await user.click(screen.getByText("simulate-finished"));
    expect(await screen.findByText("TableStub")).toBeInTheDocument();
  });

  it("ignores an upload with no conflicts", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("tab", { name: "Update" }));

    await user.click(screen.getByText("simulate-upload-no-conflicts"));

    expect(screen.queryByText("ConflictDialogStub")).not.toBeInTheDocument();
  });

  it("an upload with a conflict blocks the tabs and opens the dialog", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("tab", { name: "Update" }));

    await user.click(screen.getByText("simulate-upload-with-conflict"));

    expect(await screen.findByText("ConflictDialogStub")).toBeInTheDocument();
    expect(screen.getByText("count:1")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "View" })).toBeDisabled();
    expect(screen.getByRole("tab", { name: "Update" })).toBeDisabled();
    expect(screen.getByRole("tab", { name: "View" })).toHaveAttribute(
      "title",
      "Resolve the conflicts first"
    );
  });

  it("resolving down to an empty list unblocks the tabs", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("tab", { name: "Update" }));
    await user.click(screen.getByText("simulate-upload-with-conflict"));
    await screen.findByText("ConflictDialogStub");

    await user.click(screen.getByText("simulate-resolve-all"));

    expect(screen.queryByText("ConflictDialogStub")).not.toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "View" })).not.toBeDisabled();
  });

  it("resolving one of several conflicts keeps the dialog open with the remaining list", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("tab", { name: "Update" }));
    await user.click(screen.getByText("simulate-upload-with-two-conflicts"));
    await screen.findByText("count:2");

    await user.click(screen.getByText("simulate-resolve-one"));

    expect(await screen.findByText("count:1")).toBeInTheDocument();
    expect(screen.getByText("ConflictDialogStub")).toBeInTheDocument();
  });
});
