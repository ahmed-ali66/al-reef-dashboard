export async function GET() {
  return Response.json({ pong: true, time: new Date().toISOString() })
}
export async function POST() {
  return Response.json({ pong: true, method: 'POST', time: new Date().toISOString() })
}
