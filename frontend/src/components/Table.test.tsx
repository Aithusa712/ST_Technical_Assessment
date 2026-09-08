import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
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

const mockSocket = vi.hoisted(() => ({ connected: false, on: vi.fn(), off: vi.fn() }));
vi.mock("../socket", () => ({ socket: mockSocket }));

import axios from "axios";
import Table from "./Table";

const page = (items: any[] = [], overrides = {}) => ({
  items,
  total: items.length,
  page: 1,
  pages: 1,
  ...overrides,
});

const row = (overrides = {}) => ({
  _id: "r1",
  rowId: 1,
  postId: 1,
  name: "Alice",
  email: "alice@example.com",
  body: "hello",
  ...overrides,
});

describe("<Table />", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows a loading state before the fetch resolves", async () => {
    let resolve!: (v: any) => void;
    vi.mocked(axios.get).mockReturnValueOnce(new Promise((r) => (resolve = r)));

    render(<Table />);
    expect(screen.getByText("Loading…")).toBeInTheDocument();

    resolve({ data: page([row()]) });
    await waitFor(() => expect(screen.queryByText("Loading…")).not.toBeInTheDocument());
  });

  it("fetches /api/rows with page, limit and q params on mount", async () => {
    vi.mocked(axios.get).mockResolvedValueOnce({ data: page([row()]) });
    render(<Table />);

    await waitFor(() =>
      expect(axios.get).toHaveBeenCalledWith(
        "/api/rows",
        expect.objectContaining({ params: { page: 1, limit: 25, q: "" } })
      )
    );
  });

  it("shows the upload prompt when empty and no search is active", async () => {
    vi.mocked(axios.get).mockResolvedValueOnce({ data: page([]) });
    render(<Table />);

    expect(await screen.findByText("Upload a CSV to see rows here.")).toBeInTheDocument();
  });

  it('shows a "nothing matches" message when empty with an active search', async () => {
    const user = userEvent.setup();
    vi.mocked(axios.get).mockResolvedValue({ data: page([]) });
    render(<Table />);
    await waitFor(() => expect(axios.get).toHaveBeenCalledTimes(1));

    await user.type(screen.getByPlaceholderText("Search name, email or body"), "zzz");

    expect(await screen.findByText('Nothing matches "zzz".')).toBeInTheDocument();
  });

  it("shows an error message on a non-cancelled fetch failure", async () => {
    vi.mocked(axios.get).mockRejectedValueOnce(new Error("boom"));
    render(<Table />);

    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't load rows.");
  });

  it("does not show an error for a cancelled request", async () => {
    vi.mocked(axios.isCancel).mockReturnValue(true);
    vi.mocked(axios.get).mockRejectedValueOnce(new Error("cancelled"));
    render(<Table />);

    await waitFor(() => expect(axios.get).toHaveBeenCalled());
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("resets the page to 1 when the search query changes", async () => {
    const user = userEvent.setup();
    vi.mocked(axios.get).mockResolvedValue({
      data: page([row()], { page: 2, pages: 3, total: 50 }),
    });
    render(<Table />);
    await waitFor(() => expect(axios.get).toHaveBeenCalledTimes(1));

    await screen.findByText(/Page 2 of 3/);
    await user.click(screen.getByText("Next"));
    await waitFor(() =>
      expect(axios.get).toHaveBeenLastCalledWith(
        "/api/rows",
        expect.objectContaining({ params: expect.objectContaining({ page: 3 }) })
      )
    );

    await user.type(screen.getByPlaceholderText("Search name, email or body"), "a");
    await waitFor(() =>
      expect(axios.get).toHaveBeenLastCalledWith(
        "/api/rows",
        expect.objectContaining({ params: expect.objectContaining({ page: 1, q: "a" }) })
      )
    );
  });

  it("aborts the in-flight request on a newer one, so a stale response can't overwrite it", async () => {
    const user = userEvent.setup();

    vi.mocked(axios.get).mockImplementationOnce((_url, config: any) => {
      return new Promise((_resolve, reject) => {
        config.signal.addEventListener("abort", () => {
          const err: any = new Error("canceled");
          err.__CANCEL__ = true;
          reject(err);
        });
      });
    });
    vi.mocked(axios.isCancel).mockImplementation((err: any) => !!err?.__CANCEL__);

    render(<Table />);
    await waitFor(() => expect(axios.get).toHaveBeenCalledTimes(1));

    vi.mocked(axios.get).mockResolvedValueOnce({ data: page([row({ name: "Newer" })]) });
    await user.type(screen.getByPlaceholderText("Search name, email or body"), "x");

    expect(await screen.findByText("Newer")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  describe("pager", () => {
    it("disables Previous on page 1 and Next on the last page", async () => {
      vi.mocked(axios.get).mockResolvedValueOnce({
        data: page([row()], { page: 1, pages: 1 }),
      });
      render(<Table />);

      expect(await screen.findByText("Previous")).toBeDisabled();
      expect(screen.getByText("Next")).toBeDisabled();
    });

    it("enables both buttons mid-range and pages correctly on click", async () => {
      const user = userEvent.setup();
      vi.mocked(axios.get).mockResolvedValueOnce({
        data: page([row()], { page: 2, pages: 3, total: 50 }),
      });
      render(<Table />);

      expect(await screen.findByText("Previous")).not.toBeDisabled();
      expect(screen.getByText("Next")).not.toBeDisabled();

      vi.mocked(axios.get).mockResolvedValueOnce({
        data: page([row()], { page: 3, pages: 3, total: 50 }),
      });
      await user.click(screen.getByText("Next"));

      await waitFor(() =>
        expect(axios.get).toHaveBeenLastCalledWith(
          "/api/rows",
          expect.objectContaining({ params: expect.objectContaining({ page: 3 }) })
        )
      );
    });
  });

  it("registers a rows:changed socket handler and refetches when it fires", async () => {
    vi.mocked(axios.get).mockResolvedValue({ data: page([row()]) });
    render(<Table />);
    await waitFor(() => expect(axios.get).toHaveBeenCalledTimes(1));

    expect(mockSocket.on).toHaveBeenCalledWith("rows:changed", expect.any(Function));
    const handler = vi.mocked(mockSocket.on).mock.calls.find(([e]) => e === "rows:changed")![1];

    act(() => handler());
    await waitFor(() => expect(axios.get).toHaveBeenCalledTimes(2));
  });

  it("unsubscribes from rows:changed on unmount with the same handler reference", async () => {
    vi.mocked(axios.get).mockResolvedValue({ data: page([row()]) });
    const { unmount } = render(<Table />);
    await waitFor(() => expect(axios.get).toHaveBeenCalledTimes(1));

    const handler = vi.mocked(mockSocket.on).mock.calls.find(([e]) => e === "rows:changed")![1];
    unmount();

    expect(mockSocket.off).toHaveBeenCalledWith("rows:changed", handler);
  });

  it("renders the rowId column for each row", async () => {
    vi.mocked(axios.get).mockResolvedValueOnce({ data: page([row({ rowId: 42 })]) });
    render(<Table />);

    expect(await screen.findByText("42")).toBeInTheDocument();
  });
});
