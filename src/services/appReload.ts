export function reloadEntireApp() {
  const currentUrl = new URL(window.location.href);
  currentUrl.searchParams.set("__enertrack_reload", Date.now().toString());
  window.location.replace(currentUrl.toString());
}
