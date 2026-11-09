/**
 * Skeleton frames for Suspense fallbacks — pure server components (no "use client").
 * Shimmer + reveal CSS lives in globals.css (.mg-skel / .mg-skel--dark primitives).
 * Frames approximate their real counterparts' outer geometry so the reveal reads as
 * the same page, not a layout jump. Do not put bg/rounded-* utilities on .mg-skel
 * children — unlayered custom CSS beats Tailwind utility layers on equal properties.
 */

function Bars({ widths, dark = false, className = "" }: { widths: string[]; dark?: boolean; className?: string }) {
  return (
    <>
      {widths.map((w, i) => (
        <div key={i} className={`mg-skel${dark ? " mg-skel--dark" : ""} ${w} ${className}`} />
      ))}
    </>
  );
}

export function LibrarySkeleton() {
  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-30 border-b border-line bg-paper">
        <div className="mx-auto flex h-16 max-w-[1330px] items-center gap-4 px-5">
          <div className="mg-skel h-6 w-36" />
          <div className="mx-auto w-full max-w-[440px]"><div className="mg-skel h-10" /></div>
          <div className="mg-skel h-10 w-24" />
        </div>
      </header>
      <div className="mx-auto grid max-w-[1330px] gap-8 px-5 py-7 lg:grid-cols-[250px_1fr]">
        <aside className="space-y-3">
          <Bars widths={["w-24 h-3"]} />
          <div className="space-y-2">
            <Bars widths={["w-40 h-5", "w-32 h-5", "w-36 h-5"]} />
          </div>
          <Bars widths={["w-24 h-3"]} className="!mt-10" />
        </aside>
        <main>
          <div className="mg-skel h-9 w-56" />
          <div className="mg-skel mt-6 h-[150px] w-full rounded-2xl" />
          <div className="mt-6 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="rounded-2xl border border-line bg-card p-5">
                <div className="mg-skel h-3 w-24" />
                <div className="mg-skel mt-3 h-6 w-3/4" />
                <div className="mg-skel mt-2 h-3 w-full" />
                <div className="mg-skel mt-1.5 h-3 w-2/3" />
              </div>
            ))}
          </div>
        </main>
      </div>
    </div>
  );
}

export function NoteSkeleton() {
  return (
    <div className="grid min-h-dvh max-lg:grid-cols-1 lg:grid-cols-[230px_minmax(0,1fr)_380px]">
      <aside className="border-r border-line bg-paper p-5 max-lg:hidden">
        <div className="mg-skel h-4 w-20" />
        <div className="mg-skel mt-5 h-9 w-full" />
        <div className="mg-skel mt-6 h-3 w-16" />
      </aside>
      <div className="border-r border-line bg-paper">
        <header className="flex h-14 shrink-0 items-center gap-3 border-b border-line px-4">
          <div className="mg-skel h-4 w-16 max-lg:hidden" />
          <div className="mg-skel ml-auto h-8 w-28" />
        </header>
        <div className="px-6 py-8">
          <div className="mx-auto max-w-[720px] space-y-3.5">
            <div className="mg-skel h-8 w-2/3" />
            <div className="mg-skel h-4 w-full" />
            <div className="mg-skel h-4 w-full" />
            <div className="mg-skel h-4 w-4/5" />
            <div className="mg-skel mt-6 h-4 w-full" />
            <div className="mg-skel h-4 w-11/12" />
            <div className="mg-skel h-4 w-3/5" />
          </div>
        </div>
      </div>
      <aside className="bg-paper p-5 max-lg:hidden">
        <div className="mg-skel h-3 w-20" />
        <div className="rounded-xl border border-line bg-card p-3">
          <div className="mg-skel h-3.5 w-24" />
          <div className="mg-skel mt-2 h-3 w-full" />
        </div>
      </aside>
    </div>
  );
}

