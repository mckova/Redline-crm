/** Light, dark, or follow the system. The resolved theme lives on <html data-theme>. */
export type Theme = "light" | "dark" | "system";
const KEY = "kesher.theme";
const media = window.matchMedia("(prefers-color-scheme: dark)");

export const theme = (): Theme => (localStorage.getItem(KEY) as Theme) || "system";

function resolve() {
  const t = theme();
  const dark = t === "dark" || (t === "system" && media.matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
}

export function setTheme(t: Theme) {
  localStorage.setItem(KEY, t);
  resolve();
}

resolve();
media.addEventListener("change", resolve);
