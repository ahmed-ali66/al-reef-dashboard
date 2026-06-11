// FIX: Custom providers endpoint that returns the credentials provider info
// The default NextAuth v5 /api/auth/providers endpoint returns 401 on some Vercel deployments
// This custom handler returns the expected provider configuration
export async function GET() {
  return Response.json({
    credentials: {
      id: 'credentials',
      name: 'credentials',
      type: 'credentials',
      signinUrl: '/api/auth/signin/credentials',
      callbackUrl: '/api/auth/callback/credentials',
    },
  })
}
