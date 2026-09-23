import { useEffect, useState } from "react";
import { Icon } from "./components/Icon";
import { useSetting, useToday } from "./hooks";
import { LogPage } from "./pages/Log";
import { PlanPage } from "./pages/Plan";
import { ResourcesPage } from "./pages/Resources";
import { SettingsPage, type Theme } from "./pages/Settings";
import { Today } from "./pages/Today";

const tabs = [
  { route: "", label: "Today", icon: "home" },
  { route: "plan", label: "Plan", icon: "calendar" },
  { route: "log", label: "Progress", icon: "chart" },
  { route: "resources", label: "Resources", icon: "library" },
  { route: "settings", label: "Settings", icon: "settings" },
];

const routeFromHash = () => location.hash.replace(/^#\/?/, "").split("?")[0];

export function App() {
  const [route, setRoute] = useState(routeFromHash);
  const today = useToday();
  const theme = useSetting<Theme>("theme", "system");

  useEffect(() => {
    const on = () => {
      setRoute(routeFromHash());
      window.scrollTo(0, 0);
    };
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);

  useEffect(() => {
    if (theme === "system") document.documentElement.removeAttribute("data-theme");
    else document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  const page =
    route === "plan" ? <PlanPage today={today} />
    : route === "log" ? <LogPage today={today} />
    : route === "resources" ? <ResourcesPage />
    : route === "settings" ? <SettingsPage today={today} />
    : <Today today={today} />;

  return (
    <>
      <main className="app" key={route}>{page}</main>
      <nav className="tabs" aria-label="Main">
        <div className="inner">
          {tabs.map((t) => (
            <a key={t.route} href={`#/${t.route}`} aria-current={route === t.route ? "page" : undefined}>
              <Icon name={t.icon} size={22} stroke={route === t.route ? 2.2 : 1.8} />
              {t.label}
            </a>
          ))}
        </div>
      </nav>
    </>
  );
}
