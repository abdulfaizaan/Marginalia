import { redirect } from "next/navigation";

// SP1: pricing is gone — the app is free (BYOK). Old links land in the app.
export default function PricingRedirect() {
  redirect("/notes");
}
