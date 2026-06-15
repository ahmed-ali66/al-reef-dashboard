'use client'

import { useRef, useState } from 'react'
import type { TenantData, PropertyData } from '@/lib/types'
import { formatAED, formatDate } from '@/lib/utils'
import { t, type Language } from '@/lib/i18n'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Download, Loader2 } from 'lucide-react'

interface BillInvoiceProps {
  tenant: TenantData
  property: PropertyData | undefined
  month: number
  year: number
  paymentStatus: 'paid' | 'partial' | 'overdue' | 'unpaid' | 'due-soon'
  paidAmount: number
  language: Language
  onClose?: () => void
}

export default function BillInvoice({
  tenant,
  property,
  month,
  year,
  paymentStatus,
  paidAmount,
  language,
}: BillInvoiceProps) {
  const invoiceRef = useRef<HTMLDivElement>(null)
  const [includeMuniFee, setIncludeMuniFee] = useState(!!tenant.municipalityFee && Number(tenant.municipalityFee) > 0)
  const [downloading, setDownloading] = useState(false)

  const muniFee = includeMuniFee ? Number(tenant.municipalityFee) || 0 : 0
  const openingBalance = Number(tenant.openingBalance) || 0
  const creditBalance = Number(tenant.creditBalance) || 0
  const currentCharges = tenant.rentAmount + muniFee
  const totalDue = openingBalance + currentCharges - creditBalance
  const remaining = totalDue - paidAmount
  const invoiceNumber = `INV-${year}${String(month).padStart(2, '0')}-${tenant.unitNumber || '000'}`
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
  const invoiceDate = new Date()
  const dueDay = 5
  const dueDate = new Date(year, month - 1, dueDay)

  const statusLabel = () => {
    switch (paymentStatus) {
      case 'paid': return t('paid', language)
      case 'partial': return t('partial', language)
      case 'overdue': return t('overdue', language)
      case 'unpaid': return t('unpaid', language)
      case 'due-soon': return t('dueSoon', language)
      default: return paymentStatus
    }
  }

  const statusColor = () => {
    switch (paymentStatus) {
      case 'paid': return '#0D7C3D'
      case 'partial': return '#D97706'
      case 'overdue': return '#DC2626'
      case 'unpaid': return '#EA580C'
      case 'due-soon': return '#CA8A04'
      default: return '#6B7280'
    }
  }

  const handleDownloadPDF = async () => {
    try {
      setDownloading(true)

      // Server-side PDF generation — produces device-independent output
      // with embedded fonts for consistent rendering across all platforms
      const params = new URLSearchParams({
        tenantId: tenant.id,
        month: String(month),
        year: String(year),
        includeMuniFee: String(includeMuniFee),
      })

      const res = await fetch(`/api/invoices/pdf?${params}`)
      if (!res.ok) {
        throw new Error(`PDF generation failed: ${res.status}`)
      }

      const blob = await res.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${invoiceNumber}.pdf`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
    } catch (error) {
      console.error('PDF generation failed:', error)
      alert('Failed to generate PDF. Please try again.')
    } finally {
      setDownloading(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* Municipality Fee Toggle */}
      <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
        <div className="flex items-center gap-3">
          <Label htmlFor="muni-fee-toggle" className="text-sm font-medium cursor-pointer">
            {t('includeMunicipalityFee', language)}
          </Label>
          <span className="text-xs text-muted-foreground">
            ({t('municipalityFee', language)})
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">{t('no', language)}</span>
          <Switch
            id="muni-fee-toggle"
            checked={includeMuniFee}
            onCheckedChange={setIncludeMuniFee}
          />
          <span className="text-xs text-muted-foreground">{t('yes', language)}</span>
        </div>
      </div>

      {/* Printable Invoice */}
      <div
        ref={invoiceRef}
        data-invoice-content
        className="bg-white text-gray-900 p-8 max-w-[210mm] mx-auto"
        style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}
      >
        {/* Header */}
        <div className="flex justify-between items-start border-b-2 border-emerald-600 pb-4 mb-6">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <div className="w-10 h-10 rounded bg-emerald-600 flex items-center justify-center text-white font-bold text-lg">AM</div>
              <div>
                <h1 className="text-xl font-bold text-emerald-700">Al Reef Al Madeena</h1>
                <p className="text-xs text-gray-500">Real Estate Management and General Maintenance - L.L.C - S.P.C</p>
              </div>
            </div>
            <div className="text-xs text-gray-500 mt-2 space-y-0.5">
              <p>Near LuLu Muraba'a, Al Ain City, Abu Dhabi, UAE</p>
              <p>Tel: +971504225590 / +971568452161 | Email: alreef.junoobi@gmail.com</p>
              <p>{t('taxId', language)}: 105383159800003</p>
              <p>{t('commercialLicense', language)}: CN-6177648</p>
            </div>
          </div>
          <div className="text-right">
            <h2 className="text-2xl font-bold text-emerald-700">{t('invoice', language)}</h2>
            <div className="text-sm text-gray-600 mt-1 space-y-0.5">
              <p><span className="font-medium">{t('invoiceNumber', language)}:</span> {invoiceNumber}</p>
              <p><span className="font-medium">{t('invoiceDate', language)}:</span> {formatDate(invoiceDate.toISOString())}</p>
              <p><span className="font-medium">{t('dueDate', language)}:</span> {formatDate(dueDate.toISOString())}</p>
            </div>
          </div>
        </div>

        {/* Bill To */}
        <div className="mb-6 bg-gray-50 rounded-lg p-4">
          <h3 className="text-sm font-semibold text-emerald-700 mb-2">{t('billTo', language)}</h3>
          <div className="grid grid-cols-2 gap-x-8 gap-y-1 text-sm">
            <div>
              <p className="font-semibold text-gray-900">{tenant.name}</p>
              {tenant.nameAr && <p className="text-gray-600" dir="rtl">{tenant.nameAr}</p>}
            </div>
            <div className="text-right text-sm text-gray-600">
              <p>{property?.name || ''}</p>
              <p>{t('unitNumber', language)}: {tenant.unitNumber || '—'}</p>
              <p>{t('floor2', language)}: {tenant.floor || '—'}</p>
            </div>
            <div className="text-gray-600">
              {tenant.phone && <p>{t('phone', language)}: {tenant.phone}</p>}
              {tenant.emiratesId && <p>{t('emiratesId', language)}: {tenant.emiratesId}</p>}
            </div>
            <div className="text-right text-gray-600">
              {tenant.nationality && <p>{t('nationality', language)}: {tenant.nationality}</p>}
              {tenant.employer && <p>{t('employer2', language)}: {tenant.employer}</p>}
            </div>
          </div>
        </div>

        {/* Invoice Items */}
        <table className="w-full mb-6 text-sm">
          <thead>
            <tr className="bg-emerald-600 text-white">
              <th className="text-left py-2 px-4 rounded-tl-md">#</th>
              <th className="text-left py-2 px-4">{t('description', language)}</th>
              <th className="text-right py-2 px-4">{t('amount', language)}</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-gray-200">
              <td className="py-3 px-4 text-gray-500">1</td>
              <td className="py-3 px-4">
                <p className="font-medium text-gray-900">{t('monthlyRent', language)} — {monthNames[month - 1]} {year}</p>
                <p className="text-xs text-gray-500">{property?.name || ''} — {t('unitNumber', language)}: {tenant.unitNumber || '—'}</p>
              </td>
              <td className="py-3 px-4 text-right font-medium">{formatAED(tenant.rentAmount)}</td>
            </tr>
            {includeMuniFee && (
              <tr className="border-b border-gray-200">
                <td className="py-3 px-4 text-gray-500">2</td>
                <td className="py-3 px-4">
                  <p className="font-medium text-gray-900">{t('municipalityFee', language)}</p>
                  <p className="text-xs text-gray-500">5% of {formatAED(tenant.rentAmount)}</p>
                </td>
                <td className="py-3 px-4 text-right font-medium">{formatAED(muniFee)}</td>
              </tr>
            )}
          </tbody>
        </table>

        {/* Financial Summary */}
        <div className="flex justify-end mb-6">
          <div className="w-80">
            {openingBalance > 0 && (
              <div className="flex justify-between py-1.5 text-sm">
                <span className="text-amber-700">{t('openingBalance', language)}</span>
                <span className="font-medium text-amber-800">{formatAED(openingBalance)}</span>
              </div>
            )}
            <div className="flex justify-between py-1.5 text-sm">
              <span className="text-gray-600">{t('currentCharges', language)}</span>
              <span className="font-medium">{formatAED(currentCharges)}</span>
            </div>
            {includeMuniFee && (
              <div className="flex justify-between py-1 text-xs text-gray-500">
                <span className="ml-4">{t('rent', language)}</span>
                <span>{formatAED(tenant.rentAmount)}</span>
              </div>
            )}
            {includeMuniFee && (
              <div className="flex justify-between py-1 text-xs text-gray-500">
                <span className="ml-4">{t('municipalityFee', language)}</span>
                <span>{formatAED(muniFee)}</span>
              </div>
            )}
            {creditBalance > 0 && (
              <div className="flex justify-between py-1.5 text-sm">
                <span className="text-emerald-700">{t('creditBalance', language)}</span>
                <span className="font-medium text-emerald-700">({formatAED(creditBalance)})</span>
              </div>
            )}
            <div className="border-t-2 border-emerald-600 flex justify-between py-2">
              <span className="font-bold text-emerald-700">{t('totalDue', language)}</span>
              <span className="font-bold text-emerald-700 text-lg">{formatAED(Math.max(0, totalDue))}</span>
            </div>
            {paidAmount > 0 && (
              <div className="flex justify-between py-1.5 text-sm text-emerald-600">
                <span>{t('paymentsReceived', language)}</span>
                <span>-{formatAED(paidAmount)}</span>
              </div>
            )}
            <div className="flex justify-between py-2 border-t border-gray-300">
              <span className="font-bold text-gray-700">{t('remainingBalance', language)}</span>
              <span className="font-bold text-red-600">{formatAED(Math.max(0, remaining))}</span>
            </div>
          </div>
        </div>

        {/* Payment Status */}
        <div className="flex items-center justify-between bg-gray-50 rounded-lg p-4 mb-6">
          <div>
            <p className="text-xs text-gray-500">{t('paymentStatus', language)}</p>
            <p className="font-bold text-lg" style={{ color: statusColor() }}>{statusLabel()}</p>
          </div>
          <div className="text-right text-xs text-gray-500">
            <p>{t('leaseStart', language)}: {tenant.leaseStart ? formatDate(tenant.leaseStart) : '—'}</p>
            <p>{t('leaseEnd', language)}: {tenant.leaseEnd ? formatDate(tenant.leaseEnd) : '—'}</p>
          </div>
        </div>



        {/* Footer */}
        <div className="border-t border-gray-200 pt-4 text-center text-xs text-gray-400">
          <p>Al Reef Al Madeena Real Estate Management and General Maintenance - L.L.C - S.P.C | Near LuLu Muraba'a, Al Ain City, Abu Dhabi, UAE</p>
          <p>Thank you for your payment. For questions, contact alreef.junoobi@gmail.com or +971504225590</p>
        </div>
      </div>

      {/* Download Button */}
      <div className="flex justify-center">
        <Button
          onClick={handleDownloadPDF}
          disabled={downloading}
          className="bg-emerald hover:bg-emerald/90 text-white"
        >
          {downloading ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <Download className="w-4 h-4 mr-2" />
          )}
          {downloading ? t('loading', language) : t('downloadBill', language)}
        </Button>
      </div>
    </div>
  )
}
