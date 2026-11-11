export interface ServiceWorkerContainerLike {
  register(path: string): Promise<unknown>;
}

export interface NavigatorLike {
  readonly serviceWorker?: ServiceWorkerContainerLike;
}

function defaultNavigator(): NavigatorLike | undefined {
  return typeof navigator === "undefined" ? undefined : (navigator as NavigatorLike);
}

export function registerServiceWorker(path: string, nav: NavigatorLike | undefined = defaultNavigator()): void {
  try {
    if (nav === undefined || !("serviceWorker" in nav)) return;
    const container = nav.serviceWorker;
    if (container === undefined) return;
    void container.register(path).catch(() => undefined);
  } catch {
    // Registration is best effort. A blocked or absent service worker must never break the page.
  }
}
