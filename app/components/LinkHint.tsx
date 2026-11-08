"use client";

import { useLinkStatus } from "next/link";

/**
 * Fixed-size pending dot — must be rendered INSIDE a <Link> as a descendant
 * (useLinkStatus requirement). Debounced 250ms: only shows when a navigation
 * actually takes longer than a fast swap, per the docs' fast-navigation recipe.
 */
export default function LinkHint() {
  const { pending } = useLinkStatus();
  return <span aria-hidden className={"link-hint" + (pending ? " is-pending" : "")} />;
}
