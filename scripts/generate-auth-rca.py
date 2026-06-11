#!/usr/bin/env python3
"""
Authentication Root Cause Analysis Report Generator
Generates a professional PDF report documenting the authentication instability investigation and fix.
"""

import os
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.colors import HexColor
from reportlab.lib.units import mm, inch
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    PageBreak, KeepTogether, HRFlowable
)
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_JUSTIFY
from reportlab.lib import colors

# ─── Colors ──────────────────────────────────────────────────
DEEP_TEAL = HexColor('#0F766E')
LIGHT_TEAL = HexColor('#CCFBF1')
ACCENT_AMBER = HexColor('#F59E0B')
CRITICAL_RED = HexColor('#DC2626')
HIGH_ORANGE = HexColor('#EA580C')
MEDIUM_YELLOW = HexColor('#CA8A04')
LOW_BLUE = HexColor('#2563EB')
LIGHT_RED = HexColor('#FEE2E2')
LIGHT_ORANGE = HexColor('#FFEDD5')
LIGHT_YELLOW = HexColor('#FEF9C3')
LIGHT_BLUE = HexColor('#DBEAFE')
DARK_TEXT = HexColor('#1E293B')
MUTED_TEXT = HexColor('#64748B')
BG_CREAM = HexColor('#FFFBEB')

OUTPUT_PATH = '/home/z/my-project/download/Auth_RCA_Report.pdf'

# ─── Document Setup ──────────────────────────────────────────
doc = SimpleDocTemplate(
    OUTPUT_PATH,
    pagesize=A4,
    topMargin=20*mm,
    bottomMargin=20*mm,
    leftMargin=25*mm,
    rightMargin=25*mm,
)

styles = getSampleStyleSheet()

# Custom styles
styles.add(ParagraphStyle(
    'DocTitle',
    parent=styles['Title'],
    fontSize=24,
    leading=30,
    textColor=DEEP_TEAL,
    spaceAfter=6,
    alignment=TA_CENTER,
))
styles.add(ParagraphStyle(
    'DocSubtitle',
    parent=styles['Normal'],
    fontSize=12,
    leading=16,
    textColor=MUTED_TEXT,
    spaceAfter=20,
    alignment=TA_CENTER,
))
styles.add(ParagraphStyle(
    'SectionTitle',
    parent=styles['Heading1'],
    fontSize=18,
    leading=24,
    textColor=DEEP_TEAL,
    spaceBefore=16,
    spaceAfter=8,
))
styles.add(ParagraphStyle(
    'SubSectionTitle',
    parent=styles['Heading2'],
    fontSize=14,
    leading=18,
    textColor=HexColor('#0D9488'),
    spaceBefore=12,
    spaceAfter=6,
))
styles.add(ParagraphStyle(
    'BodyText2',
    parent=styles['Normal'],
    fontSize=10,
    leading=15,
    textColor=DARK_TEXT,
    spaceAfter=8,
    alignment=TA_JUSTIFY,
))
styles.add(ParagraphStyle(
    'BulletText',
    parent=styles['Normal'],
    fontSize=10,
    leading=15,
    textColor=DARK_TEXT,
    spaceAfter=4,
    leftIndent=20,
    bulletIndent=10,
    alignment=TA_LEFT,
))
styles.add(ParagraphStyle(
    'CodeBlock',
    parent=styles['Normal'],
    fontSize=8,
    leading=11,
    textColor=HexColor('#1E293B'),
    backColor=HexColor('#F1F5F9'),
    leftIndent=10,
    rightIndent=10,
    spaceBefore=6,
    spaceAfter=6,
    borderPadding=6,
    fontName='Courier',
))
styles.add(ParagraphStyle(
    'SeverityCritical',
    parent=styles['Normal'],
    fontSize=10,
    leading=14,
    textColor=CRITICAL_RED,
    fontName='Helvetica-Bold',
))
styles.add(ParagraphStyle(
    'SeverityHigh',
    parent=styles['Normal'],
    fontSize=10,
    leading=14,
    textColor=HIGH_ORANGE,
    fontName='Helvetica-Bold',
))
styles.add(ParagraphStyle(
    'FooterStyle',
    parent=styles['Normal'],
    fontSize=8,
    leading=10,
    textColor=MUTED_TEXT,
    alignment=TA_CENTER,
))

