import { db, notifications, users } from '../db/index'
import { eq, inArray } from 'drizzle-orm'

export async function notifyUsers(
  userIds: string[],
  type: string,
  title: string,
  message: string,
  opts?: { related_quote_id?: string; related_batch_id?: string },
): Promise<void> {
  for (const user_id of userIds) {
    await db.insert(notifications).values({
      user_id,
      type,
      title,
      message,
      related_quote_id: opts?.related_quote_id ?? null,
      related_batch_id: opts?.related_batch_id ?? null,
    })
  }
}

export async function getUsersByRole(roles: string[]): Promise<string[]> {
  if (roles.length === 0) return []
  const result = await db
    .select({ id: users.id })
    .from(users)
    .where(inArray(users.role, roles as ('admin' | 'engineer' | 'cost_analyst' | 'ceo')[]))
  return result.map((r) => r.id)
}
