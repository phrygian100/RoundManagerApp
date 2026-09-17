export type PushOpenPayload = {
  type?: string;
  week?: string;
  requestId?: string;
  jobId?: string;
  day?: string;
};

export type NotificationPermissionStatus = 'granted' | 'denied' | 'undetermined';
export type NotificationPermissionRequestResult = 'granted' | 'denied' | 'blocked';

export async function getNotificationPermissionStatus(): Promise<NotificationPermissionStatus> {
  return 'denied';
}

export async function hasDismissedNotificationPrompt(): Promise<boolean> {
  return true;
}

export async function markNotificationPromptDismissed(): Promise<void> {}

export async function requestNotificationPermission(): Promise<NotificationPermissionRequestResult> {
  return 'denied';
}

export async function registerPushNotifications(): Promise<void> {}

export async function enableNotificationsFromUserTap(): Promise<boolean> {
  return false;
}

export function openSystemNotificationSettings(): void {}

export function listenNotificationOpens(_handler: (data: PushOpenPayload) => void): () => void {
  return () => {};
}
