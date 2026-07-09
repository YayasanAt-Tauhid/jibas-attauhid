import { Link, useLocation } from "@tanstack/react-router";
import { forwardRef } from "react";
import { cn } from "@/lib/utils";

interface NavLinkCompatProps {
  to: string;
  className?: string;
  activeClassName?: string;
  pendingClassName?: string;
  children?: React.ReactNode;
  [key: string]: unknown;
}

const NavLink = forwardRef<HTMLAnchorElement, NavLinkCompatProps>(
  ({ className, activeClassName, pendingClassName, to, ...props }, ref) => {
    const { pathname } = useLocation();
    const isActive = pathname === to || pathname.startsWith(to + "/");
    return (
      <Link
        ref={ref}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        to={to as any}
        className={cn(className, isActive && activeClassName)}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        {...(props as any)}
      />
    );
  },
);

NavLink.displayName = "NavLink";

export { NavLink };
