import { Router } from 'express'
import { db, notifications } from '../db/index'
import { eq, desc, and } from 'drizzle-orm'
import { requireAuth } from '../middleware/auth'

const router = Router()

router.use(requireAuth)

// List notifications for the current user
router.get('/', async (req, res) => {
  try {
    const userId = req.user!.id
    const rows = await db
      .select()
      .from(notifications)
      .where(eq(notifications.user_id, userId))
      .orderBy(desc(notifications.created_at))
      .limit(50)

    const unread = rows.filter(n => !n.read).length

    res.json({ success: true, data: rows, unread_count: unread })
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to fetch notifications', error_code: 'INTERNAL_ERROR' })
  }
})

// Mark a single notification as read
router.patch('/:id/read', async (req, res) => {
  try {
    const userId = req.user!.id
    const { id } = req.params

    await db.update(notifications)
      .set({ read: true })
      .where(and(eq(notifications.id, id), eq(notifications.user_id, userId)))

    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to mark notification as read', error_code: 'INTERNAL_ERROR' })
  }
})

// Mark all notifications as read
router.post('/read-all', async (req, res) => {
  try {
    const userId = req.user!.id

    await db.update(notifications)
      .set({ read: true })
      .where(eq(notifications.user_id, userId))

    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to mark all notifications as read', error_code: 'INTERNAL_ERROR' })
  }
})

// Delete a notification
router.delete('/:id', async (req, res) => {
  try {
    const userId = req.user!.id
    const { id } = req.params

    await db.delete(notifications)
      .where(and(eq(notifications.id, id), eq(notifications.user_id, userId)))

    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to delete notification', error_code: 'INTERNAL_ERROR' })
  }
})

export default router
