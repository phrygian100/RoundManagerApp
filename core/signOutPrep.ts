type Prep = () => void;

const preps = new Set<Prep>();

/** Screens register this so Firestore listeners are detached before auth.signOut(). */
export function registerSignOutPrep(fn: Prep): () => void {
  preps.add(fn);
  return () => {
    preps.delete(fn);
  };
}

/**
 * Drop live native Firestore listeners, then wait for that teardown.
 * Signing out while a listener is still attached crashes iOS (TestFlight: "Guvnor Crashed").
 */
export async function prepareForSignOut(): Promise<void> {
  for (const fn of preps) {
    try {
      fn();
    } catch (e) {
      console.warn('sign-out prep failed', e);
    }
  }
  await new Promise((resolve) => setTimeout(resolve, 300));
}
