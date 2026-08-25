import { z } from 'zod'

const uuidSchema = z.string().uuid()
const timestampSchema = z.string().datetime({ offset: true })

export const provisionInstitutionInputSchema = z.object({
  name: z.string().trim().min(2).max(120),
  managerUserId: uuidSchema,
  requestId: uuidSchema,
}).strict()

export const provisionFreePilotInputSchema = z.object({
  name: z.string().trim().min(2).max(120),
  managerUserId: uuidSchema,
  approvalReference: z.string()
    .trim()
    .regex(/^[A-Za-z0-9][A-Za-z0-9._/-]{5,63}$/)
    .transform((value) => value.toUpperCase()),
  studentLimit: z.number().int().min(1).max(40),
  staffLimit: z.number().int().min(1).max(2),
  trialDays: z.number().int().min(14).max(60),
  requestId: uuidSchema,
}).strict()

export const provisionInstitutionResultSchema = z.object({
  institution: z.object({
    id: uuidSchema,
    name: z.string().trim().min(2).max(120),
    status: z.enum(['pilot', 'active']),
    studentLimit: z.number().int().positive(),
    staffLimit: z.number().int().positive(),
    createdAt: timestampSchema,
  }).strict(),
  membership: z.object({
    memberRef: z.string().regex(/^[0-9a-f]{32}$/),
    role: z.literal('manager'),
    joinedAt: timestampSchema,
  }).strict(),
  replayed: z.boolean(),
}).strict()

export const provisionFreePilotResultSchema = z.object({
  institution: z.object({
    id: uuidSchema,
    name: z.string().trim().min(2).max(120),
    status: z.literal('pilot'),
    studentLimit: z.number().int().min(1).max(40),
    staffLimit: z.number().int().min(1).max(2),
    pilotKind: z.literal('invitation_free'),
    approvalReference: z.string().regex(/^[A-Z0-9][A-Z0-9._/-]{5,63}$/),
    reviewDueAt: timestampSchema,
    createdAt: timestampSchema,
  }).strict(),
  membership: z.object({
    memberRef: z.string().regex(/^[0-9a-f]{32}$/),
    role: z.literal('manager'),
    joinedAt: timestampSchema,
  }).strict(),
  replayed: z.boolean(),
}).strict()

export const institutionStatusInputSchema = z.object({
  institutionId: uuidSchema,
  status: z.enum(['pilot', 'active', 'suspended', 'archived']),
  reason: z.string().trim().min(10).max(500),
  requestId: uuidSchema,
}).strict()

export const institutionStatusResultSchema = z.object({
  institutionId: uuidSchema,
  previousStatus: z.enum(['pilot', 'active', 'suspended', 'archived']),
  status: z.enum(['pilot', 'active', 'suspended', 'archived']),
  changed: z.boolean(),
  replayed: z.boolean(),
}).strict()

const institutionSummarySchema = z.object({
  id: uuidSchema,
  name: z.string().trim().min(2).max(120),
  status: z.enum(['pilot', 'active', 'suspended', 'archived']),
  studentLimit: z.number().int().positive(),
  staffLimit: z.number().int().positive(),
  staffCount: z.number().int().nonnegative(),
  classroomCount: z.number().int().nonnegative(),
  studentCount: z.number().int().nonnegative(),
  pilotKind: z.enum(['legacy', 'invitation_free', 'commercial']).optional(),
  approvalReference: z.string().regex(/^[A-Z0-9][A-Z0-9._/-]{5,63}$/).nullable().optional(),
  reviewDueAt: timestampSchema.nullable().optional(),
  manager: z.object({ userId: uuidSchema, alias: z.string().min(1).max(80) }).strict().nullable(),
  supportAccess: z.object({
    active: z.boolean(),
    expiresAt: timestampSchema.nullable(),
    reason: z.string().min(10).max(500).nullable(),
  }).strict(),
  createdAt: timestampSchema,
}).strict()

export const institutionAdminDirectorySchema = z.object({
  institutions: z.array(institutionSummarySchema),
  databaseControls: z.object({
    freePilotProvisioningEnabled: z.boolean(),
  }).strict().optional(),
  provisioning: z.object({
    invitationFreePilotEnabled: z.boolean(),
  }).strict().optional(),
}).strict()

export type InstitutionAdminDirectory = z.infer<typeof institutionAdminDirectorySchema>

export const institutionSupportDirectorySchema = z.object({
  institution: z.object({
    id: uuidSchema,
    name: z.string().trim().min(2).max(120),
    status: z.enum(['pilot', 'active']),
  }).strict(),
  access: z.object({
    scope: z.literal('read_only'),
    reason: z.string().min(10).max(500),
    expiresAt: timestampSchema,
  }).strict(),
  classrooms: z.array(z.object({
    id: uuidSchema,
    name: z.string().trim().min(2).max(60),
    teacherAlias: z.string().trim().min(1).max(80),
    activeStudentCount: z.number().int().min(0).max(40),
    students: z.array(z.object({
      memberRef: z.string().regex(/^[0-9a-f]{32}$/),
      alias: z.string().trim().min(1).max(80),
      joinedAt: timestampSchema,
    }).strict()).max(40),
  }).strict()).max(100),
}).strict()

export type InstitutionSupportDirectory = z.infer<typeof institutionSupportDirectorySchema>
