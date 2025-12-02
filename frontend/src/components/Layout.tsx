import { NavLink, Outlet } from "react-router-dom";

const navItems = [
  { to: "/", label: "Home" },
  { to: "/notes", label: "Notes" },
  { to: "/forecast", label: "Forecast Lab" },
];

export const Layout = () => {
  return (
    <div className="kaito-shell relative min-h-screen bg-[var(--paper-bg)] text-[var(--paper-ink)]">
      <header className="sticky top-0 z-30 border-b border-[var(--paper-border)] bg-[var(--paper-surface)]/90 backdrop-blur">
        <div className="content-boundary flex items-center justify-between py-4">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-full border border-[var(--paper-border)] bg-[var(--paper-surface)] shadow-sm" />
            <div className="flex flex-col leading-tight">
              <span className="text-lg font-semibold tracking-[-0.02em] text-[var(--paper-ink)]">Adrian Martinez</span>
            </div>
          </div>
          <nav className="flex items-center gap-3 text-sm text-[var(--paper-muted)]">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  [
                    "group relative px-3 py-2 text-sm transition-colors duration-200",
                    isActive ? "text-[var(--paper-ink)]" : "hover:text-[var(--paper-ink)]",
                  ].join(" ")
                }
              >
                {({ isActive }) => (
                  <>
                    <span className="relative z-10 link-underline">{item.label}</span>
                    <span
                      className={[
                        "absolute inset-x-2 bottom-0 z-0 h-[1px] origin-left scale-x-0 transform rounded-full bg-[var(--paper-ink)] transition-transform duration-300 ease-out",
                        isActive ? "scale-x-100" : "group-hover:scale-x-100",
                      ].join(" ")}
                    />
                  </>
                )}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>

      <div className="pb-14 pt-10 md:pt-14">
        <main className="content-boundary">
          <Outlet />
        </main>
      </div>

      <footer className="border-t border-[var(--paper-border)] bg-[var(--paper-surface)]">
        <div className="content-boundary flex flex-col gap-3 py-6 text-sm text-[var(--paper-muted)] md:flex-row md:items-center md:justify-between">
          <div className="flex flex-col leading-tight">
            <span className="text-xs uppercase tracking-[0.14em] text-[var(--paper-muted)]">Contact</span>
            <span className="text-[var(--paper-ink)]">Always happy to collaborate.</span>
          </div>
          <div className="flex flex-wrap gap-4">
            <a
              className="link-underline transition hover:text-[var(--paper-ink)]"
              href="mailto:adrianmartinez00003@gmail.com"
            >
              adrianmartinez00003@gmail.com
            </a>
            <a
              className="link-underline transition hover:text-[var(--paper-ink)]"
              href="https://www.linkedin.com/in/-adrian-martinez/"
              target="_blank"
              rel="noreferrer"
            >
              LinkedIn
            </a>
            <a
              className="link-underline transition hover:text-[var(--paper-ink)]"
              href="https://github.com/AdrianMrtz1"
              target="_blank"
              rel="noreferrer"
            >
              GitHub
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
};
