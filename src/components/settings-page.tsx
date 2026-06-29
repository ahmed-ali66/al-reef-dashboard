'use client'

import { useState } from 'react'
import { useAppStore } from '@/lib/store'
import { t } from '@/lib/i18n'
import type { Language } from '@/lib/i18n'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Shield,
  Users,
  Database,
  Upload,
  Settings,
} from 'lucide-react'
import UserManagement from '@/components/user-management'
import TwoFactorSettings from '@/components/two-factor-settings'
import DataImport from '@/components/data-import'
import SystemSettings from '@/components/system-settings'

export default function SettingsPage() {
  const { language } = useAppStore()
  const lang = language as Language
  const [activeTab, setActiveTab] = useState('users')

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Shield className="w-7 h-7 text-deep-teal" />
          {lang === 'en' ? 'Settings' : lang === 'ar' ? 'الإعدادات' : lang === 'bn' ? 'সেটিংস' : 'ترتیبات'}
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          {lang === 'en'
            ? 'System administration, security, and data management'
            : lang === 'ar'
            ? 'إدارة النظام والأمان وإدارة البيانات'
            : lang === 'bn'
            ? 'সিস্টেম প্রশাসন, নিরাপত্তা এবং ডেটা ম্যানেজমেন্ট'
            : 'سسٹم انتظامیہ، سیکیورٹی اور ڈیٹا مینجمنٹ'}
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4 lg:w-[600px]">
          <TabsTrigger value="users" className="gap-1.5">
            <Users className="w-4 h-4 hidden sm:block" />
            {lang === 'en' ? 'Users' : lang === 'ar' ? 'المستخدمين' : lang === 'bn' ? 'ব্যবহারকারী' : 'صارفین'}
          </TabsTrigger>
          <TabsTrigger value="security" className="gap-1.5">
            <Shield className="w-4 h-4 hidden sm:block" />
            {lang === 'en' ? 'Security' : lang === 'ar' ? 'الأمان' : lang === 'bn' ? 'নিরাপত্তা' : 'سیکیورٹی'}
          </TabsTrigger>
          <TabsTrigger value="import" className="gap-1.5">
            <Upload className="w-4 h-4 hidden sm:block" />
            {lang === 'en' ? 'Import' : lang === 'ar' ? 'استيراد' : lang === 'bn' ? 'ইম্পোর্ট' : 'امپورٹ'}
          </TabsTrigger>
          <TabsTrigger value="system" className="gap-1.5">
            <Settings className="w-4 h-4 hidden sm:block" />
            {lang === 'en' ? 'System' : lang === 'ar' ? 'النظام' : lang === 'bn' ? 'সিস্টেম' : 'سسٹم'}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="users" className="mt-6">
          <UserManagement />
        </TabsContent>

        <TabsContent value="security" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="w-5 h-5" />
                {lang === 'en'
                  ? 'Account Security'
                  : lang === 'ar'
                  ? 'أمان الحساب'
                  : lang === 'bn'
                  ? 'অ্যাকাউন্ট নিরাপত্তা'
                  : 'اکاؤنٹ سیکیورٹی'}
              </CardTitle>
              <CardDescription>
                {lang === 'en'
                  ? 'Manage two-factor authentication and security settings for your account'
                  : lang === 'ar'
                  ? 'إدارة المصادقة الثنائية وإعدادات الأمان لحسابك'
                  : lang === 'bn'
                  ? 'আপনার অ্যাকাউন্টের জন্য দুই-ফ্যাক্টর প্রমাণীকরণ এবং নিরাপত্তা সেটিংস পরিচালনা করুন'
                  : 'اپنے اکاؤنٹ کے لیے دو عنصر کی تصدیق اور سیکیورٹی ترتیبات کا نظم کریں'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <TwoFactorSettings />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="import" className="mt-6">
          <DataImport />
        </TabsContent>

        <TabsContent value="system" className="mt-6">
          <SystemSettings />
        </TabsContent>
      </Tabs>

      {/* Quick access to System Management for backup/health */}
      <Card className="border-dashed border-2">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Database className="w-4 h-4 text-muted-foreground" />
            {lang === 'en'
              ? 'Data Protection & System Health'
              : lang === 'ar'
              ? 'حماية البيانات وصحة النظام'
              : lang === 'bn'
              ? 'ডেটা সুরক্ষা এবং সিস্টেম স্বাস্থ্য'
              : 'ڈیٹا پروٹیکشن اور سسٹم صحت'}
          </CardTitle>
          <CardDescription>
            {lang === 'en'
              ? 'Backup management, data integrity checks, and system health monitoring are available in the System Management page.'
              : lang === 'ar'
              ? 'إدارة النسخ الاحتياطي وفحوصات سلامة البيانات ومراقبة صحة النظام متاحة في صفحة إدارة النظام.'
              : lang === 'bn'
              ? 'ব্যাকআপ ম্যানেজমেন্ট, ডেটা ইন্টিগ্রিটি চেক এবং সিস্টেম হেলথ মনিটরিং সিস্টেম ম্যানেজমেন্ট পৃষ্ঠায় উপলব্ধ।'
              : 'بیک اپ مینجمنٹ، ڈیٹا انٹیگریٹی چیکس، اور سسٹم ہیلتھ مانیٹرنگ سسٹم مینجمنٹ پیج میں دستیاب ہیں۔'}
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  )
}
