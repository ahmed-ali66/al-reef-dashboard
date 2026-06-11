// Environment variable validation at startup
// Ensures all required environment variables are present before the app starts

const REQUIRED_ENV_VARS = [
  'DATABASE_URL',
] as const

const PRODUCTION_REQUIRED_ENV_VARS = [
  'DATABASE_URL',
  'NEXTAUTH_SECRET',
] as const

interface EnvValidationResult {
  valid: boolean
  missing: string[]
  warnings: string[]
}

export function validateEnv(): EnvValidationResult {
  const missing: string[] = []
  const warnings: string[] = []

  // Check required env vars (all environments)
  for (const key of REQUIRED_ENV_VARS) {
    if (!process.env[key]) {
      missing.push(key)
    }
  }

  // Production-specific required checks
  if (process.env.NODE_ENV === 'production') {
    for (const key of PRODUCTION_REQUIRED_ENV_VARS) {
      if (!process.env[key]) {
        missing.push(key)
      }
    }

    // Warn if NEXTAUTH_SECRET looks like a default/weak value
    if (process.env.NEXTAUTH_SECRET && process.env.NEXTAUTH_SECRET.length < 32) {
      warnings.push('NEXTAUTH_SECRET should be at least 32 characters in production')
    }

    // Warn if DATABASE_URL is not PostgreSQL in production
    if (process.env.DATABASE_URL && !process.env.DATABASE_URL.startsWith('postgresql://') && !process.env.DATABASE_URL.startsWith('postgres://')) {
      warnings.push('DATABASE_URL should use PostgreSQL in production (currently not postgresql://)')
    }
  }

  // Development warnings for NEXTAUTH_SECRET
  if (process.env.NODE_ENV !== 'production' && !process.env.NEXTAUTH_SECRET) {
    warnings.push('NEXTAUTH_SECRET is not set — sessions will be invalidated on server restart. Set it in .env for stable development sessions.')
  }

  // Warn if CRON_SECRET is not set (cron jobs will fail auth)
  if (!process.env.CRON_SECRET) {
    warnings.push('CRON_SECRET is not set — cron job endpoint will reject all requests')
  }

  return {
    valid: missing.length === 0,
    missing,
    warnings,
  }
}

// Run validation at import time (module load)
const result = validateEnv()

if (!result.valid) {
  console.error('FATAL: Missing required environment variables:', result.missing.join(', '))
  if (process.env.NODE_ENV === 'production') {
    // In production, missing env vars should prevent startup
    throw new Error(`Missing required environment variables: ${result.missing.join(', ')}`)
  } else {
    console.warn('Running in development mode with missing env vars — some features may not work')
  }
}

if (result.warnings.length > 0) {
  console.warn('Environment warnings:')
  for (const warning of result.warnings) {
    console.warn(`  - ${warning}`)
  }
}

export const envValid = result.valid
