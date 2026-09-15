// Native: the app only has designed light palettes, so pin the scheme to
// 'light' regardless of the system setting. (useColorScheme.web.ts still
// follows the browser on web, where the site has always rendered correctly.)
export function useColorScheme(): 'light' {
  return 'light';
}
