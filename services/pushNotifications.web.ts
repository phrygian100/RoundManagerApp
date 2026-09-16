export type PushOpenPayload = {
  type?: string;
  week?: string;
  requestId?: string;
  jobId?: string;
  day?: string;
};

export async function registerPushNotifications(): Promise<void> {
  // Web has no FCM wiring yet; owners get Android/iOS system notifications.
}

export function listenNotificationOpens(_handler: (data: PushOpenPayload) => void): () => void {
  return () => {};
}
