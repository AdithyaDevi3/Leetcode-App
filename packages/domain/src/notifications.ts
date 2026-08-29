export type NotificationChannel = 'in_app' | 'email' | 'push';
export type NotificationPreference = { channel: NotificationChannel; enabled: boolean; quietHoursStart?: number; quietHoursEnd?: number };
export type ScheduledNotification = { channel: NotificationChannel; scheduledAt: string; reason: 'review_due' | 'goal_reminder' };

export function canScheduleNotification(preference: NotificationPreference, at: Date): boolean {
  if (!preference.enabled) return false;
  if (preference.quietHoursStart === undefined || preference.quietHoursEnd === undefined) return true;
  const hour = at.getUTCHours();
  const { quietHoursStart: start, quietHoursEnd: end } = preference;
  const inQuietHours = start < end ? hour >= start && hour < end : hour >= start || hour < end;
  return !inQuietHours;
}

export function scheduleReviewNotification(preferences: NotificationPreference[], dueAt: string): ScheduledNotification[] {
  const at = new Date(dueAt);
  return preferences.filter((preference) => canScheduleNotification(preference, at)).map((preference) => ({ channel: preference.channel, scheduledAt: at.toISOString(), reason: 'review_due' }));
}
