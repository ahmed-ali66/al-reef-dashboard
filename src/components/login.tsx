'use client'

import { useState } from 'react'
import { signIn } from 'next-auth/react'
import { useAppStore } from '@/lib/store'
import { t, languageNames, rtlLanguages } from '@/lib/i18n'
import type { Language } from '@/lib/i18n'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Moon, Languages, Loader2, Shield, KeyRound, ArrowLeft, CheckCircle2, Send, Lock, AlertTriangle } from 'lucide-react'

export default function LoginPage() {
  const { language, setLanguage } = useAppStore()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [errorType, setErrorType] = useState<'generic' | 'lockout' | 'inactive' | 'not_found' | 'server_error'>('generic')
  const [loading, setLoading] = useState(false)
  const [showForgotPassword, setShowForgotPassword] = useState(false)
  const [resetEmail, setResetEmail] = useState('')
  const [resetName, setResetName] = useState('')
  const [resetMessage, setResetMessage] = useState('')
  const [resetSent, setResetSent] = useState(false)
  const isRtl = rtlLanguages.includes(language)

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setErrorType('generic')
    setLoading(true)

    try {
      // Use the standard NextAuth signIn flow.
      // The middleware.ts pass-through fix allows /api/auth/* endpoints to work on Vercel.
      const result = await signIn('credentials', {
        email: email.trim(),
        password,
        redirect: false,
      })

      if (result?.error) {
        // Map NextAuth error codes to user-friendly messages
        if (result.error === 'CredentialsSignin') {
          setError(t('loginError', language))
        } else {
          setError(result.error)
        }
        setErrorType('generic')
      } else {
        // Success — reload to establish session
        window.location.reload()
        return
      }
    } catch {
      setError(t('loginError', language))
      setErrorType('generic')
    } finally {
      setLoading(false)
    }
  }

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!resetEmail) return

    try {
      const res = await fetch('/api/reset-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: resetEmail,
          name: resetName,
          message: resetMessage,
        }),
      })

      // Always show success to prevent email enumeration
      setResetSent(true)
    } catch {
      setResetSent(true)
    }
  }

  return (
    <div className="min-h-screen flex" dir={isRtl ? 'rtl' : 'ltr'}>
      {/* Left side - Islamic geometric pattern background */}
      <div className="hidden lg:flex lg:w-1/2 islamic-pattern-full flex-col items-center justify-center p-12 text-white relative overflow-hidden">
        {/* Decorative circles */}
        <div className="absolute top-10 left-10 w-32 h-32 rounded-full border border-gold/20" />
        <div className="absolute bottom-20 right-10 w-48 h-48 rounded-full border border-gold/10" />
        <div className="absolute top-1/3 right-20 w-24 h-24 rounded-full border border-white/5" />

        <div className="relative z-10 text-center">
          <div className="w-20 h-20 rounded-2xl bg-gold/20 flex items-center justify-center mx-auto mb-6 shadow-lg shadow-gold/10 animate-skyline-float">
            <Moon className="w-10 h-10 text-gold" />
          </div>
          <h1 className="text-3xl font-bold mb-2">
            {t('loginTitle', language)}
          </h1>
          <p className="text-white/70 text-lg mb-8">
            {t('loginSubtitle', language)}
          </p>
          <div className="bg-white/5 rounded-xl p-6 backdrop-blur-sm border border-white/10 max-w-sm mx-auto">
            <Shield className="w-8 h-8 text-gold mx-auto mb-3" />
            <p className="text-white/80 text-sm">
              {language === 'en' && 'Secure access with role-based permissions. Staff cannot view financial data.'}
              {language === 'ar' && 'وصول آمن مع صلاحيات قائمة على الأدوار. لا يمكن للموظفين عرض البيانات المالية.'}
              {language === 'bn' && 'ভূমিকা-ভিত্তিক অনুমতি সহ নিরাপদ অ্যাক্সেস। কর্মীরা আর্থিক তথ্য দেখতে পারবেন না।'}
              {language === 'ur' && 'کردار پر مبنی اجازت کے ساتھ محفوظ رسائی۔ اسٹاف مالیاتی ڈیٹا نہیں دیکھ سکتے۔'}
            </p>
          </div>
        </div>
      </div>

      {/* Right side - Login form */}
      <div className="flex-1 flex items-center justify-center p-8 bg-cream">
        <div className="w-full max-w-md">
          {/* Language selector */}
          <div className="flex justify-end mb-8">
            <div className="flex items-center gap-2">
              <Languages className="w-4 h-4 text-muted-foreground" />
              <div className="flex gap-1">
                {(Object.keys(languageNames) as Language[]).map((lang) => (
                  <button
                    key={lang}
                    onClick={() => setLanguage(lang)}
                    className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                      language === lang
                        ? 'bg-deep-teal text-white'
                        : 'bg-muted text-muted-foreground hover:bg-muted/80'
                    }`}
                  >
                    {lang.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Mobile logo */}
          <div className="lg:hidden flex items-center gap-3 mb-8">
            <div className="w-12 h-12 rounded-xl bg-deep-teal flex items-center justify-center">
              <Moon className="w-6 h-6 text-gold" />
            </div>
            <div>
              <h2 className="font-bold text-lg text-foreground">{t('loginTitle', language)}</h2>
              <p className="text-sm text-muted-foreground">{t('loginSubtitle', language)}</p>
            </div>
          </div>

          {/* Login form */}
          {!showForgotPassword ? (
            <div className="bg-white rounded-2xl shadow-lg border border-border p-8 animate-door-open">
              <h2 className="text-2xl font-bold mb-2">{t('login', language)}</h2>
              <p className="text-muted-foreground text-sm mb-6">
                {language === 'en' && 'Enter your credentials to access the dashboard'}
                {language === 'ar' && 'أدخل بيانات الاعتماد الخاصة بك للوصول إلى لوحة التحكم'}
                {language === 'bn' && 'ড্যাশবোর্ড অ্যাক্সেস করতে আপনার পরিচয়পত্র লিখুন'}
                {language === 'ur' && 'ڈیش بورڈ تک رسائی کے لیے اپنی اسناد درج کریں'}
              </p>

              {error && (
                <div className={`px-4 py-3 rounded-lg text-sm mb-4 animate-fade-in-up flex items-start gap-2 ${
                  errorType === 'lockout'
                    ? 'bg-amber-50 border border-amber-200 text-amber-700'
                    : errorType === 'inactive'
                    ? 'bg-orange-50 border border-orange-200 text-orange-700'
                    : errorType === 'server_error'
                    ? 'bg-blue-50 border border-blue-200 text-blue-700'
                    : 'bg-red-50 border border-red-200 text-red-700'
                }`}>
                  {errorType === 'lockout' ? (
                    <Lock className="w-4 h-4 mt-0.5 shrink-0" />
                  ) : errorType === 'inactive' ? (
                    <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                  ) : errorType === 'server_error' ? (
                    <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                  ) : null}
                  <span>{error}</span>
                </div>
              )}

              <form onSubmit={handleLogin} className="space-y-4">
                <div>
                  <Label htmlFor="email">{t('email', language)}</Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="owner@alreef.ae"
                    className="mt-1.5"
                    required
                    autoComplete="email"
                  />
                </div>
                <div>
                  <Label htmlFor="password">{t('password', language)}</Label>
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="mt-1.5"
                    required
                    autoComplete="current-password"
                  />
                </div>
                <Button
                  type="submit"
                  className="w-full bg-deep-teal hover:bg-deep-teal/90 text-white h-11"
                  disabled={loading || !email || !password}
                >
                  {loading ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    t('signInButton', language)
                  )}
                </Button>
              </form>

              {/* Forgot Password Link */}
              <div className="mt-4 text-center">
                <button
                  type="button"
                  onClick={() => {
                    setShowForgotPassword(true)
                    setResetSent(false)
                    setResetEmail('')
                    setResetName('')
                    setResetMessage('')
                  }}
                  className="text-sm text-deep-teal hover:text-deep-teal/80 font-medium flex items-center justify-center gap-1.5 mx-auto transition-colors"
                >
                  <KeyRound className="w-3.5 h-3.5" />
                  {t('forgotPassword', language)}
                </button>
              </div>
            </div>
          ) : (
            /* Forgot Password Form */
            <div className="bg-white rounded-2xl shadow-lg border border-border p-8">
              {!resetSent ? (
                <>
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-12 h-12 rounded-xl bg-amber-100 flex items-center justify-center shrink-0">
                      <KeyRound className="w-6 h-6 text-amber-600" />
                    </div>
                    <div>
                      <h2 className="text-2xl font-bold">{t('forgotPasswordTitle', language)}</h2>
                      <p className="text-muted-foreground text-sm mt-0.5">{t('forgotPasswordDesc', language)}</p>
                    </div>
                  </div>

                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6">
                    <div className="flex items-start gap-3">
                      <Shield className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
                      <p className="text-sm font-medium text-amber-800">
                        {language === 'en' && 'A reset request will be sent to the system administrator. Kindly contact your System Administrator.'}
                        {language === 'ar' && 'سيتم إرسال طلب إعادة التعيين إلى مسؤول النظام. يرجى التواصل مع مسؤول النظام.'}
                        {language === 'bn' && 'সিস্টেম প্রশাসককে একটি রিসেট অনুরোধ পাঠানো হবে। অনুগ্রহ করে আপনার সিস্টেম প্রশাসকের সাথে যোগাযোগ করুন।'}
                        {language === 'ur' && 'سسٹم ایڈمن کو ری سیٹ کی درخواست بھیجی جائے گی۔ براہ کرم اپنے سسٹم ایڈمن سے رابطہ کریں۔'}
                      </p>
                    </div>
                  </div>

                  <form onSubmit={handleForgotPassword} className="space-y-4">
                    <div>
                      <Label htmlFor="reset-email">{t('yourEmail', language)} *</Label>
                      <Input
                        id="reset-email"
                        type="email"
                        value={resetEmail}
                        onChange={(e) => setResetEmail(e.target.value)}
                        placeholder="your.email@example.com"
                        className="mt-1.5"
                        required
                      />
                    </div>
                    <div>
                      <Label htmlFor="reset-name">
                        {language === 'en' && 'Your Full Name'}
                        {language === 'ar' && 'اسمك الكامل'}
                        {language === 'bn' && 'আপনার পুরো নাম'}
                        {language === 'ur' && 'آپ کا پورا نام'}
                      </Label>
                      <Input
                        id="reset-name"
                        type="text"
                        value={resetName}
                        onChange={(e) => setResetName(e.target.value)}
                        placeholder={language === 'en' ? 'Enter your name' : language === 'ar' ? 'أدخل اسمك' : language === 'bn' ? 'আপনার নাম লিখুন' : 'اپنا نام درج کریں'}
                        className="mt-1.5"
                      />
                    </div>
                    <div>
                      <Label htmlFor="reset-message">
                        {language === 'en' && 'Message (optional)'}
                        {language === 'ar' && 'رسالة (اختياري)'}
                        {language === 'bn' && 'বার্তা (ঐচ্ছিক)'}
                        {language === 'ur' && 'پیغام (اختیاری)'}
                      </Label>
                      <Input
                        id="reset-message"
                        type="text"
                        value={resetMessage}
                        onChange={(e) => setResetMessage(e.target.value)}
                        placeholder={language === 'en' ? 'e.g. I forgot my password' : language === 'ar' ? 'مثلاً نسيت كلمة المرور' : language === 'bn' ? 'যেমন আমি পাসওয়ার্ড ভুলে গেছি' : 'مثلاً میں پاس ورڈ بھول گیا'}
                        className="mt-1.5"
                      />
                    </div>
                    <Button
                      type="submit"
                      className="w-full bg-amber-600 hover:bg-amber-700 text-white h-11"
                      disabled={!resetEmail}
                    >
                      <Send className="w-4 h-4 mr-2" />
                      {t('sendResetRequest', language)}
                    </Button>
                  </form>
                </>
              ) : (
                <div className="text-center py-4">
                  <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
                    <CheckCircle2 className="w-8 h-8 text-green-600" />
                  </div>
                  <h2 className="text-xl font-bold mb-2">{t('resetRequestSent', language)}</h2>
                  <p className="text-muted-foreground text-sm mb-6">
                    {language === 'en' && 'Your reset request has been submitted successfully. The system administrator will review it and provide you with new credentials. Please contact your System Administrator for updates.'}
                    {language === 'ar' && 'تم تقديم طلب إعادة التعيين بنجاح. سيقوم مسؤول النظام بمراجعته وتزويدك ببيانات اعتماد جديدة. يرجى التواصل مع مسؤول النظام للحصول على التحديثات.'}
                    {language === 'bn' && 'আপনার রিসেট অনুরোধ সফলভাবে জমা দেওয়া হয়েছে। সিস্টেম প্রশাসক এটি পর্যালোচনা করবেন এবং আপনাকে নতুন পরিচয়পত্র দেবেন। আপডেটের জন্য আপনার সিস্টেম প্রশাসকের সাথে যোগাযোগ করুন।'}
                    {language === 'ur' && 'آپ کی ری سیٹ کی درخواست کامیابی سے جمع ہو گئی ہے۔ سسٹم ایڈمن اس کا جائزہ لیں گے اور آپ کو نئی اسناد فراہم کریں گے۔ اپ ڈیٹس کے لیے اپنے سسٹم ایڈمن سے رابطہ کریں۔'}
                  </p>
                </div>
              )}

              {/* Back to Login */}
              <div className="mt-4 pt-4 border-t text-center">
                <button
                  type="button"
                  onClick={() => {
                    setShowForgotPassword(false)
                    setResetSent(false)
                    setResetEmail('')
                    setResetName('')
                    setResetMessage('')
                  }}
                  className="text-sm text-deep-teal hover:text-deep-teal/80 font-medium flex items-center justify-center gap-1.5 mx-auto transition-colors"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  {t('backToLogin', language)}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
