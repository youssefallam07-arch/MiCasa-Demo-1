// Append-only audit log. Every meaningful change calls logEvent(); rows accumulate
// while the service is online. CIC reads/exports them; nothing is ever mutated here.
import { prisma } from './db';

// Fire-and-forget: never blocks or breaks the caller's main flow. Resolves the
// actor's username from their id for a readable trail.
export function logEvent(actorId: string | null | undefined, action: string, target = '', detail = '') {
  (async () => {
    let actor = 'system';
    if (actorId) {
      const u = await prisma.user.findUnique({ where: { id: actorId }, select: { username: true } });
      actor = u?.username || actorId;
    }
    await prisma.auditEvent.create({ data: { actor, action, target, detail } });
  })().catch(() => { /* auditing must never throw into the request path */ });
}

// Already have a display name (e.g. 'system' or a username) — skip the lookup.
export function logEventBy(actor: string, action: string, target = '', detail = '') {
  prisma.auditEvent.create({ data: { actor, action, target, detail } }).catch(() => {});
}

export async function listAuditEvents(limit = 500) {
  return prisma.auditEvent.findMany({ orderBy: { at: 'desc' }, take: limit });
}
