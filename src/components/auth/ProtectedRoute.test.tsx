import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ProtectedRoute } from "./ProtectedRoute";

const mockUseAuth = vi.fn();

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => mockUseAuth(),
}));

// Stub TanStack Router so we can assert exactly which path/branch was rendered.
vi.mock("@tanstack/react-router", () => ({
  Navigate: ({ to }: { to: string }) => <div data-testid="navigate">{to}</div>,
  Outlet: () => <div data-testid="outlet">Outlet</div>,
}));

function renderWithRouter(allowedRoles?: any[]) {
  return render(<ProtectedRoute allowedRoles={allowedRoles} />);
}

describe("ProtectedRoute", () => {
  it("shows loading spinner when isLoading is true", () => {
    mockUseAuth.mockReturnValue({ user: null, role: null, isLoading: true });
    renderWithRouter();
    expect(screen.getByText("Memuat...")).toBeInTheDocument();
    expect(screen.queryByTestId("outlet")).not.toBeInTheDocument();
  });

  it("redirects to /login when user is not authenticated", () => {
    mockUseAuth.mockReturnValue({ user: null, role: null, isLoading: false });
    renderWithRouter();
    expect(screen.getByTestId("navigate")).toHaveTextContent("/login");
    expect(screen.queryByTestId("outlet")).not.toBeInTheDocument();
  });

  it("fails closed while an authenticated user's role is unresolved", () => {
    mockUseAuth.mockReturnValue({
      user: { id: "1" },
      role: null,
      isLoading: false,
    });
    renderWithRouter(["admin"]);
    expect(screen.getByText("Memuat...")).toBeInTheDocument();
    expect(screen.queryByTestId("outlet")).not.toBeInTheDocument();
  });

  it("redirects to /unauthorized when user role is not allowed", () => {
    mockUseAuth.mockReturnValue({
      user: { id: "1" },
      role: "guru",
      isLoading: false,
    });
    renderWithRouter(["admin"]);
    expect(screen.getByTestId("navigate")).toHaveTextContent("/unauthorized");
    expect(screen.queryByTestId("outlet")).not.toBeInTheDocument();
  });

  it("redirects parent users to /portal when staff route is not allowed", () => {
    mockUseAuth.mockReturnValue({
      user: { id: "1" },
      role: "ortu",
      isLoading: false,
    });
    renderWithRouter(["admin"]);
    expect(screen.getByTestId("navigate")).toHaveTextContent("/portal");
  });

  it("renders Outlet when user is authenticated and role is allowed", () => {
    mockUseAuth.mockReturnValue({
      user: { id: "1" },
      role: "admin",
      isLoading: false,
    });
    renderWithRouter(["admin"]);
    expect(screen.getByTestId("outlet")).toBeInTheDocument();
    expect(screen.queryByTestId("navigate")).not.toBeInTheDocument();
  });
});