story = []

# ─── Cover ───────────────────────────────────────────────────
story.append(Spacer(1, 60))
story.append(Paragraph('Authentication System', styles['DocTitle']))
story.append(Paragraph('Root Cause Analysis & Resolution Report', styles['DocTitle']))
story.append(Spacer(1, 12))
story.append(HRFlowable(width="60%", thickness=2, color=DEEP_TEAL, spaceBefore=6, spaceAfter=6))
story.append(Spacer(1, 12))
story.append(Paragraph('Al Reef Al Madeena Real Estate SaaS Platform', styles['DocSubtitle']))
story.append(Paragraph('Production P1 Incident Report', styles['DocSubtitle']))
story.append(Spacer(1, 30))

# Summary block
summary_data = [
    ['Incident Date', 'June 2026'],
    ['Severity', 'P1 - Production Critical'],
    ['Status', 'RESOLVED'],
    ['Affected Roles', 'Owner, Admin, Accountant, Staff'],
    ['Root Causes', '5 identified (2 Critical, 3 High)'],
    ['Verification', '8/8 E2E tests passing on production'],
]
summary_table = Table(summary_data, colWidths=[45*mm, 100*mm])
summary_table.setStyle(TableStyle([
    ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
    ('FONTNAME', (1, 0), (1, -1), 'Helvetica'),
    ('FONTSIZE', (0, 0), (-1, -1), 10),
    ('TEXTCOLOR', (0, 0), (0, -1), DEEP_TEAL),
    ('TEXTCOLOR', (1, 0), (1, -1), DARK_TEXT),
    ('ALIGN', (0, 0), (0, -1), 'RIGHT'),
    ('ALIGN', (1, 0), (1, -1), 'LEFT'),
    ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
    ('TOPPADDING', (0, 0), (-1, -1), 6),
    ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
    ('RIGHTPADDING', (0, 0), (0, -1), 12),
    ('BACKGROUND', (0, 0), (-1, -1), LIGHT_TEAL),
    ('BOX', (0, 0), (-1, -1), 0.5, DEEP_TEAL),
    ('LINEBELOW', (0, 0), (-1, -2), 0.5, HexColor('#99F6E4')),
]))
story.append(summary_table)

story.append(PageBreak())

# ─── Table of Contents ───────────────────────────────────────
story.append(Paragraph('Table of Contents', styles['SectionTitle']))
story.append(Spacer(1, 8))

toc_items = [
    '1. Executive Summary',
    '2. Problem Statement',
    '3. Root Cause Analysis',
    '   3.1. CRITICAL: No Error Handling in authorize()',
    '   3.2. CRITICAL: Rate Limiting Race Conditions',
    '   3.3. HIGH: Serverless-Incompatible Cleanup Logic',
    '   3.4. HIGH: No Middleware Route Protection',
    '   3.5. HIGH: Inconsistent Password Policy & TOCTOU',
    '4. Fixes Implemented',
    '5. Production Verification Results',
    '6. Monitoring & Observability',
    '7. Automated Test Coverage',
    '8. Recommendations',
]
for item in toc_items:
    indent = 30 if item.startswith('   ') else 0
    story.append(Paragraph(
        item.strip(),
        ParagraphStyle('TOCItem', parent=styles['Normal'],
                       fontSize=10, leading=16, textColor=DARK_TEXT,
                       leftIndent=indent, spaceAfter=2)
    ))

story.append(PageBreak())

