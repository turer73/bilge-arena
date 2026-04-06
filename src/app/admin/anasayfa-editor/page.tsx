'use client'

import dynamic from 'next/dynamic'

const EditorLayout = dynamic(
  () => import('@/components/admin/homepage-editor/editor-layout').then((m) => ({ default: m.EditorLayout })),
  { loading: () => <div className="flex h-[600px] items-center justify-center">Yükleniyor...</div> }
)

export default function HomepageEditorPage() {
  return <EditorLayout />
}
