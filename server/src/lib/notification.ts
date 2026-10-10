export type NotificationType = 'success' | 'error' | 'info';

export interface AppNotification {
  id: number;
  type: NotificationType;
  message: string;
  durationMs: number;
}

const DEFAULT_DURATIONS: Record<NotificationType, number> = {
  success: 3000,
  info: 3000,
  error: 4000
};

export function createNotification(
  type: NotificationType,
  message: string,
  durationMs = DEFAULT_DURATIONS[type]
): AppNotification {
  return {
    id: Date.now(),
    type,
    message,
    durationMs
  };
}
