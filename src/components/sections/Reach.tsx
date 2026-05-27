"use client";

const links = [
  { label: "GBlock", href: "https://www.gblock.gg", mono: "GBLOCK.GG" },
  { label: "GitHub", href: "https://github.com/RichardTheBruce", mono: "GITHUB · RICHARDTHEBRUCE" },
  { label: "LinkedIn", href: "https://linkedin.com/in/richard-wayne-nuro", mono: "LINKEDIN · RICHARD-WAYNE-NURO" },
  {
    label: "Upwork",
    href: "https://www.upwork.com/services/product/development-it-you-will-get-your-own-personal-neural-net-custom-built-for-your-life-or-business-2054540114667442621",
    mono: "UPWORK · NEURAL NETS FOR EVERYTHING",
  },
];

export function Reach() {
  return (
    <footer className="relative w-full bg-ink px-6 py-32 md:px-16">
      <svg
        className="pointer-events-none absolute inset-x-0 top-0 h-32 w-full opacity-30"
        viewBox="0 0 1000 120"
        preserveAspectRatio="none"
      >
        <line x1="0" y1="0" x2="500" y2="120" stroke="#1E96E6" strokeWidth="0.5" />
        <line x1="250" y1="0" x2="500" y2="120" stroke="#1E96E6" strokeWidth="0.5" />
        <line x1="500" y1="0" x2="500" y2="120" stroke="#1E96E6" strokeWidth="0.5" />
        <line x1="750" y1="0" x2="500" y2="120" stroke="#1E96E6" strokeWidth="0.5" />
        <line x1="1000" y1="0" x2="500" y2="120" stroke="#1E96E6" strokeWidth="0.5" />
        <circle cx="500" cy="120" r="3" fill="#C97D3E" />
      </svg>

      <div className="mx-auto max-w-5xl">
        <p className="mono-caps mb-8 text-xs text-bone/40">Reach</p>
        <h2 className="serif-display text-5xl text-bone md:text-6xl">
          The strings <span className="amber-glow">tie off</span> here.
        </h2>

        <ul className="mt-16 grid gap-6 md:grid-cols-2">
          {links.map((l) => (
            <li key={l.href}>
              <a
                href={l.href}
                target="_blank"
                rel="noopener noreferrer"
                className="group block border-l-2 border-bone/15 py-3 pl-6 transition hover:border-amber"
              >
                <p className="font-serif text-3xl text-bone group-hover:text-amber">{l.label}</p>
                <p className="mono-caps mt-1 text-[10px] text-bone/40">{l.mono}</p>
              </a>
            </li>
          ))}
        </ul>

        <div className="mt-24 flex items-center justify-between border-t border-bone/10 pt-6">
          <p className="mono-caps text-[10px] text-bone/30">
            RICHARD WAYNE · NURO FINANCE · {new Date().getFullYear()}
          </p>
          <p className="font-serif text-sm italic text-bone/40">He who creates.</p>
        </div>
      </div>
    </footer>
  );
}