# ─── 1. Executive Summary ────────────────────────────────────
story.append(Paragraph('1. Executive Summary', styles['SectionTitle']))
story.append(Paragraph(
    'The authentication system of the Al Reef Al Madeena SaaS platform exhibited intermittent failures '
    'across all user roles (Owner, Admin, Accountant, Staff). Users would sometimes log in successfully, '
    'and other times the same credentials would fail with "Invalid Username or Password" without any '
    'apparent reason. This P1 production incident affected the core business operation of a live commercial '
    'real estate management platform serving the UAE market.',
    styles['BodyText2']
))
story.append(Paragraph(
    'A comprehensive end-to-end investigation of 22+ files across the authentication stack identified '
    '<b>5 root causes</b>: 2 Critical and 3 High severity. The primary cause was the complete absence of '
    'error handling in the NextAuth <font face="Courier">authorize()</font> function, meaning that any '
    'transient database connectivity issue (common in Vercel serverless with Neon PostgreSQL cold starts) '
    'would result in an unhandled exception that appeared to the user as "wrong password." Secondary '
    'causes included rate limiting race conditions that created false lockouts, serverless-incompatible '
    'cleanup logic that deleted valid lockout entries, and inconsistent password policies.',
    styles['BodyText2']
))
story.append(Paragraph(
    'All 5 root causes have been resolved with production-grade fixes. The fix-auth script was run against '
    'the production Neon PostgreSQL database, resetting all account passwords to the standard '
    '<font face="Courier">Alreef@2025</font>, clearing stale rate limit entries, and verifying all 4 accounts. '
    'Playwright E2E tests confirmed 8/8 tests passing on production, including login for every role, '
    'session persistence, email case insensitivity, and wrong password handling.',
    styles['BodyText2']
))

# ─── 2. Problem Statement ────────────────────────────────────
story.append(Paragraph('2. Problem Statement', styles['SectionTitle']))
story.append(Paragraph(
    'The authentication system behaved inconsistently. At times, users could log in successfully, and at '
    'other times the same credentials failed without any apparent reason. This issue affected multiple roles '
    'across the platform and had become a recurring production problem. The issue was intermittent, difficult '
    'to predict, and completely unacceptable for a live commercial SaaS platform.',
    styles['BodyText2']
))

# Affected accounts table
story.append(Paragraph('Affected Production Accounts:', styles['SubSectionTitle']))
accounts_data = [
    ['Email', 'Password', 'Role', 'Status'],
    ['owner@alreef.ae', 'Alreef@2025', 'Owner', 'VERIFIED'],
    ['admin@alreef.ae', 'Alreef@2025', 'Admin', 'VERIFIED'],
    ['accountant@alreef.ae', 'Alreef@2025', 'Accountant', 'VERIFIED'],
    ['staff@alreef.ae', 'Alreef@2025', 'Staff', 'VERIFIED'],
]
accounts_table = Table(accounts_data, colWidths=[50*mm, 30*mm, 30*mm, 25*mm])
accounts_table.setStyle(TableStyle([
    ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
    ('FONTSIZE', (0, 0), (-1, -1), 9),
    ('BACKGROUND', (0, 0), (-1, 0), DEEP_TEAL),
    ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
    ('TEXTCOLOR', (3, 1), (3, -1), HexColor('#16A34A')),
    ('FONTNAME', (3, 1), (3, -1), 'Helvetica-Bold'),
    ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
    ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
    ('GRID', (0, 0), (-1, -1), 0.5, HexColor('#E2E8F0')),
    ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, HexColor('#F8FAFC')]),
    ('TOPPADDING', (0, 0), (-1, -1), 6),
    ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
]))
story.append(accounts_table)

# ─── 3. Root Cause Analysis ──────────────────────────────────
story.append(PageBreak())
story.append(Paragraph('3. Root Cause Analysis', styles['SectionTitle']))
story.append(Paragraph(
    'The investigation covered the entire authentication stack: NextAuth v5 configuration, '
    'login API routes, password hashing/comparison, session management, JWT token handling, '
    'rate limiting, middleware, database connectivity, and frontend state management. '
    'Five root causes were identified.',
    styles['BodyText2']
))

