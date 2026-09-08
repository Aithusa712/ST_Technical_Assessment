import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { act } from "react";

const mockSocket = vi.hoisted(() => ({ connected: false, on: vi.fn(), off: vi.fn() }));
vi.mock("../socket", () => ({ socket: mockSocket }));

import SocketUpdate from "./SocketUpdate";

const handlerFor = (event: string) =>
  vi.mocked(mockSocket.on).mock.calls.find(([e]) => e === event)![1] as (...a: any[]) => void;

describe("<SocketUpdate />", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("seeds the online status from socket.connected (true)", () => {
    mockSocket.connected = true;
    render(<SocketUpdate />);
    expect(screen.getByText("Online")).toBeInTheDocument();
  });

  it("seeds the online status from socket.connected (false)", () => {
    mockSocket.connected = false;
    render(<SocketUpdate />);
    expect(screen.getByText("Offline")).toBeInTheDocument();
  });

  it("shows Online after a connect event", () => {
    mockSocket.connected = false;
    render(<SocketUpdate />);

    act(() => handlerFor("connect")());
    expect(screen.getByText("Online")).toBeInTheDocument();
  });

  it("shows Offline after a disconnect event", () => {
    mockSocket.connected = true;
    render(<SocketUpdate />);

    act(() => handlerFor("disconnect")());
    expect(screen.getByText("Offline")).toBeInTheDocument();
  });

  it("prepends an activity event to the feed with formatted time", () => {
    render(<SocketUpdate />);

    act(() => handlerFor("activity")({ text: "1 row added", at: Date.now() }));

    expect(screen.getByText("1 row added")).toBeInTheDocument();
  });

  it("shows the empty-feed message when there is no activity yet", () => {
    render(<SocketUpdate />);
    expect(
      screen.getByText("Updates from any session appear here as they happen.")
    ).toBeInTheDocument();
  });

  it("caps the feed at 40 entries, dropping the oldest", () => {
    render(<SocketUpdate />);
    const activity = handlerFor("activity");

    act(() => {
      for (let i = 0; i < 41; i++) activity({ text: `event-${i}`, at: Date.now() + i });
    });

    expect(screen.queryByText("event-0")).not.toBeInTheDocument();
    expect(screen.getByText("event-40")).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(40);
  });

  it("unsubscribes all three handlers on unmount with matching references", () => {
    const { unmount } = render(<SocketUpdate />);
    const connectHandler = handlerFor("connect");
    const disconnectHandler = handlerFor("disconnect");
    const activityHandler = handlerFor("activity");

    unmount();

    expect(mockSocket.off).toHaveBeenCalledWith("connect", connectHandler);
    expect(mockSocket.off).toHaveBeenCalledWith("disconnect", disconnectHandler);
    expect(mockSocket.off).toHaveBeenCalledWith("activity", activityHandler);
  });
});
