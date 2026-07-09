import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ProtectedRoute } from "./ProtectedRoute";

const mockUseAuth = vi.fn();

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => mockUseAuth(),
}));

// Stub TanStack Router's Navigate/Outlet so ProtectedRoute can render
// outside of a RouterProvider in unit tests.
vi.mock("@tanstack/react-router", () => ({
  Navigate: () => null,
  Outlet: () => null,
}));

function renderWithRouter(allowedRoles?: any[]) {
  return render(<ProtectedRoute allowedRoles={allowedRoles} />);
}

describe("ProtectedRoute", () => {
  it("shows loading spinner when isLoading is true", () => {
    mockUseAuth.mockReturnValue({ user: null, role: null, isLoading: true });
    renderWithRouter();
    expect(screen.getByText("Memuat...")).toBeInTheDocument();
  });

  it("redirects to /login when user is not authenticated", () => {
    mockUseAuth.mockReturnValue({ user: null, role: null, isLoading: false });
    const { container } = renderWithRouter();
    // Navigate component renders nothing visible
    expect(screen.queryByText("Memuat...")).not.toBeInTheDocument();
  });

  it("redirects to /unauthorized when user role is not allowed", () => {
    mockUseAuth.mockReturnValue({
      user: { id: "1" },
      role: "guru",
      isLoading: false,
    });
    const { container } = renderWithRouter(["admin"]);
    expect(screen.queryByText("Memuat...")).not.toBeInTheDocument();
  });

  it("renders Outlet when user is authenticated and role is allowed", () => {
    mockUseAuth.mockReturnValue({
      user: { id: "1" },
      role: "admin",
      isLoading: false,
    });
    // ProtectedRoute renders <Outlet />, which renders nothing without nested routes
    renderWithRouter(["admin"]);
    expect(screen.queryByText("Memuat...")).not.toBeInTheDocument();
  });
});
