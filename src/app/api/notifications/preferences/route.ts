import prisma from '@/lib/db'
import {
  getAuthUser,
  serialize,
  errorResponse,
  successResponse,
  unauthorizedResponse,
} from '@/lib/api-utils'

// GET /api/notifications/preferences — Get current user's notification preferences
// Returns defaults if no preferences row exists yet.
export async function GET() {
  try {
    const user = await getAuthUser()
    if (!user) return unauthorizedResponse()

    let prefs = await prisma.notificationPreference.findUnique({
      where: { userId: user.id },
    })

    // Return defaults if no row exists
    if (!prefs) {
      return successResponse({
        id: 'default',
        userId: user.id,
        pushEnabled: true,
        soundEnabled: true,
        toastEnabled: true,
        disabledTypes: '',
        soundFile: 'chime',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
    }

    return successResponse(serialize(prefs))
  } catch (error: any) {
    console.error('[NOTIFICATION_PREFS] GET error:', error)
    return errorResponse('Failed to fetch notification preferences', 500)
  }
}

// PUT /api/notifications/preferences — Update current user's notification preferences
// Body: { pushEnabled?, soundEnabled?, toastEnabled?, disabledTypes?, soundFile? }
export async function PUT(request: Request) {
  try {
    const user = await getAuthUser()
    if (!user) return unauthorizedResponse()

    const body = await request.json()

    const updateData: any = {}
    if (typeof body.pushEnabled === 'boolean') updateData.pushEnabled = body.pushEnabled
    if (typeof body.soundEnabled === 'boolean') updateData.soundEnabled = body.soundEnabled
    if (typeof body.toastEnabled === 'boolean') updateData.toastEnabled = body.toastEnabled
    if (typeof body.disabledTypes === 'string') updateData.disabledTypes = body.disabledTypes
    if (typeof body.soundFile === 'string') updateData.soundFile = body.soundFile

    if (Object.keys(updateData).length === 0) {
      return errorResponse('No valid fields provided', 400)
    }

    // Upsert (create if doesn't exist, update if it does)
    const prefs = await prisma.notificationPreference.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        ...updateData,
      },
      update: updateData,
    })

    return successResponse(serialize(prefs))
  } catch (error: any) {
    console.error('[NOTIFICATION_PREFS] PUT error:', error)
    return errorResponse('Failed to update notification preferences', 500)
  }
}
