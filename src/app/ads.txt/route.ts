export function GET() {
  const content = 'google.com, pub-5103156785085864, DIRECT, f08c47fec0942fa0\n'
  return new Response(content, {
    headers: { 'Content-Type': 'text/plain' },
  })
}
