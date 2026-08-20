import { z } from 'zod'

const roleRefSchema = z.string().regex(/^[0-9a-f]{32}$/)
const memberRefSchema = z.string().regex(/^[0-9a-f]{32}$/)
const uuidSchema = z.string().uuid()

export const institutionPermissionSchema = z.enum([
  'institution.workspace.view',
  'institution.classrooms.view_all',
  'institution.staff.manage',
  'institution.roles.manage',
  'institution.support.manage',
])

const institutionDelegablePermissionSchema = z.enum([
  'institution.classrooms.view_all',
])

export const institutionRoleDirectorySchema = z.object({
  permissions: z.array(z.object({
    permission: institutionPermissionSchema,
    label: z.string().trim().min(2).max(80),
    description: z.string().trim().min(10).max(240),
    delegable: z.boolean(),
  }).strict()).max(20),
  roles: z.array(z.object({
    roleRef: roleRefSchema,
    name: z.string().trim().min(2).max(50),
    description: z.string().trim().min(2).max(200).nullable(),
    system: z.boolean(),
    roleKey: z.enum(['manager', 'teacher']).nullable(),
    permissions: z.array(institutionPermissionSchema).max(20),
    memberCount: z.number().int().min(0).max(200),
  }).strict()).max(14),
  members: z.array(z.object({
    memberRef: memberRefSchema,
    alias: z.string().trim().min(1).max(80),
    membershipRole: z.enum(['manager', 'teacher']),
    roleRefs: z.array(roleRefSchema).max(14),
  }).strict()).max(6),
}).strict().superRefine((value, context) => {
  const refs = value.roles.map((role) => role.roleRef)
  if (new Set(refs).size !== refs.length) {
    context.addIssue({ code: 'custom', message: 'institution role refs must be unique' })
  }
  const known = new Set(refs)
  if (value.members.some((member) => member.roleRefs.some((ref) => !known.has(ref)))) {
    context.addIssue({ code: 'custom', message: 'institution role assignment mismatch' })
  }
})

export const institutionRoleWriteSchema = z.object({
  name: z.string().trim().min(2).max(50),
  description: z.string().trim().min(2).max(200).nullable(),
  permissions: z.array(institutionDelegablePermissionSchema).max(20),
  requestId: uuidSchema,
}).strict().superRefine((value, context) => {
  if (new Set(value.permissions).size !== value.permissions.length) {
    context.addIssue({ code: 'custom', message: 'institution permissions must be unique' })
  }
})

export const institutionRoleRequestSchema = z.object({ requestId: uuidSchema }).strict()

export const institutionRoleMutationSchema = z.object({
  roleRef: roleRefSchema,
  replayed: z.boolean(),
}).strict()

export const institutionRoleDeleteMutationSchema = institutionRoleMutationSchema.extend({
  deleted: z.literal(true),
}).strict()

export const institutionRoleAssignmentMutationSchema = institutionRoleMutationSchema.extend({
  memberRef: memberRefSchema,
  assigned: z.boolean(),
}).strict()

export type InstitutionRoleDirectory = z.infer<typeof institutionRoleDirectorySchema>
export type InstitutionPermission = z.infer<typeof institutionPermissionSchema>
