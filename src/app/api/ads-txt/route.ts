export function GET() {
  return new Response(
    'google.com, pub-5103156785085864, DIRECT, f08c47fec0942fa0\n',
    { headers: { 'Content-Type': 'text/plain' } },
  )
}
