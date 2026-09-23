import { useEffect, useState } from "react";

/** Hash routes: #/name?key=value. */
export interface Route {
  name: string;
  params: URLSearchParams;
}

const parse = (): Route => {
  const raw = location.hash.replace(/^#\/?/, "");
  const [name, query = ""] = raw.split("?");
  return { name, params: new URLSearchParams(query) };
};

export function useRoute() {
  const [route, setRoute] = useState(parse);
  useEffect(() => {
    const on = () => {
      setRoute(parse());
      window.scrollTo(0, 0);
    };
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return route;
}

export const go = (to: string) => {
  location.hash = to.startsWith("#") ? to : `#/${to}`;
};
