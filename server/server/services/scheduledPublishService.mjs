function normalizeScheduledAt(value) {
  const timestamp = Date.parse(String(value || ''));
  if (!Number.isFinite(timestamp)) throw new Error('Scheduled time is invalid');
  return new Date(timestamp).toISOString();
}

export function createScheduledPublishService({ database, postStore, revisionService, now = () => new Date() }) {
  function publishOne(postId, currentTime) {
    const current = postStore.get(postId);
    if (!current) throw new Error('Post not found');
    if (current.status === 'published') return current;
    if (current.status !== 'scheduled') throw new Error('Post is not scheduled');
    if (!current.scheduledAt || Date.parse(current.scheduledAt) > currentTime.getTime()) {
      throw new Error('Scheduled post is not due');
    }

    return database.transaction(() => {
      revisionService.snapshot(current, {
        source: 'scheduled-publish',
        editorUserId: 'scheduler',
        isProtected: true
      });
      const published = postStore.publishScheduled(postId, currentTime.toISOString());
      if (!published) throw new Error('Scheduled publish state changed');
      return published;
    });
  }

  return {
    schedule(postId, scheduledAt, { allowPast = false, editorUserId = 'admin' } = {}) {
      const current = postStore.get(postId);
      if (!current) throw new Error('Post not found');
      const normalized = normalizeScheduledAt(scheduledAt);
      if (!allowPast && Date.parse(normalized) <= now().getTime()) {
        throw new Error('Scheduled time must be in the future');
      }
      const scheduled = postStore.update(postId, {
        status: 'scheduled',
        scheduledAt: normalized,
        scheduleError: ''
      });
      revisionService.snapshot(scheduled, { source: 'schedule', editorUserId });
      return scheduled;
    },

    cancel(postId, { editorUserId = 'admin' } = {}) {
      const current = postStore.get(postId);
      if (!current) throw new Error('Post not found');
      if (current.status !== 'scheduled') throw new Error('Post is not scheduled');
      const cancelled = postStore.update(postId, { status: 'draft', scheduledAt: '', scheduleError: '' });
      revisionService.snapshot(cancelled, { source: 'schedule-cancel', editorUserId });
      return cancelled;
    },

    listDue() {
      return postStore.listDueScheduled(now().toISOString());
    },

    runDue() {
      const currentTime = now();
      const result = { published: [], failed: [] };
      for (const post of postStore.listDueScheduled(currentTime.toISOString())) {
        try {
          publishOne(post.id, currentTime);
          result.published.push(post.id);
        } catch (error) {
          const message = error?.message || 'Scheduled publish failed';
          postStore.setScheduleError(post.id, message);
          result.failed.push({ id: post.id, message });
        }
      }
      return result;
    },

    retry(postId) {
      return publishOne(postId, now());
    }
  };
}