# RCA-1
story.append(Paragraph('3.1. CRITICAL: No Error Handling in authorize()', styles['SubSectionTitle']))
story.append(Paragraph('<font color="#DC2626"><b>Severity: CRITICAL</b></font>  |  File: <font face="Courier">src/lib/auth.ts</font>', styles['BodyText2']))
story.append(Paragraph(
    'The NextAuth <font face="Courier">authorize()</font> function had no try-catch blocks around '
    'database operations. In Vercel serverless functions with Neon PostgreSQL, cold starts and connection '
    'pool exhaustion are common transient events. When <font face="Courier">prisma.user.findUnique()</font> '
    'or <font face="Courier">bcrypt.compare()</font> threw an error due to a DB connection timeout, the '
    'entire <font face="Courier">authorize()</font> function would throw an unhandled exception. NextAuth '
    'would then return a generic "CredentialsSignin" error to the frontend, which displayed as '
    '"Invalid Username or Password."',
    styles['BodyText2']
))
story.append(Paragraph(
    'This was the <b>primary root cause</b> of intermittent failures. The user would enter correct '
    'credentials, but a transient DB error would cause the login to appear as "wrong password." Since the '
    'error was transient, the same credentials would work minutes later when the DB connection was '
    're-established, making the issue appear random and unpredictable.',
    styles['BodyText2']
))
story.append(Paragraph(
    '<b>Additional impact:</b> When <font face="Courier">authorize()</font> threw, '
    '<font face="Courier">recordFailedAttempt()</font> was never called, but the frontend would call '
    '<font face="Courier">/api/auth/diagnose</font> which also made DB queries. If those also failed, '
    'the user received a generic error with no actionable information.',
    styles['BodyText2']
))

# RCA-2
story.append(Paragraph('3.2. CRITICAL: Rate Limiting Race Conditions', styles['SubSectionTitle']))
story.append(Paragraph('<font color="#DC2626"><b>Severity: CRITICAL</b></font>  |  File: <font face="Courier">src/lib/auth.ts</font>', styles['BodyText2']))
story.append(Paragraph(
    'The <font face="Courier">recordFailedAttempt()</font> function used a read-then-write pattern: '
    'it first read the current <font face="Courier">RateLimitEntry</font>, then incremented the count, '
    'then wrote it back. Under concurrent requests (e.g., multiple browser tabs or devices), two '
    'simultaneous requests could read the same count and both increment to count+1 instead of count+2, '
    'effectively bypassing rate limiting. Additionally, the <font face="Courier">resetAt</font> field was '
    'extended on every failed attempt, meaning a user who failed 4 times over a 14-minute period would '
    'never have their count naturally reset because the window kept getting pushed forward.',
    styles['BodyText2']
))
story.append(Paragraph(
    '<b>Secondary issue:</b> When a user was already locked out (5 failed attempts), each subsequent '
    'failed attempt would create a new <font face="Courier">lockedUntil</font> value, effectively extending '
    'the lockout indefinitely. The user could never "wait out" their lockout because every failed attempt '
    'reset the 15-minute clock.',
    styles['BodyText2']
))

# RCA-3
story.append(Paragraph('3.3. HIGH: Serverless-Incompatible Cleanup Logic', styles['SubSectionTitle']))
story.append(Paragraph('<font color="#EA580C"><b>Severity: HIGH</b></font>  |  File: <font face="Courier">src/lib/auth.ts</font>', styles['BodyText2']))
story.append(Paragraph(
    'The <font face="Courier">cleanupExpiredEntries()</font> function used a module-level variable '
    '<font face="Courier">let lastCleanup = 0</font> to track when cleanup last ran. In Vercel serverless, '
    'each cold start creates a fresh module scope, resetting <font face="Courier">lastCleanup</font> to 0. '
    'This meant cleanup ran on <b>every single login attempt</b> instead of every 5 minutes, adding '
    'unnecessary DB load. Worse, the cleanup used an OR condition that could delete entries with valid '
    'active lockouts if their <font face="Courier">resetAt</font> had passed, even though '
    '<font face="Courier">lockedUntil</font> was still in the future.',
    styles['BodyText2']
))

# RCA-4
story.append(Paragraph('3.4. HIGH: No Middleware Route Protection', styles['SubSectionTitle']))
story.append(Paragraph('<font color="#EA580C"><b>Severity: HIGH</b></font>  |  File: <font face="Courier">src/proxy.ts</font>', styles['BodyText2']))
story.append(Paragraph(
    'While a proxy.ts (Next.js 16 middleware) existed, it did not provide comprehensive auth route '
    'protection. The <font face="Courier">/api/auth/diagnose</font> endpoint was accessible without '
    'authentication and revealed user existence, account status, lockout status, and company name to '
    'unauthenticated users. This information disclosure could be used for user enumeration attacks. '
    'Additionally, some API routes relied solely on in-handler auth checks with no edge-level protection.',
    styles['BodyText2']
))

