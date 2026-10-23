type CloseFn = () => void;

let closeFn: CloseFn | null = null;

/** Home registers this so Settings can unmount the native-driven drawer before navigating away. */
export function registerSettingsDrawerClose(fn: CloseFn): () => void {
  closeFn = fn;
  return () => {
    if (closeFn === fn) closeFn = null;
  };
}

export function closeSettingsDrawer(): void {
  closeFn?.();
}