export function OptionsSkeleton() {
  return (
    <div className="min-h-dvh">
      <div className="mx-auto max-w-[680px] px-5 py-10">
        <div className="mg-skel h-4 w-24" />
        <div className="mg-skel mt-6 h-8 w-64" />
        <div className="mt-6 space-y-3.5 rounded-2xl border border-line bg-card p-6">
          <div className="mg-skel h-3.5 w-32" />
          <div className="mg-skel h-10 w-full" />
          <div className="mg-skel h-10 w-full" />
        </div>
        <div className="mg-skel mt-8 h-3.5 w-28" />
        <div className="mt-3 space-y-2">
          <Bars widths={["w-full h-10", "w-full h-10", "w-full h-10"]} />
        </div>
      </div>
    </div>
  );
}

export function VisualSkeleton() {
  return (
    <div className="grid min-h-dvh max-lg:grid-cols-1 lg:grid-cols-[minmax(0,1fr)_380px]">
      <div className="border-r border-line bg-paper">
        <header className="flex h-14 shrink-0 items-center gap-3 border-b border-line px-4">
          <div className="mg-skel h-4 w-28 max-lg:hidden" />
        </header>
        <div className="flex items-center justify-center p-8">
          <div className="mg-skel h-[320px] w-full max-w-[560px] rounded-xl" />
        </div>
      </div>
      <aside className="bg-paper p-5">
        <div className="mg-skel h-4 w-36" />
        <div className="mg-skel mt-4 h-24 w-full rounded-xl" />
      </aside>
    </div>
  );
}

export function AccountSkeleton() {
  return (
    <div className="min-h-dvh">
      <header className="border-b border-line bg-paper">
        <div className="mx-auto flex h-16 max-w-[860px] items-center justify-between px-5">
          <div className="mg-skel h-4 w-20" />
          <div className="flex items-center gap-2.5">
            <Bars widths={["w-16 h-9", "w-16 h-9", "w-20 h-9"]} />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-[860px] space-y-6 px-5 pb-16 pt-8">
        <div className="mg-skel h-9 w-52" />
        <div className="space-y-3.5 rounded-2xl border border-line bg-card p-6">
          <div className="space-y-3">
            <Bars widths={["w-24 h-4", "w-56 h-5", "w-40 h-4"]} />
          </div>
        </div>
        <div className="space-y-3.5 rounded-2xl border border-line bg-card p-6">
          <div className="mg-skel h-3.5 w-28" />
          <div className="mg-skel h-[7px] w-full rounded-full" />
          <div className="mg-skel h-3 w-48" />
        </div>
      </main>
    </div>
  );
}

export function AuthSkeleton() {
  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      <div className="hidden flex-col justify-between bg-[#101a2c] p-10 lg:flex">
        <div className="mg-skel--dark mg-skel h-6 w-40" />
        <div>
          <div className="mg-skel--dark mg-skel h-10 w-[28rem]" />
          <div className="mg-skel--dark mg-skel mt-3 h-10 w-96 max-w-[80vw]" />
          <div className="mg-skel--dark mg-skel mt-8 h-28 w-[26rem] max-w-[80vw] rounded-2xl" />
        </div>
        <div className="mg-skel--dark mg-skel h-3.5 w-72" />
      </div>
      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-[400px]">
          <div className="mg-skel mx-auto mb-7 h-10 w-56" />
          <div className="mg-skel mb-6 h-11 w-full" />
          <div className="mg-skel h-10 w-full" />
        </div>
      </div>
    </div>
  );
}

export function AdminSkeleton() {
  return (
    <div className="min-h-dvh bg-[#0e1524]" style={{ background: "#0e1524" }}>
      <div className="mx-auto flex max-w-[1200px]">
        <aside className="hidden w-[220px] shrink-0 py-8 pl-6 sm:block">
          <div className="mg-skel--dark mg-skel h-6 w-28" />
          <div className="mt-8 space-y-2">
            <Bars dark widths={["w-32 h-9", "w-28 h-9", "w-24 h-9", "w-28 h-9"]} />
          </div>
        </aside>
        <main className="min-w-0 flex-1 px-6 py-8 sm:px-8">
          <div className="mg-skel--dark mg-skel h-8 w-56" />
          <div className="mg-skel--dark mg-skel mt-6 h-32 rounded-xl" />
          <div className="mt-5 space-y-2.5">
            <Bars dark widths={["w-full h-10", "w-full h-10"]} />
          </div>
        </main>
      </div>
    </div>
  );
}
