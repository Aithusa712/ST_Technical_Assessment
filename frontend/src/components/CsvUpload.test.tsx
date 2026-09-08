import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent, act } from "@testing-library/react";

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
import CsvUpload from "./CsvUpload";

const file = (size: number, name = "rows.csv") => {
  const f = new File(["x".repeat(Math.max(size, 1))], name, { type: "text/csv" });
  Object.defineProperty(f, "size", { value: size });
  return f;
};

const selectFile = (input: HTMLElement, f: File) => {
  fireEvent.change(input, { target: { files: [f] } });
};

describe("<CsvUpload />", () => {
  const onFinished = vi.fn();
  const onUploaded = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const getInput = () => document.querySelector("input[type=file]") as HTMLInputElement;

  it("rejects an empty file without calling axios", async () => {
    render(<CsvUpload onFinished={onFinished} onUploaded={onUploaded} />);
    selectFile(getInput(), file(0));

    expect(await screen.findByRole("alert")).toHaveTextContent("That file is empty.");
    expect(axios.post).not.toHaveBeenCalled();
  });

  it("rejects a file over 25MB without calling axios", async () => {
    render(<CsvUpload onFinished={onFinished} onUploaded={onUploaded} />);
    selectFile(getInput(), file(25 * 1024 * 1024 + 1));

    expect(await screen.findByRole("alert")).toHaveTextContent("Files are limited to 25 MB.");
    expect(axios.post).not.toHaveBeenCalled();
  });

  it("posts the file as text/csv on a valid selection", async () => {
    vi.mocked(axios.post).mockResolvedValueOnce({
      data: { added: 1, unchanged: 0, conflicts: [] },
    });
    render(<CsvUpload onFinished={onFinished} onUploaded={onUploaded} />);
    selectFile(getInput(), file(10));

    await waitFor(() => expect(axios.post).toHaveBeenCalled());
    expect(axios.post).toHaveBeenCalledWith(
      "/api/upload",
      expect.anything(),
      expect.objectContaining({ headers: { "Content-Type": "text/csv" } })
    );
  });

  it("calls onUploaded with just the conflicts array on success", async () => {
    const conflicts = [{ rowId: 1, incoming: { postId: 1, name: "A", email: "a@b.com", body: "x" }, changes: [] }];
    vi.mocked(axios.post).mockResolvedValueOnce({
      data: { added: 0, unchanged: 0, conflicts },
    });
    render(<CsvUpload onFinished={onFinished} onUploaded={onUploaded} />);
    selectFile(getInput(), file(10));

    await waitFor(() => expect(onUploaded).toHaveBeenCalledWith(conflicts));
  });

  it("shows the added/unchanged/conflicts summary on success", async () => {
    vi.mocked(axios.post).mockResolvedValueOnce({
      data: { added: 2, unchanged: 1, conflicts: [{ rowId: 1, incoming: {}, changes: [] }] },
    });
    render(<CsvUpload onFinished={onFinished} onUploaded={onUploaded} />);
    selectFile(getInput(), file(10));

    expect(await screen.findByText("2 added · 1 unchanged · 1 need review")).toBeInTheDocument();
  });

  it("calls onFinished after 1400ms following a successful upload", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.mocked(axios.post).mockResolvedValueOnce({
      data: { added: 1, unchanged: 0, conflicts: [] },
    });
    render(<CsvUpload onFinished={onFinished} onUploaded={onUploaded} />);
    selectFile(getInput(), file(10));

    await waitFor(() => expect(onUploaded).toHaveBeenCalled());
    expect(onFinished).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1400);
    });
    expect(onFinished).toHaveBeenCalledTimes(1);
  });

  it("does not call onFinished if unmounted before the timer fires", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.mocked(axios.post).mockResolvedValueOnce({
      data: { added: 1, unchanged: 0, conflicts: [] },
    });
    const { unmount } = render(<CsvUpload onFinished={onFinished} onUploaded={onUploaded} />);
    selectFile(getInput(), file(10));

    await waitFor(() => expect(onUploaded).toHaveBeenCalled());
    unmount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1400);
    });

    expect(onFinished).not.toHaveBeenCalled();
  });

  it("shows the server's error message on failure", async () => {
    vi.mocked(axios.isAxiosError).mockReturnValue(true);
    vi.mocked(axios.post).mockRejectedValueOnce({ response: { data: { error: "Bad file" } } });
    render(<CsvUpload onFinished={onFinished} onUploaded={onUploaded} />);
    selectFile(getInput(), file(10));

    expect(await screen.findByText("Bad file")).toBeInTheDocument();
  });

  it("falls back to a generic error message when none is provided", async () => {
    vi.mocked(axios.isAxiosError).mockReturnValue(false);
    vi.mocked(axios.post).mockRejectedValueOnce(new Error("network down"));
    render(<CsvUpload onFinished={onFinished} onUploaded={onUploaded} />);
    selectFile(getInput(), file(10));

    expect(await screen.findByText("Upload failed.")).toBeInTheDocument();
  });

  it("renders up to 10 row errors plus an overflow count", async () => {
    vi.mocked(axios.isAxiosError).mockReturnValue(true);
    const errors = Array.from({ length: 12 }, (_, i) => `Line ${i + 2}: bad row.`);
    vi.mocked(axios.post).mockRejectedValueOnce({
      response: { data: { error: "Fix these rows and upload again.", errors } },
    });
    render(<CsvUpload onFinished={onFinished} onUploaded={onUploaded} />);
    selectFile(getInput(), file(10));

    await screen.findByText("Fix these rows and upload again.");
    expect(screen.getAllByRole("listitem")).toHaveLength(11); // 10 errors + "and 2 more"
    expect(screen.getByText("and 2 more")).toBeInTheDocument();
  });

  it("ignores a non-string-array errors payload", async () => {
    vi.mocked(axios.isAxiosError).mockReturnValue(true);
    vi.mocked(axios.post).mockRejectedValueOnce({
      response: { data: { error: "Bad file", errors: "not-an-array" } },
    });
    render(<CsvUpload onFinished={onFinished} onUploaded={onUploaded} />);
    selectFile(getInput(), file(10));

    await screen.findByText("Bad file");
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });

  it("clears progress and remounts the file input after a failed upload", async () => {
    vi.mocked(axios.isAxiosError).mockReturnValue(true);
    vi.mocked(axios.post).mockRejectedValueOnce({ response: { data: { error: "boom" } } });
    render(<CsvUpload onFinished={onFinished} onUploaded={onUploaded} />);
    const before = getInput();
    selectFile(before, file(10));

    await screen.findByText("boom");
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    // key bump remounts the input node
    expect(getInput()).not.toBe(before);
  });
});