# RCA-5
story.append(Paragraph('3.5. HIGH: Inconsistent Password Policy & TOCTOU', styles['SubSectionTitle']))
story.append(Paragraph('<font color="#EA580C"><b>Severity: HIGH</b></font>  |  File: <font face="Courier">src/app/api/auth/reset-password/route.ts</font>', styles['BodyText2']))
story.append(Paragraph(
    'The self-service password reset endpoint enforced only a 6-character minimum with no complexity '
    'requirements, while admin-created passwords required 8 characters with at least one uppercase letter '
    'and one number. This inconsistency meant users could weaken their passwords through self-service reset. '
    'Additionally, the token validation and consumption were not atomic (TOCTOU race condition): the token '
    'was first validated (findUnique), then the password was updated, then the token was marked as used. '
    'Between these steps, the same token could be used again in a parallel request.',
    styles['BodyText2']
))

# ─── 4. Fixes Implemented ────────────────────────────────────
story.append(PageBreak())
story.append(Paragraph('4. Fixes Implemented', styles['SectionTitle']))

fixes = [
    {
        'title': 'Fix 1: Database Retry with Error Handling',
        'severity': 'Critical',
        'desc': 'Added <font face="Courier">withRetry()</font> helper with automatic retry for transient '
                'DB connection errors (2 retries, exponential backoff). Wrapped all DB operations in '
                '<font face="Courier">authorize()</font> with try-catch blocks. DB failures no longer '
                'record false failed attempts or appear as wrong password. Added auth health metrics '
                '(<font face="Courier">getAuthMetrics()</font>) for observability.',
    },
    {
        'title': 'Fix 2: Atomic Rate Limiting',
        'severity': 'Critical',
        'desc': 'Fixed <font face="Courier">recordFailedAttempt()</font> to not extend '
                '<font face="Courier">resetAt</font> on repeated failures (preserves the original window). '
                'Fixed lockout duration to not extend on failures after already locked (only set '
                '<font face="Courier">lockedUntil</font> on the first time count reaches MAX). '
                'Used <font face="Courier">deleteMany</font> with WHERE clause for atomic expired lockout cleanup.',
    },
    {
        'title': 'Fix 3: Serverless-Safe Cleanup Coordination',
        'severity': 'High',
        'desc': 'Replaced module-level <font face="Courier">lastCleanup</font> variable with DB-backed '
                'coordination lock using a special <font face="Courier">RateLimitEntry</font> with identifier '
                '<font face="Courier">"auth:cleanup:lock"</font>. Only one serverless instance runs cleanup '
                'per 5-minute interval. Cleanup now only deletes entries that are genuinely expired (expired '
                'lockouts OR stale entries with no lockout and expired resetAt).',
    },
    {
        'title': 'Fix 4: Enhanced Proxy Route Protection',
        'severity': 'High',
        'desc': 'Updated <font face="Courier">proxy.ts</font> with explicit public route whitelist, '
                'comprehensive NextAuth route handling, and 401 protection for all '
                '<font face="Courier">/api/*</font> routes. Fixed diagnose endpoint to reduce information '
                'disclosure for non-admin users and handle DB errors gracefully with server error responses.',
    },
    {
        'title': 'Fix 5: Consistent Password Policy & Atomic Token Consumption',
        'severity': 'High',
        'desc': 'Raised self-service reset minimum to 8 characters with uppercase and number requirements '
                '(matching admin policy). Implemented atomic token consumption using '
                '<font face="Courier">updateMany</font> with <font face="Courier">WHERE usedAt=null AND '
                'expiresAt > now()</font> to prevent TOCTOU race condition. Added '
                '<font face="Courier">passwordChangedAt</font> update on self-service reset (was missing).',
    },
]

