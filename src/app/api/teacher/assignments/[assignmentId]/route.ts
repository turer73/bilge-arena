import { z } from 'zod'
import { requireTeacherClassroomRouteContext } from '@/lib/teacher-classroom/route-context'
import {
  teacherAssignmentSubmitLimiter,
  teacherClassroomReadLimiter,
} from '@/lib/teacher-classroom/rate-limits'
import {
  studentAssignmentSubmitInputSchema,
  studentAssignmentSubmitReceiptSchema,
  studentAssignmentSubmitResponseSchema,
  studentTeacherAssignmentSchema,
  teacherClassroomNoStoreJson,
  teacherClassroomRpcStatus,
} from '@/lib/teacher-classroom/server-contract'

const assignmentIdSchema = z.string().uuid()

export async function GET(
  request: Request,
  routeContext: { params: Promise<{ assignmentId: string }> },
) {
  const context = await requireTeacherClassroomRouteContext(request, teacherClassroomReadLimiter)
  if (!context.ok) return context.response
  const assignmentId = assignmentIdSchema.safeParse((await routeContext.params).assignmentId)
  if (!assignmentId.success) {
    return teacherClassroomNoStoreJson({ error: 'Geçersiz ödev' }, { status: 400 })
  }
  const { data, error } = await context.admin.rpc('get_my_teacher_assignment', {
    p_user_id: context.userId,
    p_assignment_id: assignmentId.data,
  })
  if (error) {
    return teacherClassroomNoStoreJson(
      { error: 'Ödev alınamadı' },
      { status: teacherClassroomRpcStatus(error.code) },
    )
  }
  const result = studentTeacherAssignmentSchema.safeParse(data)
  return result.success && result.data.id === assignmentId.data
    ? teacherClassroomNoStoreJson(result.data)
    : teacherClassroomNoStoreJson({ error: 'Ödev alınamadı' }, { status: 500 })
}

export async function POST(
  request: Request,
  routeContext: { params: Promise<{ assignmentId: string }> },
) {
  const context = await requireTeacherClassroomRouteContext(request, teacherAssignmentSubmitLimiter)
  if (!context.ok) return context.response
  const assignmentId = assignmentIdSchema.safeParse((await routeContext.params).assignmentId)
  const body = studentAssignmentSubmitInputSchema.safeParse(await request.json().catch(() => null))
  if (!assignmentId.success || !body.success) {
    return teacherClassroomNoStoreJson({ error: 'Geçersiz ödev gönderimi' }, { status: 400 })
  }

  const { data, error } = await context.admin.rpc('submit_teacher_assignment', {
    p_user_id: context.userId,
    p_assignment_id: assignmentId.data,
    p_answers: body.data.answers,
    p_request_id: body.data.requestId,
  })
  if (error) {
    return teacherClassroomNoStoreJson(
      { error: 'Ödev gönderilemedi' },
      { status: teacherClassroomRpcStatus(error.code) },
    )
  }
  const receipt = studentAssignmentSubmitReceiptSchema.safeParse(data)
  if (!receipt.success || receipt.data.assignmentId !== assignmentId.data) {
    return teacherClassroomNoStoreJson({ error: 'Ödev gönderilemedi' }, { status: 500 })
  }

  const loaded = await context.admin.rpc('get_my_teacher_assignment', {
    p_user_id: context.userId,
    p_assignment_id: assignmentId.data,
  })
  if (loaded.error) {
    return teacherClassroomNoStoreJson({ error: 'Ödev sonucu alınamadı' }, { status: 500 })
  }
  const assignment = studentTeacherAssignmentSchema.safeParse(loaded.data)
  const response = studentAssignmentSubmitResponseSchema.safeParse({
    assignment: assignment.success ? assignment.data : null,
    replayed: receipt.data.replayed,
  })
  return response.success
    && response.data.assignment.id === assignmentId.data
    && response.data.assignment.status === 'submitted'
    ? teacherClassroomNoStoreJson(response.data)
    : teacherClassroomNoStoreJson({ error: 'Ödev sonucu alınamadı' }, { status: 500 })
}
