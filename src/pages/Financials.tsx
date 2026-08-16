import React, { useState, useRef, useEffect, useMemo } from 'react'
import {
  DollarSign, TrendingUp, TrendingDown, Activity, ChevronDown, ChevronUp, Plus, X, Upload, Loader,
  Package, Percent, RefreshCw, Camera, Cloud, Edit3, Check, AlertTriangle, Calendar, Link as LinkIcon,
  BarChart3, FileText,
} from 'lucide-react'
// Removed Tesseract - using GoHighLevel API instead

// Error Boundary
class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean; error: Error | null }> {
  constructor(props: { children: React.ReactNode }) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Financials component error:', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '2rem', backgroundColor: '#fff3cd', border: '1px solid #ffc107', borderRadius: '4px', margin: '2rem' }}>
          <h2 style={{ color: '#856404', marginTop: 0 }}>⚠️ Error Loading Financials</h2>
          <p style={{ color: '#856404' }}>{this.state.error?.message || 'Unknown error'}</p>
          <details style={{ marginTop: '1rem', color: '#856404' }}>
            <summary>Stack trace:</summary>
            <pre style={{ backgroundColor: '#fff', padding: '1rem', borderRadius: '4px', overflow: 'auto', fontSize: '12px' }}>
              {this.state.error?.stack}
            </pre>
          </details>
          <button onClick={() => window.location.reload()} style={{ padding: '8px 16px', marginTop: '1rem', cursor: 'pointer' }}>
            Reload Page
          </button>
        </div>
      )
    }

    return this.props.children
  }
}

// Image enhancement utilities - aggressive preprocessing for receipt scanning
const enhanceImageQuality = async (base64Image: string): Promise<string> => {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      // Upscale 2x for better detail
      const canvas = document.createElement('canvas')
      const ctx = canvas.getContext('2d')!

      const originalWidth = img.width
      const originalHeight = img.height
      canvas.width = originalWidth * 2
      canvas.height = originalHeight * 2

      // Draw upscaled
      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(img, 0, 0, originalWidth, originalHeight, 0, 0, canvas.width, canvas.height)

      // Get image data
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
      const data = imageData.data

      // Aggressive preprocessing for receipt text
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i]
        const g = data[i + 1]
        const b = data[i + 2]
        const a = data[i + 3]

        // Convert to grayscale
        const gray = r * 0.299 + g * 0.587 + b * 0.114

        // Adaptive threshold - convert to black or white
        // This makes text much more readable
        const threshold = 130
        const final = gray > threshold ? 255 : 0

        data[i] = final
        data[i + 1] = final
        data[i + 2] = final
        data[i + 3] = a // Preserve alpha
      }

      ctx.putImageData(imageData, 0, 0)

      // Return enhanced image as base64 with max quality
      resolve(canvas.toDataURL('image/png').split(',')[1] || base64Image)
    }
    img.src = `data:image/jpeg;base64,${base64Image}`
  })
}

interface Expense {
  id: string
  date: string
  vendor: string
  category: string
  description: string
  amount: number
  status: 'pending' | 'approved' | 'reconciled' | 'rejected'
  receiptId?: string
  sourceType?: 'manual' | 'scan' | 'gdrive'
  approvedByName?: string | null
  approvedAt?: string | null
}

type Tab = 'overview' | 'expenses' | 'reports'

interface FinancialsOverview {
  month: string
  grossRevenue: number
  totalExpenses: number
  netOperatingProfit: number
  marginPct: number
  outstandingBalance: number
  outstandingCount: number
  compare: {
    mom: { grossRevenuePct: number; totalExpensesPct: number; label: string }
    yoy: { grossRevenuePct: number; totalExpensesPct: number; label: string }
  }
}

interface TrendPoint { month: string; revenue: number; expenses: number }

interface FinancialReportSnapshot {
  id: number
  period_start: string
  period_end: string
  gross_revenue_cents: number
  total_expenses_cents: number
  net_profit_cents: number
  generated_at: string
  snapshot_json: { expensesByCategory?: { category: string; amountCents: number }[] } | null
}

// One row per actual receipt (a Drive scan, manual entry, or screenshot
// entry) -- as opposed to Expense, which is one row per line item on it.
interface ReceiptSummary {
  id: number
  vendor: string
  receiptDate: string
  totalAmountCents: number | null
  driveViewLink: string | null
  lowConfidence: boolean
  itemCount: number
  itemsTotal: number
}

interface ReceiptItem {
  description: string
  amount: number
  category: string
  confidence: number
  quantity?: number
  unit?: string // grams, oz, ml, liters, lbs, kg, etc.
  productName?: string // User-assigned product name for database
}

// A receipt parsed by AI but not yet saved -- sits in the review queue so
// an admin can confirm/edit each item's suggested inventory display name
// before it's written to the database.
interface PendingReceiptItem {
  productName: string
  displayName: string
  price: number
  itemCount: number
  gramWeight: number | null
  quantity: number
  unit: string
  category: string
  amount: number
  confidence: number
}

interface PendingReceipt {
  driveFileId: string
  fileName: string
  vendor: string
  receiptTotal: number | null
  lowConfidence: boolean
  items: PendingReceiptItem[]
}

function Section({
  id,
  title,
  expandedSections,
  toggleSection,
  children,
}: {
  id: string
  title: React.ReactNode
  expandedSections: Record<string, boolean>
  toggleSection: (id: string) => void
  children: React.ReactNode
}) {
  return (
    <div className="rounded-2xl border border-[#E8DCC8] bg-white overflow-hidden">
      <button
        onClick={() => toggleSection(id)}
        className="w-full flex items-center justify-between p-6 hover:bg-[#FDFBF7] transition"
      >
        <h2 className="text-lg font-extrabold text-[#4B2B1D]">{title}</h2>
        {expandedSections[id] ? (
          <ChevronUp className="h-5 w-5 text-[#8B6F47]" />
        ) : (
          <ChevronDown className="h-5 w-5 text-[#8B6F47]" />
        )}
      </button>
      {expandedSections[id] && (
        <div className="border-t border-[#E8DCC8] p-6 space-y-4">
          {children}
        </div>
      )}
    </div>
  )
}

