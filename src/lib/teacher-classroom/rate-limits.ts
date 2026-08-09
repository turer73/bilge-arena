import { createRateLimiter } from '@/lib/utils/rate-limit'
import { getClientIp } from '@/lib/utils/client-ip'

function createDualLimiter(name: string, userLimit: number, ipLimit: number) {
  const user = createRateLimiter(`${name}-user`, userLimit, 60_000)
  const ip = createRateLimiter(`${name}-ip`, ipLimit, 60_000)
  return { user, ip }
}

export type TeacherClassroomLimiter = ReturnType<typeof createDualLimiter>

export const teacherClassroomReadLimiter = createDualLimiter('teacher-classroom-read', 60, 180)
export const teacherClassroomWriteLimiter = createDualLimiter('teacher-classroom-write', 20, 60)
export const teacherInvitePreviewLimiter = createDualLimiter('teacher-invite-preview', 20, 60)
export const teacherInviteAcceptLimiter = createDualLimiter('teacher-invite-accept', 10, 30)
export const teacherAssignmentSubmitLimiter = createDualLimiter('teacher-assignment-submit', 15, 45)

export async function checkTeacherClassroomRateLimit(
  limiter: ReturnType<typeof createDualLimiter>,
  userId: string,
  headers: Headers,
): Promise<{ success: boolean; retryAfter?: number }> {
  const [userResult, ipResult] = await Promise.all([
    limiter.user.check(userId),
    limiter.ip.check(getClientIp(headers)),
  ])
  if (userResult.success && ipResult.success) return { success: true }
  return {
    success: false,
    retryAfter: Math.max(userResult.retryAfter ?? 0, ipResult.retryAfter ?? 0, 1),
  }
}
