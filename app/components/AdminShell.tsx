"use client";

import Link from "next/link";
import { Logo } from "@/components/ui";
import LinkHint from "@/components/LinkHint";

const NAV: [string, string][] = [
  ["/admin", "Overview"],
  ["/admin/users", "Users"],
  ["/admin/ai-quality", "AI quality"],
  ["/admin/audit-log", "Audit log"],
];

export default function AdminShell({ active, children }: { active: string; children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-[#0e1524] text-white/80" style={{ background: "#0e1524" }}>
      <div className="mx-auto flex max-w-[1200px]">
        <aside className="hidden w-[220px] shrink-0 py-8 pl-6 sm:block">
          <Logo dark />
          <nav className="mt-8 space-y-1">
            {NAV.map(([href, label]) => (
              <Link
                key={href}
                href={href}
                className={`block rounded-lg px-3 py-2 text-[13.5px] ${active === label ? "bg-white/10 font-bold text-white" : "hover:bg-white/5"}`}
              >
                {label}
                <LinkHint />
              </Link>
            ))}
          </nav>
          <div className="mt-10 border-t border-white/10 pt-4 text-[12px] leading-relaxed text-white/50">
            Signed in as admin. Every action is written to the audit log. Admins cannot open your notes.
          </div>
        </aside>
        <main className="min-w-0 flex-1 px-6 py-8 sm:px-8">
          <nav className="mb-6 flex gap-3 overflow-x-auto sm:hidden">
            {NAV.map(([href, label]) => (
              <Link key={href} href={href} className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-[13px] ${active === label ? "bg-white/10 font-bold text-white" : "text-white/70"}`}>
                {label}
              </Link>
            ))}
          </nav>
          {children}
        </main>
      </div>
    </div>
  );
}
