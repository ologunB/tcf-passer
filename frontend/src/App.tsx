import { useEffect } from "react";
import { Icon } from "./components/Icon";
import { useSetting, useToday } from "./hooks";
import { CheckPage } from "./pages/Check";
import { FlashcardsPage } from "./pages/Flashcards";
import { GrammarPage } from "./pages/Grammar";
import { LogPage } from "./pages/Log";
import { MistakesPage } from "./pages/Mistakes";
import { MockPage } from "./pages/Mock";
import { PlanPage } from "./pages/Plan";
import { PracticePage } from "./pages/Practice";
import { ResourcesPage } from "./pages/Resources";
import { ReviewPage } from "./pages/Review";
import { SettingsPage, type Theme } from "./pages/Settings";
import { SpeakingPage } from "./pages/Speaking";
import { StudyPage } from "./pages/Study";
import { Today } from "./pages/Today";
import { WritingPage } from "./pages/Writing";
import { useRoute } from "./router";

const tabs = [
  { route: "", label: "Today", icon: "home", match: [""] },
  { route: "study", label: "Study", icon: "reading", match: ["study", "cards", "grammar", "practice", "check", "writing", "speaking", "mistakes", "mock", "resources"] },
  { route: "plan", label: "Plan", icon: "calendar", match: ["plan"] },
  { route: "log", label: "Progress", icon: "chart", match: ["log", "review"] },
  { route: "settings", label: "Settings", icon: "settings", match: ["settings"] },
];

export function App() {
  const route = useRoute();
  const today = useToday();
  const theme = useSetting<Theme>("theme", "system");

  useEffect(() => {
    if (theme === "system") document.documentElement.removeAttribute("data-theme");
    else document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  const p = route.params;
  const pages: Record<string, () => React.ReactNode> = {
    plan: () => <PlanPage today={today} />,
    log: () => <LogPage today={today} />,
    review: () => <ReviewPage today={today} />,
    resources: () => <ResourcesPage />,
    settings: () => <SettingsPage today={today} />,
    study: () => <StudyPage today={today} />,
    cards: () => <FlashcardsPage today={today} />,
    grammar: () => <GrammarPage today={today} />,
    practice: () => <PracticePage today={today} params={p} />,
    check: () => <CheckPage today={today} params={p} />,
    mistakes: () => <MistakesPage today={today} />,
    writing: () => <WritingPage today={today} />,
    speaking: () => <SpeakingPage today={today} />,
    mock: () => <MockPage today={today} />,
  };
  const page = (pages[route.name] ?? (() => <Today today={today} />))();
  // Focused flows hide the tab bar so a stray tap can't leave a timed test.
  const focused = (route.name === "mock" || route.name === "check") && p.get("run") === "1";

  return (
    <>
      <main className="app" key={route.name}>{page}</main>
      {!focused && (
        <nav className="tabs" aria-label="Main">
          <div className="inner">
            {tabs.map((t) => {
              const on = t.match.includes(route.name);
              return (
                <a key={t.route} href={`#/${t.route}`} aria-current={on ? "page" : undefined}>
                  <Icon name={t.icon} size={22} stroke={on ? 2.2 : 1.8} />
                  {t.label}
                </a>
              );
            })}
          </div>
        </nav>
      )}
    </>
  );
}
