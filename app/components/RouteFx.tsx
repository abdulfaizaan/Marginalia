import { ViewTransition, type ViewTransitionProps } from "react";
import type { ReactNode } from "react";

/**
 * Pairs page content into route/Suspense transitions via React's <ViewTransition>.
 * CSS lives in globals.css under ::view-transition-(old|new)(.route).
 * Server-safe (no hooks) — must NOT become a client component or children get clientified.
 * enter={null} / exit={null} disables that side (used for skeletons that appear instantly
 * but animate out when real content reveals).
 */
export default function RouteFx({
  children,
  enter,
  exit,
}: {
  children: ReactNode;
  enter?: string | null;
  exit?: string | null;
}) {
  const props: ViewTransitionProps = {
    default: "none",
    enter: enter === undefined ? "route" : enter || "none",
    exit: exit === undefined ? "route" : exit || "none",
    children,
  };
  return <ViewTransition {...props} />;
}
