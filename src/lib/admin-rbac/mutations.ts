import { NextResponse } from 'next/server'

export type AdminRbacRpcName =
  | 'admin_create_role'
  | 'admin_update_role'
  | 'admin_delete_role'
  | 'admin_assign_role'
  | 'admin_revoke_role'

export interface AdminRbacRpcError {
  code?: string
  message?: string
}

interface RpcClient {
  rpc: unknown
}

export async function callAdminRbacRpc(
  client: RpcClient,
  name: AdminRbacRpcName,
  args: Record<string, unknown>,
) {
  const rpc = (client.rpc as (rpcName: string, rpcArgs: Record<string, unknown>) => Promise<{
    data: unknown
    error: AdminRbacRpcError | null
  }>).bind(client)
  return rpc(name, args)
}

export function adminRbacErrorResponse(error: AdminRbacRpcError) {
  switch (error.code) {
    case '42501':
      return NextResponse.json({ error: 'Yetkisiz erişim' }, { status: 403 })
    case 'P0002':
      return NextResponse.json({ error: 'Kayıt bulunamadı' }, { status: 404 })
    case '23505':
      return NextResponse.json({ error: 'Bu kayıt zaten mevcut' }, { status: 409 })
    case '23514':
      return NextResponse.json({ error: 'Yönetişim koruması işlemi reddetti' }, { status: 409 })
    case '22023':
      return NextResponse.json({ error: 'Geçersiz rol işlemi' }, { status: 400 })
    default:
      return NextResponse.json({ error: 'Rol işlemi tamamlanamadı' }, { status: 500 })
  }
}
