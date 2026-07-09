/**
 * react-router-dom compatibility layer on top of TanStack Router.
 *
 * Lets existing components keep the familiar react-router API
 * (`navigate("/x")`, `navigate(-1)`, `useParams()`, `useSearchParams()`, …)
 * while the app runs on TanStack Start. Import from "@/lib/router-compat"
 * instead of "react-router-dom".
 */
import { forwardRef } from "react";
import {
  Link as TanstackLink,
  Navigate,
  Outlet,
  useLocation,
  useParams as useTanstackParams,
  useRouter,
} from "@tanstack/react-router";
import type { ComponentProps } from "react";

export { Navigate, Outlet, useLocation };

type NavigateOptions = { replace?: boolean };

/** react-router-style navigate: string path or delta number. */
export function useNavigate() {
  const router = useRouter();
  return (to: string | number, options?: NavigateOptions) => {
    if (typeof to === "number") {
      router.history.go(to);
      return;
    }
    if (options?.replace) {
      router.history.replace(to);
    } else {
      router.history.push(to);
    }
  };
}

/** react-router-style useParams — returns the current route params. */
export function useParams<
  T extends Record<string, string | undefined> = Record<string, string | undefined>,
>(): T {
  return useTanstackParams({ strict: false }) as T;
}

/** react-router-style useSearchParams — read-only URLSearchParams + setter. */
export function useSearchParams(): [
  URLSearchParams,
  (next: URLSearchParams | string, options?: NavigateOptions) => void,
] {
  const location = useLocation();
  const router = useRouter();
  const searchParams = new URLSearchParams(location.searchStr ?? "");

  const setSearchParams = (
    next: URLSearchParams | string,
    options?: NavigateOptions,
  ) => {
    const qs = typeof next === "string" ? next : next.toString();
    const url = `${location.pathname}${qs ? `?${qs}` : ""}`;
    if (options?.replace) {
      router.history.replace(url);
    } else {
      router.history.push(url);
    }
  };

  return [searchParams, setSearchParams];
}

/** react-router-style Link that accepts a plain string `to`. */
type LinkProps = Omit<ComponentProps<typeof TanstackLink>, "to"> & {
  to: string;
};

export const Link = forwardRef<HTMLAnchorElement, LinkProps>(
  ({ to, ...props }, ref) => (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    <TanstackLink ref={ref} to={to as any} {...(props as any)} />
  ),
);
Link.displayName = "Link";
