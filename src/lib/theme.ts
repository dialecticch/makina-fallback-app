import { readUserSettings, type Theme } from "@/config/user-settings";

const dark = () => window.matchMedia("(prefers-color-scheme: dark)").matches;

/** Applies a theme to `<html>`: the `dark` class Tailwind keys on, and `color-scheme` for native controls. */
export function applyTheme(theme: Theme = readUserSettings().theme) {
  const resolved = theme === "system" ? (dark() ? "dark" : "light") : theme;
  document.documentElement.classList.toggle("dark", resolved === "dark");
  document.documentElement.style.colorScheme = resolved;
}

/** Called once before the first render; follows the OS setting while the theme is "system". */
export function initTheme() {
  applyTheme();
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => applyTheme());
}
