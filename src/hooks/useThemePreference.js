import { useEffect, useState } from "react";

const themeStorageKey = "infinimind.theme.v1";

const validThemeIds = new Set(["light", "dark"]);

function getStoredThemePreference() {
  if (typeof window === "undefined") {
    return "light";
  }

  try {
    const storedTheme = window.localStorage.getItem(themeStorageKey);
    return validThemeIds.has(storedTheme) ? storedTheme : "light";
  } catch {
    return "light";
  }
}

export function useThemePreference() {
  const [theme, setTheme] = useState(getStoredThemePreference);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;

    try {
      window.localStorage.setItem(themeStorageKey, theme);
    } catch {
      // Theme preference is cosmetic; keep the UI usable if storage is blocked.
    }
  }, [theme]);

  return [theme, setTheme];
}