for fix in fixes:
    sev_color = '#DC2626' if fix['severity'] == 'Critical' else '#EA580C'
    story.append(Paragraph(
        f'{fix["title"]} <font color="{sev_color}">[{fix["severity"]}]</font>',
        styles['SubSectionTitle']
    ))
    story.append(Paragraph(fix['desc'], styles['BodyText2']))

# ─── 5. Production Verification ──────────────────────────────
story.append(PageBreak())
story.append(Paragraph('5. Production Verification Results', styles['SectionTitle']))

story.append(Paragraph(
    'After deploying the fixes to Vercel production and running the fix-auth script against the Neon '
    'PostgreSQL database, comprehensive verification was performed.',
    styles['BodyText2']
))

story.append(Paragraph('Database Fix Results:', styles['SubSectionTitle']))
fix_results = [
    ['Account', 'Password Reset', 'Active', 'Not Deleted', 'Rate Limits Cleared', 'Final Status'],
    ['owner@alreef.ae', 'PASS', 'PASS', 'PASS', 'PASS', 'PASS'],
    ['admin@alreef.ae', 'PASS', 'PASS', 'PASS', 'PASS', 'PASS'],
    ['accountant@alreef.ae', 'PASS', 'PASS', 'PASS', 'PASS', 'PASS'],
    ['staff@alreef.ae', 'PASS', 'PASS', 'PASS', 'PASS', 'PASS'],
]
fix_table = Table(fix_results, colWidths=[35*mm, 22*mm, 16*mm, 20*mm, 25*mm, 18*mm])
fix_table.setStyle(TableStyle([
    ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
    ('FONTSIZE', (0, 0), (-1, -1), 8),
    ('BACKGROUND', (0, 0), (-1, 0), DEEP_TEAL),
    ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
    ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
    ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
    ('GRID', (0, 0), (-1, -1), 0.5, HexColor('#E2E8F0')),
    ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, HexColor('#F0FDF4')]),
    ('TOPPADDING', (0, 0), (-1, -1), 5),
    ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
]))
story.append(fix_table)

story.append(Paragraph('Playwright E2E Test Results:', styles['SubSectionTitle']))
test_results = [
    ['Test', 'Result'],
    ['Login: owner@alreef.ae', 'PASS'],
    ['Login: admin@alreef.ae', 'PASS'],
    ['Login: accountant@alreef.ae', 'PASS'],
    ['Login: staff@alreef.ae', 'PASS'],
    ['Empty fields validation', 'PASS'],
    ['Session persists on page refresh', 'PASS'],
    ['Email case-insensitive login', 'PASS'],
    ['Wrong password shows error', 'PASS'],
]
test_table = Table(test_results, colWidths=[80*mm, 30*mm])
test_table.setStyle(TableStyle([
    ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
    ('FONTSIZE', (0, 0), (-1, -1), 9),
    ('BACKGROUND', (0, 0), (-1, 0), DEEP_TEAL),
    ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
    ('TEXTCOLOR', (1, 1), (1, -1), HexColor('#16A34A')),
    ('FONTNAME', (1, 1), (1, -1), 'Helvetica-Bold'),
    ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
    ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
    ('GRID', (0, 0), (-1, -1), 0.5, HexColor('#E2E8F0')),
    ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, HexColor('#F0FDF4')]),
    ('TOPPADDING', (0, 0), (-1, -1), 5),
    ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
]))
story.append(test_table)

# ─── 6. Monitoring ───────────────────────────────────────────
story.append(Paragraph('6. Monitoring & Observability', styles['SectionTitle']))
story.append(Paragraph(
    'A new <font face="Courier">/api/auth/health</font> endpoint has been added for real-time '
    'authentication system diagnostics. This admin-only endpoint provides the following monitoring data:',
    styles['BodyText2']
))
monitoring_items = [
    'Database connectivity check with response time measurement',
    'NEXTAUTH_SECRET status verification (present, length, strength)',
    'Active lockout count and total rate limit entries',
    'Auth metrics: total attempts, successful/failed logins, DB errors, rate limit triggers',
    'Environment variable presence validation',
    'Last DB error timestamp for incident correlation',
]
for item in monitoring_items:
    story.append(Paragraph(f'<bullet>&bull;</bullet> {item}', styles['BulletText']))