function FinancialsPage() {
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    weekly: true,
    meals: true,
    expenses: true,
    details: false,
    expenseForm: false,
    receiptScanner: false,
    receiptHistory: true,
    ledger: true,
  })

  const [expenses, setExpenses] = useState<Expense[]>([])
  const [expensesLoading, setExpensesLoading] = useState(true)
  const [receipts, setReceipts] = useState<ReceiptSummary[]>([])
  const [receiptsLoading, setReceiptsLoading] = useState(true)

  const [formData, setFormData] = useState<Partial<Expense>>({
    date: new Date().toISOString().split('T')[0],
    vendor: '',
    category: 'food_cogs',
    description: '',
    amount: 0,
    status: 'pending',
  })

  const [scannedReceipt, setScannedReceipt] = useState<{
    image: string
    text: string
    items: ReceiptItem[]
    vendor: string
    total: number
  } | null>(null)

  const [isProcessing, setIsProcessing] = useState(false)
  const [processingStatus, setProcessingStatus] = useState('')
  const [editingPriceIdx, setEditingPriceIdx] = useState<number | null>(null)
  const [editingPrice, setEditingPrice] = useState<string>('')
  const [receiptTab, setReceiptTab] = useState<'scanner' | 'screenshot' | 'gdrive' | 'manual'>('manual')
  const [screenshotItems, setScreenshotItems] = useState<ReceiptItem[]>([])
  const [screenshotVendor, setScreenshotVendor] = useState('')
  const [showScreenshotForm, setShowScreenshotForm] = useState(false)
  const [syncInProgress, setSyncInProgress] = useState(false)
  const [syncResult, setSyncResult] = useState<{ processed: number; failed: number; errors?: { filename: string; error: string }[] } | null>(null)
  const [pendingReceipts, setPendingReceipts] = useState<PendingReceipt[]>([])
  const [parseFailures, setParseFailures] = useState<{ filename: string; error: string }[]>([])
  const [confirmingReceipts, setConfirmingReceipts] = useState(false)
  const [manualItems, setManualItems] = useState<ReceiptItem[]>([
    { description: '', amount: 0, category: 'food_cogs', confidence: 1, productName: '', unit: 'count', quantity: undefined }
  ])
  const [manualVendor, setManualVendor] = useState('')
  const [manualDate, setManualDate] = useState(new Date().toISOString().split('T')[0])
  const fileInputRef = useRef<HTMLInputElement>(null)
  const screenshotInputRef = useRef<HTMLInputElement>(null)

  const [activeTab, setActiveTab] = useState<Tab>('overview')
  const [compareMode, setCompareMode] = useState<'mom' | 'yoy'>('mom')
  const [overview, setOverview] = useState<FinancialsOverview | null>(null)
  const [overviewLoading, setOverviewLoading] = useState(true)
  const [trend, setTrend] = useState<TrendPoint[]>([])
  const [selectedExpenseIds, setSelectedExpenseIds] = useState<Set<string>>(new Set())
  const [bulkActing, setBulkActing] = useState(false)
  const [reports, setReports] = useState<FinancialReportSnapshot[]>([])
  const [reportsLoading, setReportsLoading] = useState(true)
  const [generatingReport, setGeneratingReport] = useState(false)
  const [viewingReport, setViewingReport] = useState<FinancialReportSnapshot | null>(null)
  const [lastSyncedAt, setLastSyncedAt] = useState<Date>(new Date())

  const token = localStorage.getItem('token')
  const apiUrl = import.meta.env.VITE_API_BASE_URL

  const fetchExpenses = async () => {
    try {
      setExpensesLoading(true)
      const token = localStorage.getItem('token')
      const apiUrl = import.meta.env.VITE_API_BASE_URL
      const response = await fetch(`${apiUrl}/api/admin/expenses`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      if (!response.ok) throw new Error('Failed to fetch expenses')
      const data = await response.json()
      const rows: Expense[] = (data.data || []).map((row: any) => ({
        id: String(row.id),
        date: row.date,
        vendor: row.vendor,
        category: row.category,
        description: row.description,
        amount: parseFloat(row.amount),
        status: row.status,
        sourceType: row.source_type,
        approvedByName: row.approved_by_name,
        approvedAt: row.approved_at,
      }))
      setExpenses(rows)
    } catch (err) {
      console.error('Error fetching expenses:', err)
    } finally {
      setExpensesLoading(false)
    }
    fetchReceiptsSummary()
  }

  const fetchOverview = async () => {
    try {
      setOverviewLoading(true)
      const [ovRes, trendRes] = await Promise.all([
        fetch(`${apiUrl}/api/admin/financials/overview`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${apiUrl}/api/admin/financials/trend?months=6`, { headers: { Authorization: `Bearer ${token}` } }),
      ])
      const ovData = await ovRes.json()
      const trendData = await trendRes.json()
      setOverview(ovData.data || null)
      setTrend(trendData.data || [])
      setLastSyncedAt(new Date())
    } catch (err) {
      console.error('Error fetching financials overview:', err)
    } finally {
      setOverviewLoading(false)
    }
  }

  const fetchReports = async () => {
    try {
      setReportsLoading(true)
      const res = await fetch(`${apiUrl}/api/admin/financials/reports`, { headers: { Authorization: `Bearer ${token}` } })
      const data = await res.json()
      setReports(data.data || [])
    } catch (err) {
      console.error('Error fetching financial reports:', err)
    } finally {
      setReportsLoading(false)
    }
  }

  const generateReport = async () => {
    setGeneratingReport(true)
    try {
      await fetch(`${apiUrl}/api/admin/financials/reports/generate`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
      await fetchReports()
    } catch (err) {
      console.error('Error generating report:', err)
    } finally {
      setGeneratingReport(false)
    }
  }

  const approveExpense = async (id: string) => {
    await fetch(`${apiUrl}/api/admin/expenses/${id}/approve`, { method: 'PATCH', headers: { Authorization: `Bearer ${token}` } })
    fetchExpenses()
  }

  const rejectExpense = async (id: string) => {
    await fetch(`${apiUrl}/api/admin/expenses/${id}/reject`, { method: 'PATCH', headers: { Authorization: `Bearer ${token}` } })
    fetchExpenses()
  }

  const toggleExpenseSelected = (id: string) => {
    setSelectedExpenseIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const bulkApproveSelected = async () => {
    if (selectedExpenseIds.size === 0) return
    setBulkActing(true)
    try {
      await fetch(`${apiUrl}/api/admin/expenses/bulk-approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ids: Array.from(selectedExpenseIds).map((id) => parseInt(id, 10)) }),
      })
      setSelectedExpenseIds(new Set())
      await fetchExpenses()
    } finally {
      setBulkActing(false)
    }
  }

  // One row per receipt (Drive scan, manual entry, or screenshot entry) --
  // whatever produced expense line items also produces one of these, so this
  // refreshes alongside fetchExpenses everywhere that already calls it.
  const fetchReceiptsSummary = async () => {
    try {
      setReceiptsLoading(true)
      const token = localStorage.getItem('token')
      const apiUrl = import.meta.env.VITE_API_BASE_URL
      const response = await fetch(`${apiUrl}/api/admin/expenses/receipts`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      if (!response.ok) throw new Error('Failed to fetch receipts')
      const data = await response.json()
      const rows: ReceiptSummary[] = (data.data || []).map((row: any) => ({
        id: row.id,
        vendor: row.vendor,
        receiptDate: row.receipt_date,
        totalAmountCents: row.total_amount_cents,
        driveViewLink: row.drive_view_link,
        lowConfidence: row.low_confidence,
        itemCount: parseInt(row.item_count, 10) || 0,
        itemsTotal: parseFloat(row.items_total) || 0,
      }))
      setReceipts(rows)
    } catch (err) {
      console.error('Error fetching receipt summary:', err)
    } finally {
      setReceiptsLoading(false)
    }
  }

  useEffect(() => {
    fetchExpenses()
    fetchOverview()
    fetchReports()
  }, [])

  const toggleSection = (section: string) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section],
    }))
  }

  const categoryColors: Record<string, { bg: string; text: string; label: string }> = {
    food_cogs: { bg: '#8B6F47', text: 'white', label: 'Food COGS' },
    packaging: { bg: '#F4A460', text: 'white', label: 'Packaging' },
    delivery: { bg: '#4B7BA7', text: 'white', label: 'Delivery' },
    labor: { bg: '#D4AF37', text: 'white', label: 'Labor' },
    utilities: { bg: '#755B4C', text: 'white', label: 'Utilities' },
    other: { bg: '#9A7E6F', text: 'white', label: 'Other' },
  }

  // Standard inventory units
  const unitOptions = [
    { value: 'g', label: 'Grams (g)' },
    { value: 'kg', label: 'Kilograms (kg)' },
    { value: 'oz', label: 'Ounces (oz)' },
    { value: 'lb', label: 'Pounds (lb)' },
    { value: 'ml', label: 'Milliliters (ml)' },
    { value: 'L', label: 'Liters (L)' },
    { value: 'fl oz', label: 'Fluid Ounces (fl oz)' },
    { value: 'cup', label: 'Cups' },
    { value: 'tbsp', label: 'Tablespoons (tbsp)' },
    { value: 'tsp', label: 'Teaspoons (tsp)' },
    { value: 'count', label: 'Count (units)' },
  ]

  // Keywords for automatic categorization
  const categoryKeywords: Record<string, string[]> = {
    food_cogs: ['vegetable', 'fruit', 'meat', 'chicken', 'beef', 'fish', 'produce', 'organic', 'ingredient', 'spice', 'oil', 'butter', 'cream', 'cheese', 'milk', 'protein', 'fresh', 'organic', 'lettuce', 'tomato', 'onion', 'pepper', 'garlic'],
    packaging: ['container', 'box', 'bag', 'wrap', 'foil', 'plastic', 'cup', 'lid', 'label', 'tape', 'package', 'shipping', 'carton', 'tray'],
    delivery: ['delivery', 'fuel', 'gas', 'transportation', 'shipping', 'courier', 'logistics', 'freight'],
    labor: ['wage', 'salary', 'payroll', 'staff', 'employee', 'labor', 'hourly'],
    utilities: ['electricity', 'water', 'gas', 'internet', 'phone', 'utility', 'electric', 'bill'],
  }

  // Categorize based on keywords
  const categorizeItem = (description: string): string => {
    const lowerDesc = description.toLowerCase()
    for (const [category, keywords] of Object.entries(categoryKeywords)) {
      if (keywords.some(kw => lowerDesc.includes(kw))) {
        return category
      }
    }
    return 'other'
  }

  // Parse amounts from text using regex - improved to catch more patterns
  const extractAmounts = (text: string): number[] => {
    // Match: $123.45, 123.45, 123,45, $123, etc.
    const amountPattern = /\$?\s*(\d{1,}[.,]?\d{0,2})/g
    const matches = text.match(amountPattern) || []
    return matches
      .map(m => {
        const cleaned = m.replace(/[$\s]/g, '').replace(',', '.')
        return parseFloat(cleaned)
      })
      .filter(n => !isNaN(n) && n > 0)
      .sort((a, b) => b - a) // Sort descending to get total at front
  }

  // Parse vendor name from receipt text
  const extractVendor = (text: string): string => {
    const lines = text.split('\n').filter(l => l.trim().length > 0)
    // Usually vendor is in first few lines
    for (let i = 0; i < Math.min(3, lines.length); i++) {
      const line = lines[i].trim()
      if (line.length > 5 && line.length < 50) {
        return line
      }
    }
    return 'Receipt Vendor'
  }

  // Extract quantity and unit from receipt line (e.g., "500g", "2 lbs", "1.5L")
  const extractQuantityAndUnit = (line: string): { quantity?: number; unit?: string } => {
    // Look for patterns like: "500g", "2 lbs", "1.5L", "16 oz", "250ml", "1kg", "2.5 liters"
    const unitPatterns = [
      /(\d+(?:\.\d+)?)\s*(g|gram|grams|gr)/i,                    // grams
      /(\d+(?:\.\d+)?)\s*(kg|kilogram|kilograms)/i,              // kilograms
      /(\d+(?:\.\d+)?)\s*(oz|ounce|ounces)/i,                    // ounces
      /(\d+(?:\.\d+)?)\s*(lb|lbs|pound|pounds)/i,                // pounds
      /(\d+(?:\.\d+)?)\s*(ml|milliliter|milliliters)/i,          // milliliters
      /(\d+(?:\.\d+)?)\s*(l|liter|liters|litre|litres)/i,        // liters
      /(\d+(?:\.\d+)?)\s*(fl\.?\s*oz|fluid ounce|fl oz)/i,       // fluid ounces
      /(\d+(?:\.\d+)?)\s*(cup|cups|c\.)/i,                       // cups
      /(\d+(?:\.\d+)?)\s*(tsp|teaspoon|tbsp|tablespoon)/i,       // spoons
    ]

    for (const pattern of unitPatterns) {
      const match = line.match(pattern)
      if (match && match[1] && match[2]) {
        const quantity = parseFloat(match[1])
        let unit = match[2].toLowerCase().replace(/s$/, '') // Remove plural 's'

        // Normalize units
        const unitMap: Record<string, string> = {
          'g': 'g',
          'gram': 'g',
          'gr': 'g',
          'kg': 'kg',
          'kilogram': 'kg',
          'oz': 'oz',
          'ounce': 'oz',
          'lb': 'lb',
          'lbs': 'lb',
          'pound': 'lb',
          'ml': 'ml',
          'milliliter': 'ml',
          'l': 'L',
          'liter': 'L',
          'litre': 'L',
          'fl. oz': 'fl oz',
          'fl oz': 'fl oz',
          'fluid ounce': 'fl oz',
          'cup': 'cup',
          'c.': 'cup',
          'c': 'cup',
          'tsp': 'tsp',
          'teaspoon': 'tsp',
          'tbsp': 'tbsp',
          'tablespoon': 'tbsp',
        }

        unit = unitMap[unit] || unit

        if (quantity > 0 && quantity < 100000) {
          return { quantity, unit }
        }
      }
    }
    return {}
  }

  // Complete receipt parser - extracts items, prices, and quantities
  const parseReceiptData = (text: string) => {
    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0)

    // Extract vendor (usually first line)
    const vendor = lines[0] || 'Unknown Vendor'

    // Keywords that indicate a line is NOT a product item
    const excludeKeywords = ['TOTAL', 'SUBTOTAL', 'TAX', 'AMOUNT DUE', 'CHANGE', 'BALANCE', 'PAYMENT', 'TENDER', 'CASH', 'CARD', 'DEBIT', 'CREDIT', 'REGISTER', 'CASHIER', 'TERMINAL', 'TRANSACTION', 'RECEIPT', 'DATE', 'TIME', 'STORE', 'PHONE', 'RETURN', 'REFUND', 'DISCOUNT', 'COUPON', 'VOID', 'CANCELED', 'VISA', 'MASTERCARD', 'AMEX', 'AMERICAN EXPRESS']

    // Extract all amounts and their line numbers
    const lineItems: { line: string; amount: number; quantity?: number; unit?: string }[] = []

    lines.forEach((line) => {
      const upperLine = line.toUpperCase()

      // Skip lines with excluded keywords
      if (excludeKeywords.some(kw => upperLine.includes(kw))) {
        return
      }

      // Look for lines that have both text and a price
      const amountMatch = line.match(/(\d+[.,]\d{2})/)
      if (amountMatch && line.length > 3) {
        const amount = parseFloat(amountMatch[1].replace(',', '.'))

        // Extract description (everything before the price)
        const description = line.replace(/\$?\s*\d+[.,]\d{2}\s*$/, '').trim()

        // Extract quantity and unit if available
        const { quantity, unit } = extractQuantityAndUnit(line)

        if (description.length > 2 && amount > 0 && amount < 10000) {
          lineItems.push({
            line: description,
            amount,
            quantity,
            unit
          })
        }
      }
    })

    // Find the total (look for TOTAL keyword)
    let total = 0
    lineItems.forEach((item) => {
      if (item.line.toUpperCase().includes('TOTAL')) {
        total = item.amount
      }
    })

    // If no total found, use the largest amount
    if (total === 0 && lineItems.length > 0) {
      total = Math.max(...lineItems.map(i => i.amount))
    }

    // Convert to receipt items, excluding any line marked as TOTAL
    const items: ReceiptItem[] = lineItems
      .filter((item) => !item.line.toUpperCase().includes('TOTAL'))
      .map(item => ({
        description: item.line,
        amount: item.amount,
        quantity: item.quantity,
        unit: item.unit,
        category: categorizeItem(item.line),
        confidence: 0.85
      }))

    return {
      vendor,
      items,
      total: items.reduce((sum, item) => sum + item.amount, 0)
    }
  }

  // Process receipt using GoHighLevel API
  const processReceiptImage = async (file: File) => {
    setIsProcessing(true)
    setProcessingStatus('Sending to GoHighLevel...')

    try {
      const reader = new FileReader()
      reader.onload = async (e) => {
        try {
          const imageDataUrl = e.target?.result as string
          const base64Image = imageDataUrl.split(',')[1]

          // Call GoHighLevel receipt parser endpoint
          const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/admin/task-management-test/parse-receipt`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              imageBase64: base64Image,
              fileName: file.name
            })
          })

          if (!response.ok) {
            throw new Error('GoHighLevel parsing failed')
          }

          const result = await response.json()
          const receiptData = result.data

          setProcessingStatus('')

          setScannedReceipt({
            image: imageDataUrl,
            text: receiptData.vendor || 'Receipt',
            items: receiptData.items || [],
            vendor: receiptData.vendor || 'Unknown Vendor',
            total: receiptData.total || 0,
          })
        } catch (error) {
          console.error('GoHighLevel Error:', error)
          setProcessingStatus('')
          alert(`Parsing Error: ${error instanceof Error ? error.message : 'Failed to parse receipt'}`)
        }
      }

      reader.readAsDataURL(file)
    } catch (error) {
      console.error('Error processing receipt:', error)
      setProcessingStatus('')
      alert('Error processing receipt image')
    } finally {
      setIsProcessing(false)
    }
  }

  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file && file.type.startsWith('image/')) {
      processReceiptImage(file)
    }
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.currentTarget.files?.[0]
    if (file) {
      processReceiptImage(file)
    }
  }

  const createExpensesFromReceipt = async () => {
    if (!scannedReceipt) return

    try {
      const token = localStorage.getItem('token')
      const apiUrl = import.meta.env.VITE_API_BASE_URL

      // Call backend to save products and expenses
      const response = await fetch(`${apiUrl}/api/admin/expenses/save-receipt-items`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          items: scannedReceipt.items,
          vendor: scannedReceipt.vendor
        })
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to save receipt items')
      }

      const result = await response.json()
      console.log('Saved products:', result.data.productsAdded)
      console.log('Created expenses:', result.data.expensesCreated)

      await fetchExpenses()
      setScannedReceipt(null)
      setExpandedSections(prev => ({ ...prev, receiptScanner: false }))

      // Show success message
      alert(`✓ Added ${result.data.productsAdded} products to database and created ${result.data.expensesCreated} expenses`)
    } catch (error) {
      console.error('Error saving receipt:', error)
      alert(`Error: ${error instanceof Error ? error.message : 'Failed to save receipt'}`)
    }
  }

  // Load receipt images from Google Drive and parse them
  const loadFromGoogleDrive = async () => {
    try {
      setIsProcessing(true)
      setProcessingStatus('Loading receipts from Google Drive...')

      const token = localStorage.getItem('token')
      const apiUrl = import.meta.env.VITE_API_BASE_URL

      const response = await fetch(`${apiUrl}/api/admin/receipt-read/pending`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })

      if (!response.ok) {
        throw new Error('Failed to load receipts from Google Drive')
      }

      const result = await response.json()
      const receipts = result.data.receipts

      if (receipts.length === 0) {
        alert('No receipts found in Google Drive folder')
        setIsProcessing(false)
        return
      }

      console.log(`Found ${receipts.length} receipts, parsing...`)
      setProcessingStatus(`Analyzing ${receipts.length} receipts...`)

      // Parse each receipt with simple regex (no API calls needed)
      const allItems: ReceiptItem[] = []

      for (const receipt of receipts) {
        setProcessingStatus(`Processing ${receipt.filename}...`)
        setManualVendor(receipt.vendor)

        // Simple extraction from filename for now
        // User will manually enter the items
        const item: ReceiptItem = {
          description: receipt.filename,
          amount: 0,
          category: 'food_cogs',
          confidence: 0.5,
          productName: '',
          unit: 'count',
          quantity: undefined
        }
        allItems.push(item)
      }

      // Show first receipt's vendor
      if (receipts.length > 0) {
        setManualVendor(receipts[0].vendor)
        setManualDate(new Date().toISOString().split('T')[0])
      }

      setProcessingStatus('')
      setIsProcessing(false)
      alert(`✓ Loaded ${receipts.length} receipts from Google Drive.\n\nReceipt images are displayed in your folder.\nPlease manually enter the items below from each receipt.`)
    } catch (error) {
      console.error('Error loading from Drive:', error)
      setProcessingStatus('')
      setIsProcessing(false)
      alert(`Error: ${error instanceof Error ? error.message : 'Failed to load'}`)
    }
  }

  // Save manually entered receipt items
  const saveManualReceipt = async () => {
    try {
      if (!manualVendor || manualItems.length === 0) {
        alert('Please enter vendor name and at least one item')
        return
      }

      const token = localStorage.getItem('token')
      const apiUrl = import.meta.env.VITE_API_BASE_URL

      const validItems = manualItems.filter(item => item.productName && item.amount > 0)

      if (validItems.length === 0) {
        alert('Please enter at least one item with name and price')
        return
      }

      const response = await fetch(`${apiUrl}/api/admin/receipt-sync/confirm`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          receipts: [{
            vendor: manualVendor,
            date: manualDate,
            items: validItems.map(item => ({ ...item, displayName: item.productName })),
          }]
        })
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to save receipt')
      }

      const result = await response.json()
      alert(`✓ Saved ${result.data.productsAdded} products and created ${result.data.expensesCreated} expenses`)

      // Reset form
      setManualVendor('')
      setManualItems([{ description: '', amount: 0, category: 'food_cogs', confidence: 1, productName: '', unit: 'count', quantity: undefined }])
      setManualDate(new Date().toISOString().split('T')[0])

      // Refresh expenses
      setExpandedSections(prev => ({ ...prev, expenses: true }))
    } catch (error) {
      console.error('Error saving receipt:', error)
      alert(`Error: ${error instanceof Error ? error.message : 'Failed to save'}`)
    }
  }

  // Parse receipts from Google Drive -- does not save anything yet. Results
  // land in pendingReceipts for review (each item's display name can be
  // edited) before confirmSyncedReceipts actually writes to the database.
  const syncGoogleDrive = async () => {
    try {
      setSyncInProgress(true)
      const token = localStorage.getItem('token')
      const apiUrl = import.meta.env.VITE_API_BASE_URL

      const response = await fetch(`${apiUrl}/api/admin/receipt-sync/process`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Parse failed')
      }

      const data = await response.json()
      setPendingReceipts(data.data.parsed || [])
      setParseFailures(data.data.failed || [])
      setSyncResult(null)

      if ((data.data.parsed || []).length === 0 && (data.data.failed || []).length === 0) {
        alert('No new receipts found in the Drive folder.')
      }
    } catch (error) {
      console.error('Parse error:', error)
      alert(`Parse error: ${error instanceof Error ? error.message : 'Failed to parse receipts'}`)
    } finally {
      setSyncInProgress(false)
    }
  }

  const updatePendingItemDisplayName = (receiptIdx: number, itemIdx: number, displayName: string) => {
    setPendingReceipts(prev => prev.map((r, ri) =>
      ri !== receiptIdx ? r : { ...r, items: r.items.map((it, ii) => ii !== itemIdx ? it : { ...it, displayName }) }
    ))
  }

  const updatePendingItemField = <K extends keyof PendingReceiptItem>(
    receiptIdx: number, itemIdx: number, field: K, value: PendingReceiptItem[K]
  ) => {
    setPendingReceipts(prev => prev.map((r, ri) =>
      ri !== receiptIdx ? r : { ...r, items: r.items.map((it, ii) => ii !== itemIdx ? it : { ...it, [field]: value }) }
    ))
  }

  const discardPendingReceipt = (receiptIdx: number) => {
    setPendingReceipts(prev => prev.filter((_, i) => i !== receiptIdx))
  }

  // Saves the (possibly edited) reviewed receipts to inventory/expenses and
  // archives their source files in Drive.
  const confirmSyncedReceipts = async () => {
    if (pendingReceipts.length === 0) return
    try {
      setConfirmingReceipts(true)
      const token = localStorage.getItem('token')
      const apiUrl = import.meta.env.VITE_API_BASE_URL

      const response = await fetch(`${apiUrl}/api/admin/receipt-sync/confirm`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ receipts: pendingReceipts })
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Save failed')
      }

      const data = await response.json()
      setSyncResult(data.data)
      setPendingReceipts([])
      await fetchExpenses()

      if (data.data.failed > 0) {
        alert(`Saved ${data.data.processed}, ${data.data.failed} failed. See "Why these failed" below for details.`)
      } else {
        alert(`✓ Saved ${data.data.processed} receipt(s) to inventory`)
      }
    } catch (error) {
      console.error('Confirm error:', error)
      alert(`Save error: ${error instanceof Error ? error.message : 'Failed to save receipts'}`)
    } finally {
      setConfirmingReceipts(false)
    }
  }

  // Handle screenshot upload for online orders - manual entry mode
  const handleScreenshotUpload = async (file: File) => {
    if (!file) return

    setIsProcessing(true)
    setProcessingStatus('Loading image...')

    try {
      const reader = new FileReader()
      reader.onload = async (e) => {
        try {
          const imageDataUrl = e.target?.result as string

          // Just show the image for manual entry
          setScreenshotItems([
            {
              description: 'Screenshot uploaded - enter items manually below',
              amount: 0,
              category: 'food_cogs',
              confidence: 0.5,
              productName: '',
              unit: 'g',
              quantity: undefined
            }
          ])
          setShowScreenshotForm(true)
          setProcessingStatus('')
        } catch (error) {
          console.error('Upload Error:', error)
          setProcessingStatus('')
          alert(`Error: ${error instanceof Error ? error.message : 'Failed to load image'}`)
        }
      }
      reader.readAsDataURL(file)
    } catch (error) {
      console.error('Error processing screenshot:', error)
      setProcessingStatus('')
      alert('Error processing screenshot')
    } finally {
      setIsProcessing(false)
    }
  }

  // Add manual item from screenshot
  const addScreenshotItem = () => {
    if (!screenshotItems[0]?.productName || !screenshotItems[0]?.amount) {
      alert('Please enter product name and price')
      return
    }

    setScreenshotItems([
      ...screenshotItems,
      {
        description: '',
        amount: 0,
        category: 'food_cogs',
        confidence: 0,
        productName: '',
        unit: 'g',
        quantity: undefined
      }
    ])
  }

  // Save screenshot items as expenses
  const saveScreenshotItems = async () => {
    if (!screenshotVendor || screenshotItems.length === 0 || !screenshotItems[0].productName) {
      alert('Please enter vendor name and at least one item')
      return
    }

    try {
      const token = localStorage.getItem('token')
      const apiUrl = import.meta.env.VITE_API_BASE_URL

      // Filter out empty items
      const validItems = screenshotItems.filter(item => item.productName && item.amount > 0)

      if (validItems.length === 0) {
        alert('No valid items to save')
        return
      }

      // Call backend to save products and expenses
      const response = await fetch(`${apiUrl}/api/admin/expenses/save-receipt-items`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          items: validItems,
          vendor: screenshotVendor
        })
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to save items')
      }

      const result = await response.json()

      await fetchExpenses()
      setShowScreenshotForm(false)
      setScreenshotItems([])
      setScreenshotVendor('')
      setExpandedSections(prev => ({ ...prev, receiptScanner: false }))

      alert(`✓ Added ${validItems.length} items from screenshot`)
    } catch (error) {
      console.error('Error saving screenshot items:', error)
      alert(`Error: ${error instanceof Error ? error.message : 'Failed to save items'}`)
    }
  }

  const addExpense = async () => {
    if (!formData.vendor || !formData.amount) return

    try {
      const token = localStorage.getItem('token')
      const apiUrl = import.meta.env.VITE_API_BASE_URL
      const response = await fetch(`${apiUrl}/api/admin/expenses`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({
          date: formData.date || new Date().toISOString().split('T')[0],
          vendor: formData.vendor,
          category: formData.category || 'food_cogs',
          description: formData.description || '',
          amount: formData.amount,
          status: formData.status || 'pending',
        })
      })
      if (!response.ok) {
        const err = await response.json()
        throw new Error(err.error || 'Failed to add expense')
      }
      await fetchExpenses()
      setFormData({
        date: new Date().toISOString().split('T')[0],
        vendor: '',
        category: 'food_cogs',
        description: '',
        amount: 0,
        status: 'pending',
      })
      setExpandedSections(prev => ({ ...prev, expenseForm: false }))
    } catch (err) {
      console.error('Error adding expense:', err)
      alert(`Error: ${err instanceof Error ? err.message : 'Failed to add expense'}`)
    }
  }

  const expensesByCategory = expenses.reduce((acc, exp) => {
    if (!acc[exp.category]) acc[exp.category] = 0
    acc[exp.category] += exp.amount
    return acc
  }, {} as Record<string, number>)

  const totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0)
  const pendingExpenses = expenses.filter(e => e.status === 'pending').reduce((sum, e) => sum + e.amount, 0)

  const compare = overview?.compare[compareMode]
  const compareLabel = compare?.label || ''

  const trendMax = Math.max(1, ...trend.map((t) => Math.max(t.revenue, t.expenses)))
  const chartW = 640
  const chartH = 190
  const chartPad = 40
  const trendPoints = trend.map((t, i) => {
    const x = trend.length > 1 ? chartPad + (i / (trend.length - 1)) * (chartW - chartPad) : chartW / 2
    const yRev = chartH - (t.revenue / trendMax) * (chartH - 10)
    const yExp = chartH - (t.expenses / trendMax) * (chartH - 10)
    return { x, yRev, yExp, month: t.month, revenue: t.revenue, expenses: t.expenses }
  })
  const revPath = trendPoints.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.yRev.toFixed(1)}`).join(' ')
  const expPath = trendPoints.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.yExp.toFixed(1)}`).join(' ')
  const monthShort = (m: string) => new Date(m + '-02').toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' })

  return (
    <main className="space-y-6 bg-[#FDFBF7] p-8">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-extrabold text-[#4B2B1D]">Financials</h1>
          <p className="mt-1 text-[#755B4C]">
            {overview ? new Date(overview.month + '-02').toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }) : '—'} overview
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-[#9A7E6F]">
          <RefreshCw className="h-3.5 w-3.5" />
          <span>Synced with orders &amp; the expense ledger · {lastSyncedAt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</span>
          <span className="opacity-50">·</span>
          <button onClick={() => { fetchOverview(); fetchExpenses() }} className="font-bold text-[#2E527F] hover:underline">Refresh now</button>
        </div>
      </div>

      <div className="flex gap-1 border-b border-[#E8DCC8]">
        {([
          ['overview', 'Overview'],
          ['expenses', 'Expenses'],
          ['reports', 'Reports'],
        ] as [Tab, string][]).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={`px-4 py-2.5 text-sm font-bold transition border-b-2 -mb-px ${
              activeTab === id ? 'border-[#2E527F] text-[#2E527F]' : 'border-transparent text-[#9A7E6F] hover:text-[#4B2B1D]'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {activeTab === 'overview' && (
        <div className="space-y-6">
          {overviewLoading || !overview ? (
            <p className="text-sm text-[#755B4C]">Loading...</p>
          ) : (
            <>
              <div className="flex justify-end">
                <select
                  value={compareMode}
                  onChange={(e) => setCompareMode(e.target.value as 'mom' | 'yoy')}
                  className="rounded-xl border border-[#E8DCC8] bg-white px-3 py-2 text-sm font-semibold text-[#4B2B1D]"
                >
                  <option value="mom">Compare: Previous month</option>
                  <option value="yoy">Compare: Same month last year</option>
                </select>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-2xl border border-[#E8DCC8] bg-white p-6">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm text-[#755B4C]">Gross Revenue</p>
                      <p className="mt-2 text-2xl font-extrabold text-[#4B2B1D]">${overview.grossRevenue.toLocaleString('en-US', { maximumFractionDigits: 2 })}</p>
                      <p className={`mt-1 text-xs font-bold flex items-center gap-1 ${compare && compare.grossRevenuePct >= 0 ? 'text-[#16813D]' : 'text-[#D62F3D]'}`}>
                        {compare && compare.grossRevenuePct >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                        {compare ? `${compare.grossRevenuePct >= 0 ? '+' : ''}${compare.grossRevenuePct}%` : ''}
                        <span className="font-normal text-[#9A7E6F]">{compareLabel}</span>
                      </p>
                    </div>
                    <div className="rounded-lg bg-[#EAF0F7] p-3"><DollarSign className="h-5 w-5 text-[#2E527F]" /></div>
                  </div>
                </div>

                <div className="rounded-2xl border border-[#E8DCC8] bg-white p-6">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm text-[#755B4C]">Total Expenses</p>
                      <p className="mt-2 text-2xl font-extrabold text-[#4B2B1D]">${overview.totalExpenses.toLocaleString('en-US', { maximumFractionDigits: 2 })}</p>
                      <p className={`mt-1 text-xs font-bold flex items-center gap-1 ${compare && compare.totalExpensesPct <= 0 ? 'text-[#16813D]' : 'text-[#D62F3D]'}`}>
                        {compare && compare.totalExpensesPct <= 0 ? <TrendingDown className="h-3 w-3" /> : <TrendingUp className="h-3 w-3" />}
                        {compare ? `${compare.totalExpensesPct >= 0 ? '+' : ''}${compare.totalExpensesPct}%` : ''}
                        <span className="font-normal text-[#9A7E6F]">{compareLabel}</span>
                      </p>
                    </div>
                    <div className="rounded-lg bg-[#FBEEE3] p-3"><Package className="h-5 w-5 text-[#C9692E]" /></div>
                  </div>
                </div>

                <div className="rounded-2xl border border-[#E8DCC8] bg-white p-6">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm text-[#755B4C]">Net Operating Profit</p>
                      <p className="mt-2 text-2xl font-extrabold text-[#4B2B1D]">${overview.netOperatingProfit.toLocaleString('en-US', { maximumFractionDigits: 2 })}</p>
                      <p className="mt-1 text-xs font-bold text-[#16813D]">{overview.marginPct}% margin</p>
                    </div>
                    <div className="rounded-lg bg-[#EAF4EC] p-3"><Activity className="h-5 w-5 text-[#2F7A4D]" /></div>
                  </div>
                </div>

                <div className="rounded-2xl border border-[#E8DCC8] bg-white p-6 cursor-pointer hover:shadow-md transition" onClick={() => setActiveTab('expenses')}>
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm text-[#755B4C]">Outstanding Balance</p>
                      <p className="mt-2 text-2xl font-extrabold text-[#4B2B1D]">${overview.outstandingBalance.toLocaleString('en-US', { maximumFractionDigits: 2 })}</p>
                      <p className="mt-1 text-xs text-[#9A7E6F]">{overview.outstandingCount} order{overview.outstandingCount === 1 ? '' : 's'} not yet marked paid</p>
                    </div>
                    <div className="rounded-lg bg-[#FBEBE8] p-3"><AlertTriangle className="h-5 w-5 text-[#B4432F]" /></div>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-[#E8DCC8] bg-white p-6">
                <div className="mb-4">
                  <h3 className="text-base font-extrabold text-[#4B2B1D]">Revenue vs. Expenses — last 6 months</h3>
                  <p className="text-xs text-[#9A7E6F]">Computed from real orders and the expense ledger</p>
                </div>
                {trend.length === 0 ? (
                  <p className="text-sm text-[#755B4C]">No data yet.</p>
                ) : (
                  <>
                    <svg viewBox={`0 0 ${chartW + 50} ${chartH + 30}`} width="100%" style={{ overflow: 'visible' }}>
                      {[0, 0.33, 0.66, 1].map((f, i) => (
                        <line key={i} x1={chartPad} y1={10 + f * (chartH - 20)} x2={chartW} y2={10 + f * (chartH - 20)} stroke="#EFE7D8" strokeWidth={1} />
                      ))}
                      <path d={revPath} fill="none" stroke="#2E527F" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
                      <path d={expPath} fill="none" stroke="#C9692E" strokeWidth={2} strokeDasharray="5,4" strokeLinecap="round" strokeLinejoin="round" />
                      {trendPoints.map((p, i) => (
                        <g key={i}>
                          <circle cx={p.x} cy={p.yRev} r={i === trendPoints.length - 1 ? 5 : 3} fill="#2E527F" stroke="#fff" strokeWidth={1.5} />
                          <circle cx={p.x} cy={p.yExp} r={i === trendPoints.length - 1 ? 5 : 3} fill="#C9692E" stroke="#fff" strokeWidth={1.5} />
                          <text x={p.x} y={chartH + 18} textAnchor="middle" fontSize={10} fill="#755B4C" fontWeight={600}>{monthShort(p.month)}</text>
                        </g>
                      ))}
                    </svg>
                    <div className="flex gap-6 mt-3 pt-3 border-t border-[#E8DCC8] text-xs text-[#755B4C]">
                      <span className="flex items-center gap-1.5"><span className="inline-block w-3.5 h-0.5 bg-[#2E527F]" />Revenue <b className="text-[#4B2B1D]">${trend[trend.length - 1]?.revenue.toLocaleString('en-US', { maximumFractionDigits: 0 })}</b></span>
                      <span className="flex items-center gap-1.5"><span className="inline-block w-3.5 h-0.5 bg-[#C9692E]" style={{ borderTop: '2px dashed #C9692E' }} />Expenses <b className="text-[#4B2B1D]">${trend[trend.length - 1]?.expenses.toLocaleString('en-US', { maximumFractionDigits: 0 })}</b></span>
                    </div>
                  </>
                )}
              </div>

              {overview.outstandingCount > 0 && (
                <div className="rounded-2xl border border-[#E8DCC8] bg-white p-6">
                  <div className="flex items-center justify-between mb-1">
                    <h3 className="text-base font-extrabold text-[#4B2B1D]">Pending Balances</h3>
                    <button onClick={() => setActiveTab('expenses')} className="text-xs font-bold text-[#2E527F] hover:underline">View in Expenses →</button>
                  </div>
                  <p className="text-xs text-[#9A7E6F]">{overview.outstandingCount} order{overview.outstandingCount === 1 ? '' : 's'} not yet marked paid — mark them paid as bank transfers, cash, Stripe, or however they actually came in from the order's row in the Expenses tab ledger.</p>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {activeTab === 'expenses' && (
      <div className="space-y-4">
        {/* Receipt Scanner */}
        <Section id="receiptScanner" title="📸 Log Receipts (Physical, Online & Google Drive)" expandedSections={expandedSections} toggleSection={toggleSection}>
          {/* Tab Buttons */}
          <div className="flex gap-2 mb-4 border-b border-[#E8DCC8] flex-wrap">
            <button
              onClick={() => setReceiptTab('manual')}
              className={`px-4 py-2 font-semibold transition ${
                receiptTab === 'manual'
                  ? 'text-[#8B6F47] border-b-2 border-[#8B6F47]'
                  : 'text-[#9A7E6F] hover:text-[#755B4C]'
              }`}
            >
              ✏️ Manual Entry
            </button>
            <button
              onClick={() => setReceiptTab('gdrive')}
              className={`px-4 py-2 font-semibold transition ${
                receiptTab === 'gdrive'
                  ? 'text-[#8B6F47] border-b-2 border-[#8B6F47]'
                  : 'text-[#9A7E6F] hover:text-[#755B4C]'
              }`}
            >
              ☁️ Google Drive (Auto)
            </button>
            <button
              onClick={() => setReceiptTab('scanner')}
              className={`px-4 py-2 font-semibold transition ${
                receiptTab === 'scanner'
                  ? 'text-[#8B6F47] border-b-2 border-[#8B6F47]'
                  : 'text-[#9A7E6F] hover:text-[#755B4C]'
              }`}
            >
              📷 Physical Receipt
            </button>
            <button
              onClick={() => setReceiptTab('screenshot')}
              className={`px-4 py-2 font-semibold transition ${
                receiptTab === 'screenshot'
                  ? 'text-[#8B6F47] border-b-2 border-[#8B6F47]'
                  : 'text-[#9A7E6F] hover:text-[#755B4C]'
              }`}
            >
              📧 Online Order
            </button>
          </div>

          {/* Manual Entry Tab */}
          {receiptTab === 'manual' && (
            <div className="space-y-4">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h3 className="font-bold text-blue-900 mb-2">✏️ Manual Receipt Entry</h3>
                <p className="text-sm text-blue-800">
                  Quickly add receipt items by filling in the table below. No OCR needed.
                </p>
              </div>

              <div className="grid grid-cols-4 gap-3">
                <div>
                  <label className="block text-xs font-bold text-[#755B4C] mb-2">VENDOR *</label>
                  <input
                    type="text"
                    value={manualVendor}
                    onChange={(e) => setManualVendor(e.target.value)}
                    placeholder="Costco, Amazon, etc..."
                    className="w-full px-3 py-2 border-2 border-[#D4A574] rounded-lg text-sm text-[#4B2B1D] bg-[#FDFBF7]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-[#755B4C] mb-2">DATE *</label>
                  <input
                    type="date"
                    value={manualDate}
                    onChange={(e) => setManualDate(e.target.value)}
                    className="w-full px-3 py-2 border-2 border-[#D4A574] rounded-lg text-sm text-[#4B2B1D] bg-[#FDFBF7]"
                  />
                </div>
                <div className="flex items-end">
                  <button
                    onClick={() => {
                      setManualItems([...manualItems, { description: '', amount: 0, category: 'food_cogs', confidence: 1, productName: '', unit: 'count', quantity: undefined }])
                    }}
                    className="w-full bg-[#8B6F47] text-white py-2 rounded-lg font-semibold hover:bg-[#6B5437] transition text-sm"
                  >
                    + Add Row
                  </button>
                </div>
                <div className="flex items-end">
                  <button
                    onClick={loadFromGoogleDrive}
                    className="w-full bg-blue-600 text-white py-2 rounded-lg font-semibold hover:bg-blue-700 transition text-sm"
                  >
                    ☁️ Load from Drive
                  </button>
                </div>
              </div>

              {/* Items Table */}
              <div className="overflow-x-auto border border-[#E8DCC8] rounded-lg">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-[#8B6F47] text-white">
                      <th className="border-r border-[#D4A574] px-3 py-2 text-left">Product Name</th>
                      <th className="border-r border-[#D4A574] px-3 py-2 text-right w-24">Price ($)</th>
                      <th className="border-r border-[#D4A574] px-3 py-2 text-center w-20">Qty</th>
                      <th className="border-r border-[#D4A574] px-3 py-2 w-20">Unit</th>
                      <th className="border-r border-[#D4A574] px-3 py-2 w-32">Category</th>
                      <th className="px-3 py-2 text-center w-12">×</th>
                    </tr>
                  </thead>
                  <tbody>
                    {manualItems.map((item, idx) => (
                      <tr key={idx} className="border-t border-[#E8DCC8] hover:bg-[#FBF7F0]">
                        <td className="border-r border-[#E8DCC8] px-3 py-2">
                          <input
                            type="text"
                            value={item.productName || ''}
                            onChange={(e) => {
                              const updated = [...manualItems]
                              updated[idx].productName = e.target.value
                              setManualItems(updated)
                            }}
                            placeholder="Blueberries"
                            className="w-full px-2 py-1 border border-[#D4A574] rounded text-sm focus:outline-none focus:ring-2 focus:ring-[#8B6F47]"
                          />
                        </td>
                        <td className="border-r border-[#E8DCC8] px-3 py-2">
                          <input
                            type="number"
                            step="0.01"
                            value={item.amount || ''}
                            onChange={(e) => {
                              const updated = [...manualItems]
                              updated[idx].amount = parseFloat(e.target.value) || 0
                              setManualItems(updated)
                            }}
                            placeholder="0.00"
                            className="w-full px-2 py-1 border border-[#D4A574] rounded text-sm text-right focus:outline-none focus:ring-2 focus:ring-[#8B6F47]"
                          />
                        </td>
                        <td className="border-r border-[#E8DCC8] px-3 py-2">
                          <input
                            type="number"
                            min="0.01"
                            step="0.01"
                            value={item.quantity || ''}
                            onChange={(e) => {
                              const updated = [...manualItems]
                              updated[idx].quantity = e.target.value ? parseFloat(e.target.value) : undefined
                              setManualItems(updated)
                            }}
                            placeholder="-"
                            className="w-full px-2 py-1 border border-[#D4A574] rounded text-sm text-center focus:outline-none focus:ring-2 focus:ring-[#8B6F47]"
                          />
                        </td>
                        <td className="border-r border-[#E8DCC8] px-3 py-2">
                          <select
                            value={item.unit || 'count'}
                            onChange={(e) => {
                              const updated = [...manualItems]
                              updated[idx].unit = e.target.value
                              setManualItems(updated)
                            }}
                            className="w-full px-1 py-1 border border-[#D4A574] rounded text-xs focus:outline-none focus:ring-2 focus:ring-[#8B6F47]"
                          >
                            {unitOptions.map(opt => (
                              <option key={opt.value} value={opt.value}>{opt.value}</option>
                            ))}
                          </select>
                        </td>
                        <td className="border-r border-[#E8DCC8] px-3 py-2">
                          <select
                            value={item.category}
                            onChange={(e) => {
                              const updated = [...manualItems]
                              updated[idx].category = e.target.value
                              setManualItems(updated)
                            }}
                            className="w-full px-1 py-1 border border-[#D4A574] rounded text-xs focus:outline-none focus:ring-2 focus:ring-[#8B6F47]"
                          >
                            {Object.entries(categoryColors).map(([key, val]) => (
                              <option key={key} value={key}>{val.label}</option>
                            ))}
                          </select>
                        </td>
                        <td className="px-3 py-2 text-center">
                          {manualItems.length > 1 && (
                            <button
                              onClick={() => {
                                const updated = manualItems.filter((_, i) => i !== idx)
                                setManualItems(updated)
                              }}
                              className="text-red-600 hover:text-red-700 font-bold text-lg"
                            >
                              ✕
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Save Button */}
              <button
                onClick={saveManualReceipt}
                className="w-full bg-green-600 text-white py-3 rounded-lg font-semibold hover:bg-green-700 transition text-lg"
              >
                ✓ Save Receipt to Database
              </button>
            </div>
          )}

          {/* Google Drive Sync Tab */}
          {receiptTab === 'gdrive' && (
            <div className="space-y-4">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h3 className="font-bold text-blue-900 mb-2">☁️ Google Drive Receipt Sync</h3>
                <p className="text-sm text-blue-800 mb-3">
                  Drop receipts and online order screenshots in your Google Drive folder. AI automatically:
                </p>
                <ul className="text-sm text-blue-800 space-y-1 ml-4 list-disc">
                  <li>Extracts vendor name</li>
                  <li>Reads each item, price, and quantity/weight</li>
                  <li>Auto-categorizes (Food, Packaging, etc.)</li>
                  <li>Suggests a clean inventory display name (e.g. "Member's Mark Grass Fed Beef Top Sirloin Steak" → "Top Sirloin Steak") for you to confirm before it saves</li>
                </ul>
              </div>

              {pendingReceipts.length === 0 && (
                <div className="rounded-lg bg-[#FDFBF7] p-4 border border-[#E8DCC8]">
                  <p className="text-sm text-[#755B4C] mb-3">
                    <strong>Status:</strong> {syncInProgress ? 'Parsing...' : 'Ready.'}
                  </p>
                  {syncResult && (
                    <>
                      <p className="text-sm text-[#4B2B1D] mb-3">
                        <strong>Last save:</strong> {syncResult.processed} saved, {syncResult.failed} failed
                      </p>
                      {syncResult.errors && syncResult.errors.length > 0 && (
                        <div className="mt-2 rounded-lg bg-[#FFF4F5] border border-[#E8B4B9] p-3">
                          <p className="text-xs font-bold text-[#D62F3D] mb-2">Why these failed:</p>
                          <ul className="space-y-1">
                            {syncResult.errors.map((e, idx) => (
                              <li key={idx} className="text-xs text-[#755B4C]">
                                <span className="font-semibold text-[#4B2B1D]">{e.filename}:</span> {e.error}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </>
                  )}
                  {parseFailures.length > 0 && (
                    <div className="mt-2 rounded-lg bg-[#FFF4F5] border border-[#E8B4B9] p-3">
                      <p className="text-xs font-bold text-[#D62F3D] mb-2">Failed to parse:</p>
                      <ul className="space-y-1">
                        {parseFailures.map((e, idx) => (
                          <li key={idx} className="text-xs text-[#755B4C]">
                            <span className="font-semibold text-[#4B2B1D]">{e.filename}:</span> {e.error}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              {pendingReceipts.length === 0 && (
                <button
                  onClick={syncGoogleDrive}
                  disabled={syncInProgress}
                  className="w-full bg-blue-600 text-white py-3 rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
                >
                  {syncInProgress ? (
                    <>
                      <Loader className="inline-block h-4 w-4 mr-2 animate-spin" />
                      Parsing...
                    </>
                  ) : (
                    '🔄 Sync Google Drive Now'
                  )}
                </button>
              )}

              {pendingReceipts.length > 0 && (
                <div className="space-y-4">
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                    <p className="text-sm font-semibold text-amber-900">
                      Review {pendingReceipts.length} parsed receipt{pendingReceipts.length > 1 ? 's' : ''} before saving
                    </p>
                    <p className="text-xs text-amber-800 mt-1">Edit any display name below, or discard a receipt to leave it for next time. Nothing is saved until you confirm.</p>
                  </div>

                  {pendingReceipts.map((receipt, ri) => (
                    <div key={receipt.driveFileId} className="rounded-lg border border-[#E8DCC8] bg-[#FDFBF7] p-4">
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <p className="text-sm font-bold text-[#4B2B1D]">{receipt.vendor}</p>
                          <p className="text-xs text-[#9A7E6F]">{receipt.fileName}{receipt.receiptTotal != null && ` · $${receipt.receiptTotal.toFixed(2)}`}</p>
                          {receipt.lowConfidence && (
                            <p className="text-xs font-semibold text-[#D62F3D] mt-1">⚠ Item total doesn't match receipt total — double-check amounts</p>
                          )}
                        </div>
                        <button
                          onClick={() => discardPendingReceipt(ri)}
                          className="text-xs font-semibold text-[#9A7E6F] hover:text-[#D62F3D]"
                        >
                          Discard
                        </button>
                      </div>

                      <div className="space-y-2">
                        {receipt.items.map((item, ii) => (
                          <div key={ii} className="rounded-lg bg-white border border-[#E4D8C9] p-2 space-y-2">
                            <div className="grid grid-cols-[1fr_1fr_auto] gap-2 items-end">
                              <div>
                                <p className="text-[10px] text-[#9A7E6F]">Parsed as</p>
                                <p className="text-xs text-[#755B4C] truncate">{item.productName}</p>
                              </div>
                              <div>
                                <p className="text-[10px] text-[#9A7E6F]">Display name (inventory)</p>
                                <input
                                  value={item.displayName}
                                  onChange={(e) => updatePendingItemDisplayName(ri, ii, e.target.value)}
                                  className="w-full h-8 rounded border border-[#B9A88F] bg-[#FBF6EE] px-2 text-xs font-semibold text-[#4B2B1D] outline-none focus:border-[#3E6594]"
                                />
                              </div>
                              <p className="text-xs font-bold text-[#4B2B1D] text-right">${item.amount.toFixed(2)}</p>
                            </div>
                            <div className="grid grid-cols-[1fr_1.2fr_1fr] gap-2 items-end">
                              <div>
                                <p className="text-[10px] text-[#9A7E6F]" title="How many discrete units this price covers">Item count (@ price above)</p>
                                <input
                                  type="number"
                                  min={1}
                                  step="1"
                                  value={item.itemCount}
                                  onChange={(e) => updatePendingItemField(ri, ii, 'itemCount', parseInt(e.target.value, 10) || 1)}
                                  className="w-full h-8 rounded border border-[#B9A88F] bg-[#FBF6EE] px-2 text-xs text-[#4B2B1D] outline-none focus:border-[#3E6594]"
                                />
                              </div>
                              <div>
                                <p className="text-[10px] font-bold text-[#16A34A]" title="Total grams added to food inventory for this line">Grams → inventory</p>
                                <input
                                  type="number"
                                  min={0}
                                  step="any"
                                  value={item.gramWeight ?? ''}
                                  placeholder="not tracked"
                                  onChange={(e) => updatePendingItemField(ri, ii, 'gramWeight', e.target.value === '' ? null : parseFloat(e.target.value) || 0)}
                                  className="w-full h-8 rounded border border-[#86EFAC] bg-[#F0FDF4] px-2 text-xs font-bold text-[#15803D] outline-none focus:border-[#16A34A]"
                                />
                              </div>
                              <div>
                                <p className="text-[10px] text-[#9A7E6F]">Cost category</p>
                                <select
                                  value={item.category}
                                  onChange={(e) => updatePendingItemField(ri, ii, 'category', e.target.value)}
                                  className="w-full h-8 rounded border border-[#B9A88F] bg-[#FBF6EE] px-2 text-xs font-semibold text-[#4B2B1D] outline-none focus:border-[#3E6594]"
                                >
                                  {Object.entries(categoryColors).map(([key, { label }]) => (
                                    <option key={key} value={key}>{label}</option>
                                  ))}
                                </select>
                              </div>
                            </div>
                            {item.gramWeight == null && item.category === 'food_cogs' && (
                              <p className="text-[10px] font-semibold text-[#D62F3D]">⚠ No gram weight — this item won't add to inventory stock unless you enter one</p>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}

                  <div className="flex gap-3">
                    <button
                      onClick={() => setPendingReceipts([])}
                      className="flex-1 rounded-lg border border-[#B9A88F] bg-white py-3 text-sm font-semibold text-[#4B2B1D]"
                    >
                      Cancel All
                    </button>
                    <button
                      onClick={confirmSyncedReceipts}
                      disabled={confirmingReceipts}
                      className="flex-1 rounded-lg bg-blue-600 text-white py-3 text-sm font-semibold hover:bg-blue-700 disabled:opacity-50"
                    >
                      {confirmingReceipts ? 'Saving...' : `✓ Confirm & Save ${pendingReceipts.length} Receipt${pendingReceipts.length > 1 ? 's' : ''}`}
                    </button>
                  </div>
                </div>
              )}

              <div className="text-xs text-[#9A7E6F] bg-[#FBF7F0] p-3 rounded">
                <p><strong>📁 Folder name:</strong> "Fit4Sure Receipts"</p>
                <p><strong>✅ Confirmed receipts:</strong> Automatically moved to "Fit4Sure Receipts/Processed"</p>
              </div>
            </div>
          )}

          {/* Receipt Scanner Tab */}
          {receiptTab === 'scanner' && (
            <>
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileSelect}
                accept="image/*"
                disabled={isProcessing}
                className="hidden"
              />

              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleFileDrop}
                onClick={() => !isProcessing && fileInputRef.current?.click()}
                className={`border-2 border-dashed border-[#8B6F47] rounded-lg p-8 text-center cursor-pointer hover:bg-[#FBF7F0] transition ${isProcessing ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <div className="flex flex-col items-center gap-3">
                  {isProcessing ? (
                    <>
                      <Loader className="h-8 w-8 text-[#8B6F47] animate-spin" />
                      <p className="font-semibold text-[#4B2B1D]">{processingStatus}</p>
                    </>
                  ) : (
                    <>
                      <Upload className="h-8 w-8 text-[#8B6F47]" />
                      <div>
                        <p className="font-semibold text-[#4B2B1D]">Drop receipt image here or click to upload</p>
                        <p className="text-sm text-[#755B4C] mt-1">🤖 AI-powered by GoHighLevel for accurate parsing</p>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </>
          )}

          {/* Online Order Tab */}
          {receiptTab === 'screenshot' && (
            <div className="space-y-4">
              {!showScreenshotForm ? (
                <>
                  <div className="bg-[#FBF7F0] p-4 rounded-lg border border-[#E8DCC8]">
                    <p className="text-sm text-[#755B4C]"><strong>📧 Online Orders:</strong> Upload screenshot → Manually enter items below with prices and quantities</p>
                  </div>

                  <input
                    type="file"
                    ref={screenshotInputRef}
                    onChange={(e) => e.target.files?.[0] && handleScreenshotUpload(e.target.files[0])}
                    accept="image/*"
                    disabled={isProcessing}
                    className="hidden"
                  />

                  <div
                    onClick={() => !isProcessing && screenshotInputRef.current?.click()}
                    className={`border-2 border-dashed border-[#8B6F47] rounded-lg p-8 text-center cursor-pointer hover:bg-[#FBF7F0] transition ${isProcessing ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    <div className="flex flex-col items-center gap-3">
                      {isProcessing ? (
                        <>
                          <Loader className="h-8 w-8 text-[#8B6F47] animate-spin" />
                          <p className="font-semibold text-[#4B2B1D]">{processingStatus}</p>
                        </>
                      ) : (
                        <>
                          <Upload className="h-8 w-8 text-[#8B6F47]" />
                          <div>
                            <p className="font-semibold text-[#4B2B1D]">Drop screenshot here or click to upload</p>
                            <p className="text-sm text-[#755B4C] mt-1">OCR will extract item names automatically</p>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </>
              ) : (
                <div className="space-y-4">
                  {/* Vendor Name */}
                  <div>
                    <label className="block text-xs font-bold text-[#755B4C] mb-2">VENDOR/STORE NAME</label>
                    <input
                      type="text"
                      value={screenshotVendor}
                      onChange={(e) => setScreenshotVendor(e.target.value)}
                      placeholder="e.g., Amazon, Instacart, Costco Online..."
                      className="w-full px-3 py-2 border-2 border-[#D4A574] rounded-lg text-sm text-[#4B2B1D] bg-[#FDFBF7] focus:outline-none focus:ring-2 focus:ring-[#8B6F47]"
                    />
                  </div>

                  {/* Extracted Items */}
                  <div className="space-y-3">
                    <h3 className="font-semibold text-[#4B2B1D]">Extracted Items - Confirm Details</h3>
                    {screenshotItems.map((item, idx) => (
                      <div key={idx} className="rounded-lg bg-white border-2 border-[#D4A574] p-4 space-y-3">
                        {/* Product Name (extracted from OCR - can edit) */}
                        <div>
                          <label className="block text-xs font-bold text-[#755B4C] mb-1">PRODUCT NAME</label>
                          <input
                            type="text"
                            value={item.productName || ''}
                            onChange={(e) => {
                              const updated = [...screenshotItems]
                              updated[idx].productName = e.target.value
                              setScreenshotItems(updated)
                            }}
                            className="w-full px-3 py-2 border-2 border-[#D4A574] rounded-lg text-sm text-[#4B2B1D] bg-[#FDFBF7]"
                          />
                        </div>

                        {/* Price, Quantity, Category, Unit */}
                        <div className="grid grid-cols-4 gap-2">
                          <div>
                            <label className="block text-xs font-bold text-[#755B4C] mb-1">PRICE ($)</label>
                            <input
                              type="number"
                              step="0.01"
                              value={item.amount || ''}
                              onChange={(e) => {
                                const updated = [...screenshotItems]
                                updated[idx].amount = parseFloat(e.target.value) || 0
                                setScreenshotItems(updated)
                              }}
                              placeholder="0.00"
                              className="w-full px-2 py-2 border-2 border-[#D4A574] rounded-lg text-sm text-[#4B2B1D] bg-[#FDFBF7]"
                            />
                          </div>

                          <div>
                            <label className="block text-xs font-bold text-[#755B4C] mb-1">AMOUNT</label>
                            <input
                              type="number"
                              min="0.01"
                              step="0.01"
                              value={item.quantity || ''}
                              onChange={(e) => {
                                const updated = [...screenshotItems]
                                updated[idx].quantity = e.target.value ? parseFloat(e.target.value) : undefined
                                setScreenshotItems(updated)
                              }}
                              placeholder="500"
                              className="w-full px-2 py-2 border-2 border-[#D4A574] rounded-lg text-sm text-[#4B2B1D] bg-[#FDFBF7]"
                            />
                          </div>

                          <div>
                            <label className="block text-xs font-bold text-[#755B4C] mb-1">UNIT</label>
                            <select
                              value={item.unit || 'g'}
                              onChange={(e) => {
                                const updated = [...screenshotItems]
                                updated[idx].unit = e.target.value
                                setScreenshotItems(updated)
                              }}
                              className="w-full px-2 py-2 border-2 border-[#D4A574] rounded-lg text-sm text-[#4B2B1D] bg-[#FDFBF7]"
                            >
                              {unitOptions.map(opt => (
                                <option key={opt.value} value={opt.value}>{opt.label}</option>
                              ))}
                            </select>
                          </div>

                          <div>
                            <label className="block text-xs font-bold text-[#755B4C] mb-1">CATEGORY</label>
                            <select
                              value={item.category}
                              onChange={(e) => {
                                const updated = [...screenshotItems]
                                updated[idx].category = e.target.value
                                setScreenshotItems(updated)
                              }}
                              className="w-full px-2 py-2 border-2 border-[#D4A574] rounded-lg text-sm text-[#4B2B1D] bg-[#FDFBF7]"
                            >
                              {Object.entries(categoryColors).map(([key, val]) => (
                                <option key={key} value={key}>{val.label}</option>
                              ))}
                            </select>
                          </div>
                        </div>

                        {screenshotItems.length > 1 && (
                          <button
                            onClick={() => {
                              const updated = screenshotItems.filter((_, i) => i !== idx)
                              setScreenshotItems(updated)
                            }}
                            className="text-xs text-red-600 hover:text-red-700 font-semibold"
                          >
                            ✕ Remove
                          </button>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Action Buttons */}
                  <div className="flex gap-2">
                    <button
                      onClick={saveScreenshotItems}
                      className="flex-1 bg-green-600 text-white py-2 rounded-lg font-semibold hover:bg-green-700 transition"
                    >
                      ✓ Save Order
                    </button>
                    <button
                      onClick={() => {
                        setShowScreenshotForm(false)
                        setScreenshotItems([])
                        setScreenshotVendor('')
                      }}
                      className="flex-1 bg-gray-400 text-white py-2 rounded-lg font-semibold hover:bg-gray-500 transition"
                    >
                      ✕ Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {scannedReceipt && (
            <div className="space-y-4 mt-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Receipt Image Preview */}
                <div className="rounded-lg border border-[#E8DCC8] p-3">
                  <img src={scannedReceipt.image} alt="Receipt" className="w-full rounded-lg max-h-64 object-cover" />
                </div>

                {/* Extracted Details */}
                <div className="md:col-span-2 space-y-3">
                  <div className="rounded-lg bg-[#FDFBF7] p-4 border border-[#E8DCC8]">
                    <label className="text-xs text-[#755B4C] font-semibold">Extracted Vendor</label>
                    <p className="text-lg font-bold text-[#4B2B1D]">{scannedReceipt.vendor}</p>
                  </div>
                  <div className="rounded-lg bg-[#FDFBF7] p-4 border border-[#E8DCC8]">
                    <label className="text-xs text-[#755B4C] font-semibold">Total Amount</label>
                    <p className="text-lg font-bold text-[#4B2B1D]">${scannedReceipt.total.toLocaleString('en-US', { maximumFractionDigits: 2 })}</p>
                  </div>
                  <div className="rounded-lg bg-[#FDFBF7] p-4 border border-[#E8DCC8]">
                    <label className="text-xs text-[#755B4C] font-semibold">Items Found</label>
                    <p className="text-lg font-bold text-[#4B2B1D]">{scannedReceipt.items.length} line items</p>
                  </div>
                </div>
              </div>

              {/* Extracted Text Preview */}
              <details className="rounded-lg border border-[#E8DCC8] p-4 cursor-pointer hover:bg-[#FDFBF7]">
                <summary className="font-semibold text-[#4B2B1D]">📄 Raw OCR Text</summary>
                <pre className="mt-3 text-xs text-[#755B4C] whitespace-pre-wrap bg-white p-3 rounded border border-[#E8DCC8] max-h-48 overflow-y-auto">
                  {scannedReceipt.text}
                </pre>
              </details>

              {/* Extracted Items with Auto-Categorization */}
              <div className="space-y-2">
                <h3 className="font-semibold text-[#4B2B1D]">Items (Auto-Categorized)</h3>
                {scannedReceipt.items.map((item, idx) => (
                  <div key={idx} className="rounded-lg bg-white border-2 border-[#D4A574] p-4 space-y-4">
                    {/* Receipt Text & Price Row */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <p className="font-semibold text-[#4B2B1D] text-sm text-gray-600 italic">{item.description}</p>
                        <span className="text-xs text-[#9A7E6F] block">OCR confidence: {Math.round(item.confidence * 100)}%</span>
                      </div>
                      <div className="text-right">
                        {editingPriceIdx === idx ? (
                          <div className="flex gap-2 items-center">
                            <input
                              type="number"
                              step="0.01"
                              value={editingPrice}
                              onChange={(e) => setEditingPrice(e.target.value)}
                              className="w-24 px-2 py-1 border-2 border-[#D4A574] rounded-lg text-sm font-semibold text-[#4B2B1D] bg-[#FDFBF7] focus:outline-none focus:ring-2 focus:ring-[#8B6F47]"
                              autoFocus
                            />
                            <button
                              onClick={() => {
                                const updated = [...scannedReceipt.items]
                                updated[idx].amount = parseFloat(editingPrice) || item.amount
                                setScannedReceipt({ ...scannedReceipt, items: updated })
                                setEditingPriceIdx(null)
                                setEditingPrice('')
                              }}
                              className="px-2 py-1 bg-[#8B6F47] text-white rounded text-xs font-bold hover:bg-[#6B5437]"
                            >
                              ✓
                            </button>
                            <button
                              onClick={() => {
                                setEditingPriceIdx(null)
                                setEditingPrice('')
                              }}
                              className="px-2 py-1 bg-gray-400 text-white rounded text-xs font-bold hover:bg-gray-500"
                            >
                              ✕
                            </button>
                          </div>
                        ) : (
                          <div>
                            <p className="font-bold text-lg text-[#4B2B1D]">${(item.amount || 0).toLocaleString('en-US', { maximumFractionDigits: 2 })}</p>
                            <button
                              onClick={() => {
                                setEditingPriceIdx(idx)
                                setEditingPrice(item.amount.toString())
                              }}
                              className="text-xs text-[#8B6F47] hover:text-[#6B5437] font-semibold mt-1 underline"
                            >
                              Edit Price
                            </button>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Product Name / Assignment */}
                    <div>
                      <label className="block text-xs font-bold text-[#755B4C] mb-1">PRODUCT NAME</label>
                      <input
                        type="text"
                        value={item.productName || ''}
                        onChange={(e) => {
                          const updated = [...scannedReceipt.items]
                          updated[idx].productName = e.target.value
                          setScannedReceipt({ ...scannedReceipt, items: updated })
                        }}
                        placeholder="e.g., Blueberries, Chicken Breast, Olive Oil..."
                        className="w-full px-3 py-2 border-2 border-[#D4A574] rounded-lg text-sm text-[#4B2B1D] bg-[#FDFBF7] focus:outline-none focus:ring-2 focus:ring-[#8B6F47]"
                      />
                    </div>

                    <div className="grid grid-cols-3 gap-3">
                      {/* Category Dropdown */}
                      <div>
                        <label className="block text-xs font-bold text-[#755B4C] mb-1">CATEGORY</label>
                        <select
                          value={item.category}
                          onChange={(e) => {
                            const updated = [...scannedReceipt.items]
                            updated[idx].category = e.target.value
                            setScannedReceipt({ ...scannedReceipt, items: updated })
                          }}
                          className="w-full px-3 py-2 border-2 border-[#D4A574] rounded-lg text-sm font-semibold text-[#4B2B1D] bg-[#FDFBF7] focus:outline-none focus:ring-2 focus:ring-[#8B6F47]"
                        >
                          {Object.entries(categoryColors).map(([key, val]) => (
                            <option key={key} value={key}>
                              {val.label}
                            </option>
                          ))}
                        </select>
                        <div
                          className="mt-1 h-2 rounded"
                          style={{ backgroundColor: categoryColors[item.category]?.bg }}
                        ></div>
                      </div>

                      {/* Quantity for Inventory */}
                      <div>
                        <label className="block text-xs font-bold text-[#755B4C] mb-1">AMOUNT</label>
                        <input
                          type="number"
                          min="0.01"
                          step="0.01"
                          value={item.quantity || ''}
                          onChange={(e) => {
                            const updated = [...scannedReceipt.items]
                            updated[idx].quantity = e.target.value ? parseFloat(e.target.value) : undefined
                            setScannedReceipt({ ...scannedReceipt, items: updated })
                          }}
                          placeholder="500"
                          className="w-full px-2 py-2 border-2 border-[#D4A574] rounded-lg text-sm font-semibold text-[#4B2B1D] bg-[#FDFBF7] focus:outline-none focus:ring-2 focus:ring-[#8B6F47]"
                        />
                      </div>

                      {/* Unit Dropdown */}
                      <div>
                        <label className="block text-xs font-bold text-[#755B4C] mb-1">UNIT</label>
                        <select
                          value={item.unit || 'g'}
                          onChange={(e) => {
                            const updated = [...scannedReceipt.items]
                            updated[idx].unit = e.target.value
                            setScannedReceipt({ ...scannedReceipt, items: updated })
                          }}
                          className="w-full px-2 py-2 border-2 border-[#D4A574] rounded-lg text-sm font-semibold text-[#4B2B1D] bg-[#FDFBF7] focus:outline-none focus:ring-2 focus:ring-[#8B6F47]"
                        >
                          {unitOptions.map(opt => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Action Buttons */}
              <div className="flex gap-2 pt-4">
                <button
                  onClick={createExpensesFromReceipt}
                  className="flex-1 bg-[#8B6F47] text-white py-2 rounded-lg font-semibold hover:bg-[#6B5437] transition"
                >
                  ✓ Add All Items to Expenses
                </button>
                <button
                  onClick={() => setScannedReceipt(null)}
                  className="flex-1 bg-gray-400 text-white py-2 rounded-lg font-semibold hover:bg-gray-500 transition"
                >
                  ✕ Discard
                </button>
              </div>
            </div>
          )}
        </Section>

        {/* Expense Management */}
        <Section id="expenses" title={`Expense Management (${expenses.length} expenses)`} expandedSections={expandedSections} toggleSection={toggleSection}>
          <div className="space-y-4">
            {/* Summary by Category */}
            <div className="bg-[#FDFBF7] p-4 rounded-lg border border-[#E8DCC8]">
              <h3 className="font-semibold text-[#4B2B1D] mb-3">Expenses by Category</h3>
              <div className="space-y-2">
                {Object.entries(expensesByCategory).map(([cat, amount]) => (
                  <div key={cat} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded" style={{ backgroundColor: categoryColors[cat]?.bg || '#9A7E6F' }}></div>
                      <span className="text-[#755B4C]">{categoryColors[cat]?.label || cat}</span>
                    </div>
                    <span className="font-bold text-[#4B2B1D]">${(amount || 0).toLocaleString('en-US', { maximumFractionDigits: 2 })}</span>
                  </div>
                ))}
              </div>
              {pendingExpenses > 0 && (
                <div className="mt-3 pt-3 border-t border-[#E8DCC8]">
                  <p className="text-sm text-yellow-700 bg-yellow-50 px-3 py-2 rounded">
                    ⚠️ ${pendingExpenses.toLocaleString('en-US', { maximumFractionDigits: 2 })} pending approval
                  </p>
                </div>
              )}
            </div>

            {/* Ledger -- one row per line item, with bulk + single-row
                approve/reject and an audit trail of who acted and when */}
            <Section id="ledger" title={`Ledger (${expenses.length})`} expandedSections={expandedSections} toggleSection={toggleSection}>
              {selectedExpenseIds.size > 0 && (
                <div className="flex items-center justify-between gap-3 rounded-xl bg-[#4B2B1D] text-white px-4 py-2.5 mb-3">
                  <span className="text-sm font-bold">{selectedExpenseIds.size} selected</span>
                  <div className="flex gap-2">
                    <button onClick={bulkApproveSelected} disabled={bulkActing} className="inline-flex items-center gap-1.5 rounded-lg bg-[#2F7A4D] px-3 py-1.5 text-xs font-bold disabled:opacity-50">
                      <Check className="h-3.5 w-3.5" /> Approve selected
                    </button>
                    <button onClick={() => setSelectedExpenseIds(new Set())} className="rounded-lg border border-white/30 bg-white/10 px-3 py-1.5 text-xs font-bold">Cancel</button>
                  </div>
                </div>
              )}
              {expensesLoading ? (
                <p className="text-sm text-[#755B4C]">Loading...</p>
              ) : expenses.length === 0 ? (
                <p className="text-sm text-[#755B4C]">No expenses logged yet.</p>
              ) : (
                <div className="overflow-x-auto rounded-lg border border-[#E8DCC8]">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-[#E8DCC8] bg-[#FDFBF7]">
                        <th className="px-3 py-2 w-6">
                          <input
                            type="checkbox"
                            checked={selectedExpenseIds.size > 0 && selectedExpenseIds.size === expenses.filter((e) => e.status === 'pending').length}
                            onChange={(e) => setSelectedExpenseIds(e.target.checked ? new Set(expenses.filter((x) => x.status === 'pending').map((x) => x.id)) : new Set())}
                          />
                        </th>
                        <th className="px-3 py-2 text-left font-bold text-[#4B2B1D]">Date</th>
                        <th className="px-3 py-2 text-left font-bold text-[#4B2B1D]">Vendor</th>
                        <th className="px-3 py-2 text-left font-bold text-[#4B2B1D]">Category</th>
                        <th className="px-3 py-2 text-left font-bold text-[#4B2B1D]">Source</th>
                        <th className="px-3 py-2 text-right font-bold text-[#4B2B1D]">Amount</th>
                        <th className="px-3 py-2 text-left font-bold text-[#4B2B1D]">Status</th>
                        <th className="px-3 py-2"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {expenses.map((e) => {
                        const sourceIcon = e.sourceType === 'gdrive' ? <Cloud className="h-3 w-3" /> : e.sourceType === 'scan' ? <Camera className="h-3 w-3" /> : <Edit3 className="h-3 w-3" />
                        const sourceLabel = e.sourceType === 'gdrive' ? 'Drive' : e.sourceType === 'scan' ? 'Scan' : 'Manual'
                        const statusStyle =
                          e.status === 'approved' || e.status === 'reconciled' ? 'bg-[#EAF4EC] text-[#2F7A4D]'
                          : e.status === 'rejected' ? 'bg-[#FBEBE8] text-[#B4432F]'
                          : 'bg-[#FBF2DE] text-[#B4831F]'
                        return (
                          <tr key={e.id} className="border-b border-[#E8DCC8] hover:bg-[#FDFBF7] align-top">
                            <td className="px-3 py-2">
                              {e.status === 'pending' && (
                                <input type="checkbox" checked={selectedExpenseIds.has(e.id)} onChange={() => toggleExpenseSelected(e.id)} />
                              )}
                            </td>
                            <td className="px-3 py-2 text-[#755B4C] whitespace-nowrap">{new Date(e.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })}</td>
                            <td className="px-3 py-2 font-semibold text-[#4B2B1D]">{e.vendor}</td>
                            <td className="px-3 py-2 text-[#755B4C]">{categoryColors[e.category]?.label || e.category}</td>
                            <td className="px-3 py-2">
                              <span className="inline-flex items-center gap-1 rounded-full bg-[#F0ECE3] text-[#755B4C] px-2 py-0.5 text-[11px] font-bold">{sourceIcon}{sourceLabel}</span>
                            </td>
                            <td className="px-3 py-2 text-right font-bold text-[#4B2B1D]">${e.amount.toFixed(2)}</td>
                            <td className="px-3 py-2">
                              <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-bold capitalize ${statusStyle}`}>{e.status}</span>
                              {e.approvedByName && e.approvedAt && (
                                <div className="mt-0.5 text-[10px] text-[#9A7E6F]">by {e.approvedByName} · {new Date(e.approvedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</div>
                              )}
                            </td>
                            <td className="px-3 py-2">
                              {e.status === 'pending' && (
                                <div className="flex gap-1">
                                  <button onClick={() => approveExpense(e.id)} title="Approve" className="h-6 w-6 rounded border border-[#E8DCC8] flex items-center justify-center text-[#2F7A4D] hover:bg-[#EAF4EC]">
                                    <Check className="h-3 w-3" />
                                  </button>
                                  <button onClick={() => rejectExpense(e.id)} title="Reject" className="h-6 w-6 rounded border border-[#E8DCC8] flex items-center justify-center text-[#B4432F] hover:bg-[#FBEBE8]">
                                    <X className="h-3 w-3" />
                                  </button>
                                </div>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </Section>

            {/* Receipt History -- one row per receipt (not per line item),
                with a direct link back to the source image */}
            <Section id="receiptHistory" title={`Receipt History (${receipts.length})`} expandedSections={expandedSections} toggleSection={toggleSection}>
              {receiptsLoading ? (
                <p className="text-sm text-[#755B4C]">Loading...</p>
              ) : receipts.length === 0 ? (
                <p className="text-sm text-[#755B4C]">No receipts recorded yet.</p>
              ) : (
                <div className="overflow-x-auto rounded-lg border border-[#E8DCC8]">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-[#E8DCC8] bg-[#FDFBF7]">
                        <th className="px-3 py-2 text-left font-bold text-[#4B2B1D]">Date</th>
                        <th className="px-3 py-2 text-left font-bold text-[#4B2B1D]">Vendor</th>
                        <th className="px-3 py-2 text-right font-bold text-[#4B2B1D]">Amount</th>
                        <th className="px-3 py-2 text-center font-bold text-[#4B2B1D]">Items</th>
                        <th className="px-3 py-2 text-center font-bold text-[#4B2B1D]">Receipt</th>
                      </tr>
                    </thead>
                    <tbody>
                      {receipts.map((r) => {
                        const amount = r.totalAmountCents != null ? r.totalAmountCents / 100 : r.itemsTotal
                        return (
                          <tr key={r.id} className="border-b border-[#E8DCC8] hover:bg-[#FDFBF7]">
                            <td className="px-3 py-2 text-[#755B4C]">
                              {r.receiptDate ? new Date(r.receiptDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }) : '-'}
                            </td>
                            <td className="px-3 py-2 font-semibold text-[#4B2B1D]">
                              {r.vendor}
                              {r.lowConfidence && (
                                <span className="ml-2 text-xs font-bold text-[#D62F3D]" title="Item total didn't match the printed receipt total -- worth double-checking">⚠</span>
                              )}
                            </td>
                            <td className="px-3 py-2 text-right font-bold text-[#16813D]">${amount.toFixed(2)}</td>
                            <td className="px-3 py-2 text-center text-[#755B4C]">{r.itemCount}</td>
                            <td className="px-3 py-2 text-center">
                              {r.driveViewLink ? (
                                <a
                                  href={r.driveViewLink}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-xs font-bold text-[#2E527F] underline underline-offset-2"
                                >
                                  View
                                </a>
                              ) : (
                                <span className="text-xs text-[#9A7E6F]">No image</span>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </Section>

            {/* Add Expense Form */}
            <Section id="expenseForm" title="Add New Expense" expandedSections={expandedSections} toggleSection={toggleSection}>
              <div className="space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <input
                    type="date"
                    value={formData.date || ''}
                    onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                    className="px-3 py-2 border border-[#E8DCC8] rounded-lg text-[#4B2B1D] focus:outline-none focus:ring-2 focus:ring-[#8B6F47]"
                  />
                  <input
                    type="text"
                    placeholder="Vendor/Supplier name"
                    value={formData.vendor || ''}
                    onChange={(e) => setFormData({ ...formData, vendor: e.target.value })}
                    className="px-3 py-2 border border-[#E8DCC8] rounded-lg text-[#4B2B1D] placeholder-[#9A7E6F] focus:outline-none focus:ring-2 focus:ring-[#8B6F47]"
                  />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <select
                    value={formData.category || 'food_cogs'}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    className="px-3 py-2 border border-[#E8DCC8] rounded-lg text-[#4B2B1D] focus:outline-none focus:ring-2 focus:ring-[#8B6F47]"
                  >
                    {Object.entries(categoryColors).map(([key, val]) => (
                      <option key={key} value={key}>{val.label}</option>
                    ))}
                  </select>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="Amount"
                    value={formData.amount || ''}
                    onChange={(e) => setFormData({ ...formData, amount: parseFloat(e.target.value) })}
                    className="px-3 py-2 border border-[#E8DCC8] rounded-lg text-[#4B2B1D] placeholder-[#9A7E6F] focus:outline-none focus:ring-2 focus:ring-[#8B6F47]"
                  />
                </div>
                <input
                  type="text"
                  placeholder="Description"
                  value={formData.description || ''}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-3 py-2 border border-[#E8DCC8] rounded-lg text-[#4B2B1D] placeholder-[#9A7E6F] focus:outline-none focus:ring-2 focus:ring-[#8B6F47]"
                />
                <button
                  onClick={addExpense}
                  className="w-full bg-[#8B6F47] text-white py-2 rounded-lg font-semibold hover:bg-[#6B5437] transition flex items-center justify-center gap-2"
                >
                  <Plus className="h-4 w-4" /> Add Expense
                </button>
              </div>
            </Section>

          </div>
        </Section>
      </div>
      )}

      {activeTab === 'reports' && (
        <div className="space-y-4">
          <div className="flex items-center gap-3 rounded-xl bg-[#EAF0F7] text-[#2E527F] px-4 py-3 text-sm font-semibold">
            <Calendar className="h-4 w-4 flex-shrink-0" />
            Auto-generated on the 1st and 15th of every month, covering the prior half-month period.
            <button onClick={generateReport} disabled={generatingReport} className="ml-auto rounded-lg bg-[#2E527F] text-white px-3 py-1.5 text-xs font-bold disabled:opacity-50 whitespace-nowrap">
              {generatingReport ? 'Generating...' : 'Generate now'}
            </button>
          </div>

          {reportsLoading ? (
            <p className="text-sm text-[#755B4C]">Loading...</p>
          ) : reports.length === 0 ? (
            <p className="text-sm text-[#755B4C]">No reports generated yet.</p>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {reports.map((r, idx) => {
                const netProfit = r.net_profit_cents / 100
                const prior = reports[idx + 1]
                const priorNet = prior ? prior.net_profit_cents / 100 : null
                const deltaPct = priorNet ? Math.round(((netProfit - priorNet) / Math.abs(priorNet)) * 1000) / 10 : null
                return (
                  <div key={r.id} className={`rounded-2xl border bg-white p-5 ${idx === 0 ? 'border-[#2E527F]' : 'border-[#E8DCC8]'}`}>
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-bold uppercase tracking-wide text-[#9A7E6F]">
                        {new Date(r.period_start).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })} – {new Date(r.period_end).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })}
                      </p>
                      {idx === 0 && <span className="rounded-full bg-[#EAF0F7] text-[#2E527F] px-2 py-0.5 text-[10px] font-bold">LATEST</span>}
                    </div>
                    <p className="mt-1 text-base font-extrabold text-[#4B2B1D]">Semi-monthly report</p>
                    <div className="mt-3 flex gap-8">
                      <div>
                        <p className="text-[11px] text-[#9A7E6F]">Net profit</p>
                        <p className="text-lg font-extrabold text-[#4B2B1D]">${netProfit.toLocaleString('en-US', { maximumFractionDigits: 2 })}</p>
                      </div>
                      {deltaPct !== null && (
                        <div>
                          <p className="text-[11px] text-[#9A7E6F]">vs. prior period</p>
                          <p className={`text-lg font-extrabold ${deltaPct >= 0 ? 'text-[#2F7A4D]' : 'text-[#B4432F]'}`}>{deltaPct >= 0 ? '▲' : '▼'} {Math.abs(deltaPct)}%</p>
                        </div>
                      )}
                    </div>
                    <button onClick={() => setViewingReport(r)} className="mt-4 rounded-lg bg-[#2E527F] text-white px-3 py-1.5 text-xs font-bold hover:bg-[#24466E]">
                      View report
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {viewingReport && (
        <>
          <button onClick={() => setViewingReport(null)} className="fixed inset-0 z-40 bg-black/30" />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl max-h-[85vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-lg font-extrabold text-[#4B2B1D] flex items-center gap-2"><FileText className="h-4 w-4" />Semi-monthly report</h2>
                  <p className="text-xs text-[#9A7E6F] mt-0.5">
                    {new Date(viewingReport.period_start).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })} – {new Date(viewingReport.period_end).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })}
                  </p>
                </div>
                <button onClick={() => setViewingReport(null)} className="rounded-lg border border-[#E8DCC8] p-2"><X className="h-4 w-4" /></button>
              </div>
              <div className="grid grid-cols-3 gap-3 mb-4">
                <div className="rounded-lg bg-[#FDFBF7] border border-[#E8DCC8] p-3">
                  <p className="text-[11px] text-[#9A7E6F]">Gross Revenue</p>
                  <p className="text-base font-extrabold text-[#4B2B1D]">${(viewingReport.gross_revenue_cents / 100).toLocaleString('en-US', { maximumFractionDigits: 2 })}</p>
                </div>
                <div className="rounded-lg bg-[#FDFBF7] border border-[#E8DCC8] p-3">
                  <p className="text-[11px] text-[#9A7E6F]">Expenses</p>
                  <p className="text-base font-extrabold text-[#4B2B1D]">${(viewingReport.total_expenses_cents / 100).toLocaleString('en-US', { maximumFractionDigits: 2 })}</p>
                </div>
                <div className="rounded-lg bg-[#FDFBF7] border border-[#E8DCC8] p-3">
                  <p className="text-[11px] text-[#9A7E6F]">Net Profit</p>
                  <p className="text-base font-extrabold text-[#2F7A4D]">${(viewingReport.net_profit_cents / 100).toLocaleString('en-US', { maximumFractionDigits: 2 })}</p>
                </div>
              </div>
              {viewingReport.snapshot_json?.expensesByCategory && viewingReport.snapshot_json.expensesByCategory.length > 0 && (
                <div>
                  <p className="text-xs font-bold text-[#4B2B1D] mb-2">Expenses by category</p>
                  <div className="space-y-1.5">
                    {viewingReport.snapshot_json.expensesByCategory.map((c) => (
                      <div key={c.category} className="flex items-center justify-between text-sm">
                        <span className="text-[#755B4C]">{categoryColors[c.category]?.label || c.category}</span>
                        <span className="font-bold text-[#4B2B1D]">${(c.amountCents / 100).toLocaleString('en-US', { maximumFractionDigits: 2 })}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </main>
  )
}

export default function FinancialsPageWithErrorBoundary() {
  return (
    <ErrorBoundary>
      <FinancialsPage />
    </ErrorBoundary>
  )
}
