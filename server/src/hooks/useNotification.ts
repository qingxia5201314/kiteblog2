import { useEffect, useState } from 'react';
import { AppNotification, NotificationType, createNotification } from '../lib/notification';

export function useNotification() {
  const [notification, setNotification] = useState<AppNotification | null>(null);

  useEffect(() => {
    if (!notification) return;
    const timer = window.setTimeout(() => {
      setNotification((current) => (current?.id === notification.id ? null : current));
    }, notification.durationMs);
    return () => window.clearTimeout(timer);
  }, [notification]);

  const notify = (type: NotificationType, message: string, durationMs?: number) => {
    setNotification(createNotification(type, message, durationMs));
  };

  const clearNotification = () => setNotification(null);

  return { notification, notify, clearNotification };
}
