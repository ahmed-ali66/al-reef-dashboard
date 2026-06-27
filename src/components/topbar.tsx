'use client'

import { useAppStore } from '@/lib/store'
import Notifications from '@/components/notifications'
import { Menu, Globe } from 'lucide-react'
import { useState, useEffect, useRef } from 'react'
import { cn2 } from '@/lib/utils'
import type { Language } from '@/lib/i18n'

export default function Topbar() {
  const { authUser, sidebarOpen, toggleSidebar, language, setLanguage } = useAppStore()
  const [langOpen, setLangOpen] = useState(false)
  const langRef = useRef<HTMLDivElement>(null)

  // Close lang dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (langRef.current && !langRef.current.contains(event.target as Node)) {
        setLangOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const languages = [
    { code: 'en', label: 'English', flag: '🇬🇧' },
    { code: 'ar', label: 'العربية', flag: '🇦🇪' },
    { code: 'bn', label: 'বাংলা', flag: '🇧🇩' },
    { code: 'ur', label: 'اردو', flag: '🇵🇰' },
  ]

  const currentLang = languages.find(l => l.code === language) || languages[0]

  return (
    <header className="sticky top-0 z-30 bg-deep-teal text-white shadow-md">
      <div className="flex items-center justify-between px-4 h-14">
        {/* Left: Menu toggle + user info */}
        <div className="flex items-center gap-3">
          <button
            onClick={toggleSidebar}
            className="p-2 hover:bg-white/10 rounded-lg transition-colors"
            title="Toggle menu"
          >
            <Menu className="w-5 h-5" />
          </button>
          <div className="hidden sm:block">
            <p className="text-sm font-medium leading-tight">{authUser?.name}</p>
            <p className="text-[10px] text-white/60 leading-tight uppercase tracking-wider">{authUser?.role}</p>
          </div>
        </div>

        {/* Right: Language + Notifications */}
        <div className="flex items-center gap-1">
          {/* Language selector */}
          <div className="relative" ref={langRef}>
            <button
              onClick={() => setLangOpen(!langOpen)}
              className="flex items-center gap-1.5 px-2 py-1.5 hover:bg-white/10 rounded-lg transition-colors text-sm"
              title="Language"
            >
              <Globe className="w-4 h-4" />
              <span className="hidden sm:inline">{currentLang.flag}</span>
            </button>
            {langOpen && (
              <div className="absolute top-full right-0 mt-1 w-40 bg-white rounded-lg shadow-xl border border-border overflow-hidden z-50">
                {languages.map(lang => (
                  <button
                    key={lang.code}
                    onClick={() => {
                      setLanguage(lang.code as Language)
                      setLangOpen(false)
                    }}
                    className={cn2(
                      'w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-muted transition-colors',
                      language === lang.code && 'bg-deep-teal/10 text-deep-teal font-medium'
                    )}
                  >
                    <span className="text-base">{lang.flag}</span>
                    <span className="text-foreground">{lang.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Notifications bell */}
          <Notifications />
        </div>
      </div>
    </header>
  )
}
