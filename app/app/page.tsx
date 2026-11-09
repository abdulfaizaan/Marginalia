import Link from "next/link";
import { Logo, btnDark, btnPrimary, btnGhost } from "@/components/ui";
import RouteFx from "@/components/RouteFx";
import LinkHint from "@/components/LinkHint";

const FEATURES = [
  {
    title: "Think with You",
    body: "Marginalia watches as you write and speaks up in the margin: a question, a challenge to a premise, or a flag on a likely mistake. You choose how often, from Slow to Frequent.",
    icon: "menu_book",
  },
  {
    title: "Ask mode",
    body: "Prefer silence? The AI stays quiet until you select a line and choose Probe this, or open Ask Marginalia. Stuck problems get a hint first, never the answer unless you ask.",
    icon: "forum",
  },
  {
    title: "Step-through visuals",
    body: "Ask for a diagram, grid or sketch and move through it one stage at a time, like filling a dynamic programming table cell by cell.",
    icon: "grid_view",
  },
];
const PERSONAS = [
  { t: "Learners", b: "Take lecture notes or work through a coding problem and get hints that point you at the gap." },
  { t: "Creators", b: "Develop a video or project idea with an AI that plays antagonist and pushes on weak assumptions." },
  { t: "Reflective writers", b: "Keep a private journal and ask for perspective only when you want it." },
];

export default function Landing() {
  return (
    <RouteFx>
      <main>
      <header className="sticky top-0 z-30 border-b border-line bg-paper">
        <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
          <Logo />
          <div className="flex items-center gap-5 text-[14px] font-semibold text-ink-soft">
            <a href="#features" className="hover:text-ink">Features</a>
            <a href="#who" className="hover:text-ink">Who it is for</a>
            <Link href="/sign-in" className="hover:text-ink">Sign in<LinkHint /></Link>
            <Link href="/sign-in?mode=signup" className={btnDark + " !px-4 !h-9 !text-[13.5px]"}>Start writing</Link>
          </div>
        </nav>
      </header>

      <section className="mx-auto max-w-6xl px-5 pb-16 pt-16">
        <span className="mb-6 inline-flex items-center rounded-full bg-[var(--chip-dir-bg)] px-3 py-1 text-[12px] font-bold text-[var(--chip-dir-ink)]">
          Free forever.
        </span>
        <div className="grid items-center gap-12 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
          <div>
            <h1 className="font-serif text-[54px] font-medium leading-[1.04] tracking-tight text-ink">
              The notebook that thinks <span className="italic">with</span> you, not <span className="italic">for</span> you.
            </h1>
            <p className="mt-5 max-w-[46ch] text-[15.5px] leading-relaxed text-ink-soft">
              Write your own thoughts first. Marginalia reads along and answers in the margin with questions, challenges and corrections that make you think harder.
            </p>
            <div className="mt-7 flex gap-3">
              <Link href="/sign-in?mode=signup" className={btnPrimary}>Start writing free</Link>
              <a href="#features" className={btnGhost}>See how it works</a>
            </div>
          </div>

          <div className="rounded-2xl border border-line bg-card p-5 shadow-sm">
            <div className="flex gap-4">
              <div className="flex-1">
                <div className="font-serif text-[19px] font-semibold text-ink">Video idea: sleep and focus</div>
                <p className="mt-2 font-serif text-ink-soft">
                  Most people think <span className="border-b border-[#d9541e]">more sleep</span> means better focus. My angle is that <span className="border-b border-[#d9541e]">everyone needs</span> the same eight hours, so the video should open with one big claim.
                </p>
              </div>
              <div className="w-[52%] rounded-xl border border-line bg-paper-soft p-3.5">
                <span className="inline-flex rounded-full bg-[var(--chip-ch-bg)] px-2 py-[2px] text-[10.5px] font-bold text-[var(--chip-ch-ink)]">Challenge</span>
                <p className="mt-2 font-serif text-[14.5px] text-ink-soft">Is that true for everyone? What would a night-shift worker say?</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="features" className="border-y border-line bg-paper-soft py-16">
        <div className="mx-auto max-w-6xl px-5">
          <h2 className="max-w-[24ch] font-serif text-[34px] font-medium leading-tight text-ink">
            An AI that stays in the margin until it has something worth saying.
          </h2>
          <div className="mt-8 grid gap-5 md:grid-cols-3">
            {FEATURES.map((f) => (
              <div key={f.title} className="rounded-2xl border border-line bg-card p-6">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-line text-ink"><span className="msym text-[17px]">{f.icon}</span></div>
                <h3 className="mt-4 text-[16px] font-bold text-ink">{f.title}</h3>
                <p className="mt-2 text-[14px] leading-relaxed text-ink-soft">{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="who" className="mx-auto max-w-6xl px-5 pb-16 pt-16">
        <h2 className="font-serif text-[34px] font-medium leading-tight text-ink">Built for people who want to understand, not just finish.</h2>
        <div className="mt-9 grid gap-8 md:grid-cols-3">
          {PERSONAS.map((p) => (
            <div key={p.t}>
              <div className="h-[2px] w-full bg-ink" />
              <h3 className="mt-4 text-[15.5px] font-bold text-ink">{p.t}</h3>
              <p className="mt-2 text-[14px] leading-relaxed text-ink-soft">{p.b}</p>
            </div>
          ))}
        </div>
        <div className="mt-14 flex flex-col justify-between gap-6 rounded-[22px] bg-[var(--btn-dark)] px-8 py-9 md:flex-row md:items-center">
          <div>
            <div className="font-serif text-[30px] font-medium leading-tight text-[var(--btn-dark-text,#f3eee3)]" style={{ color: "#f3eee3" }}>
              Marginalia is free.
            </div>
            <div className="mt-2 text-[14px] text-white/70">Fair-use AI limits for everyone. Where is the catch? There isn't one.</div>
          </div>
          <Link href="/sign-in?mode=signup" className={btnGhost + " !border-0 bg-white text-ink"}>
            Start writing free
          </Link>
        </div>
      </section>

      <footer className="border-t border-line py-8">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 text-[13px] text-muted">
          <span>Marginalia. Think with it, not through it.</span>
          <div className="flex gap-5">
            <a href="#" className="hover:text-ink">Privacy</a>
            <a href="#" className="hover:text-ink">Terms</a>
            <Link href="/sign-in" className="hover:text-ink">Sign in</Link>
          </div>
        </div>
      </footer>
      </main>
    </RouteFx>
  );
}
