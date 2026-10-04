/**
 * @file Light/dark theme toggle, shared by every page.
 *
 * With no saved choice, the device setting decides (prefers-color-scheme).
 * Once the toggle is used, the choice is saved in localStorage and set as
 * data-theme="light|dark" on <html>; base.css keys its dark tokens off both.
 *
 * Each page's <head> has a one-line inline script that applies the saved
 * choice before first paint, so there's no flash of the wrong theme. This
 * module then wires up the button and keeps everything in sync.
 */

const KEY = 'ashframe-theme';
const root = document.documentElement;
const systemDark = matchMedia('(prefers-color-scheme: dark)');
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');

/** The theme actually showing: the saved choice, else the device setting. */
export function currentTheme() {
  return root.dataset.theme || (systemDark.matches ? 'dark' : 'light');
}

function save(theme) {
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    // Private mode or storage disabled: the choice just won't persist.
  }
}

/** Keep the browser UI colour (iOS status bar, Android toolbar) in step. */
function syncThemeColor() {
  const color = getComputedStyle(root).getPropertyValue('--paper').trim();
  for (const meta of document.querySelectorAll('meta[name="theme-color"]')) {
    meta.removeAttribute('media');
    meta.content = color;
  }
}

function announce() {
  syncThemeColor();
  document.dispatchEvent(new CustomEvent('themechange', { detail: currentTheme() }));
}

/**
 * Wire up a toggle button. Its accessible name always describes what a
 * press will do ("Switch to dark mode").
 *
 * @param {HTMLButtonElement} button
 */
export function initThemeToggle(button) {
  const label = () => {
    const next = currentTheme() === 'dark' ? 'light' : 'dark';
    button.setAttribute('aria-label', `Switch to ${next} mode`);
    button.title = `Switch to ${next} mode`;
  };

  button.addEventListener('click', () => {
    const next = currentTheme() === 'dark' ? 'light' : 'dark';
    const apply = () => {
      root.dataset.theme = next;
      label();
      announce();
    };
    save(next);
    // A soft cross-fade between themes where supported
    if (document.startViewTransition && !reduceMotion.matches) {
      document.startViewTransition(apply);
    } else {
      apply();
    }
  });

  // Follow the device setting live, as long as the user hasn't chosen
  systemDark.addEventListener('change', () => {
    if (!root.dataset.theme) {
      label();
      announce();
    }
  });

  label();
  syncThemeColor();
}
