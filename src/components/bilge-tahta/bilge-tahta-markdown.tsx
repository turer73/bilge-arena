import type { ReactNode } from 'react'

const inlineTokenPattern = /(\*\*[^*\n]+\*\*|__[^_\n]+__|`[^`\n]+`|\[[^\]\n]+\]\(https?:\/\/[^\s)]+\)|\*[^*\n]+\*|_[^_\n]+_)/g

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  return text.split(inlineTokenPattern).filter(Boolean).map((part, index) => {
    const key = `${keyPrefix}-${index}`

    if ((part.startsWith('**') && part.endsWith('**')) || (part.startsWith('__') && part.endsWith('__'))) {
      return <strong key={key} className="font-extrabold text-white">{part.slice(2, -2)}</strong>
    }
    if (part.startsWith('`') && part.endsWith('`')) {
      return <code key={key} className="rounded bg-black/30 px-1.5 py-0.5 font-mono text-[0.9em] text-yellow-100">{part.slice(1, -1)}</code>
    }

    const link = part.match(/^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/)
    if (link) {
      return (
        <a
          key={key}
          href={link[2]}
          target="_blank"
          rel="noreferrer noopener"
          className="font-bold text-sky-200 underline decoration-sky-300/50 underline-offset-4 hover:text-white"
        >
          {link[1]}
        </a>
      )
    }
    if ((part.startsWith('*') && part.endsWith('*')) || (part.startsWith('_') && part.endsWith('_'))) {
      return <em key={key}>{part.slice(1, -1)}</em>
    }
    return part
  })
}

function renderParagraph(lines: string[], key: string) {
  return (
    <p key={key} className="break-words text-base font-medium leading-7 text-slate-50 sm:text-lg sm:leading-8">
      {lines.map((line, index) => (
        <span key={`${key}-line-${index}`}>
          {index > 0 && <>{'\n'}<br /></>}
          {renderInline(line, `${key}-inline-${index}`)}
        </span>
      ))}
    </p>
  )
}

export function stripBilgeTahtaMarkdown(content: string): string {
  return content
    .replace(/^```[^\n]*$/gm, '')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^>\s?/gm, '')
    .replace(/^\s*[-*_]{3,}\s*$/gm, '')
    .replace(/^\s*[-+*]\s+/gm, '• ')
    .replace(/\[([^\]]+)\]\(https?:\/\/[^\s)]+\)/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/_([^_]+)_/g, '$1')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export function BilgeTahtaMarkdown({ content }: { content: string }) {
  const lines = content.replace(/\r\n?/g, '\n').split('\n')
  const blocks: ReactNode[] = []
  let index = 0

  while (index < lines.length) {
    const line = lines[index]
    if (!line.trim()) {
      index += 1
      continue
    }

    if (line.trimStart().startsWith('```')) {
      const language = line.trim().slice(3).trim()
      const codeLines: string[] = []
      index += 1
      while (index < lines.length && !lines[index].trimStart().startsWith('```')) {
        codeLines.push(lines[index])
        index += 1
      }
      if (index < lines.length) index += 1
      blocks.push(
        <pre key={`code-${index}`} className="max-w-full overflow-x-auto rounded-xl border border-white/10 bg-black/30 p-4 text-sm text-emerald-100 [scrollbar-width:thin]">
          <code data-language={language || undefined}>{codeLines.join('\n')}</code>
        </pre>,
      )
      continue
    }

    const heading = line.match(/^(#{1,6})\s+(.+)$/)
    if (heading) {
      const level = heading[1].length
      const headingClass = level === 1
        ? 'text-xl font-black leading-tight text-yellow-100 sm:text-2xl'
        : level === 2
          ? 'text-lg font-extrabold leading-snug text-emerald-100 sm:text-xl'
          : 'text-base font-extrabold leading-snug text-sky-100 sm:text-lg'
      const headingContent = renderInline(heading[2], `heading-${index}`)
      blocks.push(level === 1
        ? <h3 key={`heading-${index}`} className={headingClass}>{headingContent}</h3>
        : level === 2
          ? <h4 key={`heading-${index}`} className={headingClass}>{headingContent}</h4>
          : <h5 key={`heading-${index}`} className={headingClass}>{headingContent}</h5>)
      index += 1
      continue
    }

    if (/^\s*[-*_]{3,}\s*$/.test(line)) {
      blocks.push(<hr key={`rule-${index}`} className="border-white/15" />)
      index += 1
      continue
    }

    if (/^\s*[-+*]\s+/.test(line)) {
      const items: string[] = []
      while (index < lines.length && /^\s*[-+*]\s+/.test(lines[index])) {
        items.push(lines[index].replace(/^\s*[-+*]\s+/, ''))
        index += 1
      }
      blocks.push(
        <ul key={`list-${index}`} className="space-y-2 pl-5 text-base font-medium leading-7 text-slate-50 marker:text-yellow-200 sm:text-lg sm:leading-8">
          {items.map((item, itemIndex) => <li key={`list-${index}-${itemIndex}`} className="pl-1">{renderInline(item, `list-${index}-${itemIndex}`)}</li>)}
        </ul>,
      )
      continue
    }

    if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = []
      while (index < lines.length && /^\s*\d+\.\s+/.test(lines[index])) {
        items.push(lines[index].replace(/^\s*\d+\.\s+/, ''))
        index += 1
      }
      blocks.push(
        <ol key={`ordered-${index}`} className="list-decimal space-y-2 pl-6 text-base font-medium leading-7 text-slate-50 marker:font-black marker:text-yellow-200 sm:text-lg sm:leading-8">
          {items.map((item, itemIndex) => <li key={`ordered-${index}-${itemIndex}`} className="pl-1">{renderInline(item, `ordered-${index}-${itemIndex}`)}</li>)}
        </ol>,
      )
      continue
    }

    if (/^>\s?/.test(line)) {
      const quoteLines: string[] = []
      while (index < lines.length && /^>\s?/.test(lines[index])) {
        quoteLines.push(lines[index].replace(/^>\s?/, ''))
        index += 1
      }
      blocks.push(
        <blockquote key={`quote-${index}`} className="rounded-r-xl border-l-4 border-sky-300 bg-sky-200/10 px-4 py-3 text-sky-50">
          {renderParagraph(quoteLines, `quote-text-${index}`)}
        </blockquote>,
      )
      continue
    }

    const paragraphLines: string[] = [line]
    index += 1
    while (
      index < lines.length
      && lines[index].trim()
      && !/^(#{1,6})\s+/.test(lines[index])
      && !/^\s*[-+*]\s+/.test(lines[index])
      && !/^\s*\d+\.\s+/.test(lines[index])
      && !/^>\s?/.test(lines[index])
      && !/^\s*[-*_]{3,}\s*$/.test(lines[index])
      && !lines[index].trimStart().startsWith('```')
    ) {
      paragraphLines.push(lines[index])
      index += 1
    }
    blocks.push(renderParagraph(paragraphLines, `paragraph-${index}`))
  }

  return <div className="space-y-4" data-testid="bilge-tahta-markdown">{blocks}</div>
}