story.append(Paragraph(
    'The auth metrics are accumulated in-memory per serverless instance and reset on cold start. '
    'They provide real-time visibility into authentication patterns and can be used to detect '
    'brute-force attacks, DB connectivity degradation, or configuration issues.',
    styles['BodyText2']
))

# ─── 7. Automated Test Coverage ──────────────────────────────
story.append(Paragraph('7. Automated Test Coverage', styles['SectionTitle']))
story.append(Paragraph(
    'A comprehensive Playwright E2E test suite has been added at '
    '<font face="Courier">e2e/auth.spec.ts</font> covering the following scenarios:',
    styles['BodyText2']
))

test_coverage = [
    'Successful login for every role (owner, admin, accountant, staff)',
    'Repeated login/logout cycle stability (3 cycles)',
    'Invalid password error display without false lockout',
    'Empty field validation',
    'Session persistence across page refreshes',
    'Email case-insensitivity',
    'Concurrent sessions in multiple tabs',
    'Role-based access control (staff cannot view financials, owner cannot access admin settings)',
    'Production verification mode (RUN_PRODUCTION_TESTS=1)',
]
for item in test_coverage:
    story.append(Paragraph(f'<bullet>&bull;</bullet> {item}', styles['BulletText']))

# ─── 8. Recommendations ──────────────────────────────────────
story.append(Paragraph('8. Recommendations', styles['SectionTitle']))

recommendations = [
    {
        'title': 'Implement 2FA in Login Flow',
        'priority': 'High',
        'desc': 'The 2FA system is fully implemented (setup, verify, enable, validate, disable) but is '
                'never checked during login. A user with 2FA enabled can log in without providing a TOTP code. '
                'Integrate the 2FA validation step into the login flow after successful credential verification.',
    },
    {
        'title': 'Add Server-Side Session Invalidation',
        'priority': 'Medium',
        'desc': 'When an admin deactivates a user or changes their role, the existing JWT remains valid for '
                'up to 8 hours. Implement a token blacklist or short-lived token rotation to ensure role changes '
                'and deactivations take effect immediately.',
    },
    {
        'title': 'Hash 2FA Backup Codes',
        'priority': 'Medium',
        'desc': 'Backup codes are currently stored as plaintext JSON in the database. If the DB is compromised, '
                'all backup codes are immediately usable. Hash them with bcrypt like passwords.',
    },
    {
        'title': 'Enforce mustChangePassword',
        'priority': 'Low',
        'desc': 'The mustChangePassword field is set on users but never enforced in the UI or middleware. '
                'Users with this flag can use the application without changing their password.',
    },
    {
        'title': 'Add Rate Limiting to 2FA Validation',
        'priority': 'Medium',
        'desc': 'The /api/auth/2fa/validate endpoint has no rate limiting. An attacker who knows the email '
                'could brute-force TOTP codes (6 digits = 1M possibilities, ~30 second window).',
    },
]

for rec in recommendations:
    pri_color = '#DC2626' if rec['priority'] == 'High' else '#CA8A04' if rec['priority'] == 'Medium' else '#2563EB'
    story.append(Paragraph(
        f'{rec["title"]} <font color="{pri_color}">[{rec["priority"]}]</font>',
        styles['SubSectionTitle']
    ))
    story.append(Paragraph(rec['desc'], styles['BodyText2']))

# ─── Build PDF ───────────────────────────────────────────────
def add_page_number(canvas, doc):
    canvas.saveState()
    canvas.setFont('Helvetica', 8)
    canvas.setFillColor(MUTED_TEXT)
    canvas.drawCentredString(A4[0] / 2, 15*mm, f'Page {doc.page}')
    # Header line
    canvas.setStrokeColor(HexColor('#E2E8F0'))
    canvas.setLineWidth(0.5)
    canvas.line(25*mm, A4[1] - 18*mm, A4[0] - 25*mm, A4[1] - 18*mm)
    canvas.restoreState()

doc.build(story, onFirstPage=add_page_number, onLaterPages=add_page_number)
print(f'PDF generated: {OUTPUT_PATH}')
