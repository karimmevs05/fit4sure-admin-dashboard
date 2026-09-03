import React, { useState, useEffect, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import axios from 'axios'
import {
  Search, Plus, Mail, Phone, Edit, Trash2, X, Clock, Zap,
  Download, LayoutGrid, AlignJustify, AlertTriangle, ChevronLeft, ChevronRight, ChevronDown,
  Building2, UserPlus, Square, Send, List,
  FileText, Image as ImageIcon, Video, Link as LinkIcon, Copy, Eye, MapPin, Star,
} from 'lucide-react'
import { CustomerActivityPanel } from '../components/CustomerActivityPanel'
import { AutomationBuilder } from '../components/AutomationBuilder'

type Customer = {
  id: number
  name: string
  email?: string
  phone?: string
  address?: string
  apt_gate_code?: string
  address_count?: number
  payment_mode?: string
  household_size?: number
  occupation?: string
  primary_goal?: string
  biggest_hurdle?: string
  protein_preference?: string
  dietary_preference?: string
  foods_to_avoid?: string
  dietary_restrictions?: string
  notes?: string
  created_at?: string
  stage_entered_at?: string | null
  total_meals_ordered?: number
  weeks_active?: number
  last_order_date?: string
  lifetime_value_cents?: number
  sales_pipeline_stage?: 'prospect' | 'engaged' | 'trial' | 'active' | 'at_risk' | 'churned'
  conversion_probability?: number
  conversion_probability_prev?: number | null
  win_probability_momentum?: number
  win_probability_recency?: number
  win_probability_completeness?: number
  win_probability_objection?: number
  days_since_last_contact?: number
  engagement_score?: number
}

// Insights/Activities/Automations/Lists/Tasks used to be five separate tabs a
// rep had to click between. They're now standing, collapsible sections that
// sit below the board on every tab -- not gated behind a click of their own.
// Active/Prospects/Lost Prospects used to be three separate tabs over the
// same underlying table. Folded into one "Customers" tab -- the database --
// with the three as a category filter inside it instead of three clicks.
type Tab = 'pipeline' | 'customers' | 'sources'
type CustomerCategory = 'all' | 'active' | 'prospect' | 'churned'

// ---------------------------------------------------------------------------
// PROPOSAL-ONLY ADDITIONS
//
// lead_source / account_type / company_name / referred_by don't exist on the
// backend `customers` table yet -- this is a preview, not a migration. Until
// those columns land, this page keeps them in localStorage keyed by customer
// id so the concept is fully clickable without touching production schema.
// Everything else (adding a lead, moving a stage, deleting) hits the real
// API and will show up in the real Sales Pipeline page too.
// ---------------------------------------------------------------------------

type LeadSource = 'ambassador' | 'outreach_visit' | 'grab_and_go' | 'social_funnel' | 'referral' | 'organic'
type AccountType = 'individual' | 'business'
type LossReason = 'price' | 'timing' | 'competitor' | 'unresponsive' | 'moved_relocated' | 'other'

type LeadMeta = {
  lead_source?: LeadSource
  source_detail?: string
  source_id?: string
  promo_code_id?: string
  account_type?: AccountType
  company_name?: string
  loss_reason?: LossReason
}

const LOSS_REASON_LABEL: Record<LossReason, string> = {
  price: 'Price',
  timing: 'Bad Timing',
  competitor: 'Went with Competitor',
  unresponsive: 'Unresponsive',
  moved_relocated: 'Moved/Relocated',
  other: 'Other',
}
const LOSS_REASON_COLORS: { bg: string; border: string; text: string } = { bg: '#FFE6EC', border: '#F7B3C5', text: '#C21E3C' }

const LEAD_META_KEY = 'f4s_lead_meta_preview'

function readLeadMeta(): Record<number, LeadMeta> {
  try {
    const raw = localStorage.getItem(LEAD_META_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}
function writeLeadMeta(map: Record<number, LeadMeta>) {
  localStorage.setItem(LEAD_META_KEY, JSON.stringify(map))
}

// ---------------------------------------------------------------------------
// LEAD SOURCES -- named, reusable sources within each category (a specific
// ambassador, a specific outreach visit, a specific social campaign) instead
// of free text retyped per lead. Preview-only/localStorage, same reasoning as
// everything else here: no backend table for this yet. Tagging a lead sets
// leadMeta.source_id, which also fixes leadMeta.lead_source to this source's
// category so every existing category-based badge/filter keeps working
// unchanged.
// ---------------------------------------------------------------------------
type ManagedSource = {
  id: string
  name: string
  category: LeadSource
  monthly_cost_cents?: number
  created_at: string
}

const SOURCES_KEY = 'f4s_managed_sources_preview'

function readManagedSources(): ManagedSource[] {
  try {
    const raw = localStorage.getItem(SOURCES_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}
function writeManagedSources(list: ManagedSource[]) {
  localStorage.setItem(SOURCES_KEY, JSON.stringify(list))
}

// ---------------------------------------------------------------------------
// The actual Hormozi discipline: every source gets measured the same way --
// volume, conversion, cost, LTV, and the one number that decides whether to
// scale it or kill it (LTV:CAC). Cost is charged for every month the source
// has existed (not just its current month), since a source running for six
// months has genuinely cost six months of spend even if this month's bill
// is the same $210 as month one.
// ---------------------------------------------------------------------------
type EnrichedCustomer = Customer & LeadMeta
const MS_PER_MONTH = 30 * 24 * 60 * 60 * 1000

function computeSourceMetrics(source: ManagedSource, enriched: EnrichedCustomer[]) {
  const leads = enriched.filter((c) => c.source_id === source.id)
  const converted = leads.filter((c) => c.sales_pipeline_stage === 'active')
  const revenueCents = leads.reduce((sum, c) => sum + (c.lifetime_value_cents || 0), 0)
  const avgLtvCents = converted.length > 0 ? revenueCents / converted.length : 0
  const monthsActive = Math.max(1, Math.ceil((Date.now() - new Date(source.created_at).getTime()) / MS_PER_MONTH))
  const totalCostCents = (source.monthly_cost_cents || 0) * monthsActive
  const cacCents = converted.length > 0 ? totalCostCents / converted.length : null
  let ratio: number | null
  if (cacCents != null && cacCents > 0) ratio = avgLtvCents / cacCents
  else if (totalCostCents === 0 && converted.length > 0) ratio = Infinity
  else ratio = null
  return { leadCount: leads.length, convertedCount: converted.length, revenueCents, avgLtvCents, monthsActive, totalCostCents, cacCents, ratio }
}

// Hormozi's own rule of thumb: below 1:1 you're losing money, 1-3:1 needs
// work, 3:1+ is healthy and worth scaling.
function ltvCacVerdict(ratio: number | null): { label: string; text: string; bg: string; border: string } {
  if (ratio == null) return { label: 'Not enough data', text: '#755B4C', bg: '#F5F0E8', border: '#E4D8C9' }
  if (ratio === Infinity) return { label: 'Free & converting', text: '#158A4D', bg: '#EBF8F0', border: '#B3DFC7' }
  if (ratio >= 3) return { label: 'Scale it', text: '#158A4D', bg: '#EBF8F0', border: '#B3DFC7' }
  if (ratio >= 1) return { label: 'Optimize', text: '#C97C34', bg: '#FFF0E6', border: '#FFD4B0' }
  return { label: 'Cut or fix', text: '#C21E3C', bg: '#FFE6EC', border: '#F7B3C5' }
}

function fmtCents(cents: number): string {
  return `$${Math.round(cents / 100).toLocaleString()}`
}
function fmtRatio(r: number | null): string {
  if (r == null) return '—'
  if (r === Infinity) return '∞'
  return `${r.toFixed(1)}:1`
}

// ---------------------------------------------------------------------------
// PROMO CODES -- the Growth Plan's actual lead-capture mechanism: every
// sample drop and outreach visit hands out a code, and redeeming it is what
// turns a stranger into a tracked lead tagged to exactly where it came from.
// A code optionally links to a managed Source so redemptions roll up into
// that source's lead count automatically.
// ---------------------------------------------------------------------------
type PromoCode = {
  id: string
  code: string
  source_id?: string
  description?: string
  created_at: string
}
const PROMO_CODES_KEY = 'f4s_promo_codes_preview'

function readPromoCodes(): PromoCode[] {
  try {
    const raw = localStorage.getItem(PROMO_CODES_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}
function writePromoCodes(list: PromoCode[]) {
  localStorage.setItem(PROMO_CODES_KEY, JSON.stringify(list))
}

// ---------------------------------------------------------------------------
// SOCIAL INBOX -- a per-handle conversation thread, not a flat log of
// one-off notes. Every DM/comment from the same person appends to their own
// thread, so by the time you're deciding whether to convert someone, you see
// the whole relationship -- what they asked, what you said, what changed --
// instead of just the last thing they typed. Manual today (no Instagram API
// hookup); converting a contact carries the full transcript into the real
// customer's notes so that context survives the handoff instead of staying
// stranded in this inbox.
// ---------------------------------------------------------------------------
type SocialMessage = {
  id: string
  type: 'dm' | 'comment'
  text: string
  created_at: string
}
type SocialContact = {
  id: string
  handle: string
  status: 'new' | 'converted' | 'ignored'
  messages: SocialMessage[]
  created_at: string
  converted_customer_id?: number
}
const SOCIAL_CONTACTS_KEY = 'f4s_social_contacts_preview'

function readSocialContacts(): SocialContact[] {
  try {
    const raw = localStorage.getItem(SOCIAL_CONTACTS_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}
function writeSocialContacts(list: SocialContact[]) {
  localStorage.setItem(SOCIAL_CONTACTS_KEY, JSON.stringify(list))
}

// ---------------------------------------------------------------------------
// INSTAGRAM EXPORT IMPORT -- Meta's own "Download Your Information" export
// (a folder of message_1.json files, no API/App Review needed to get it)
// gives you every real historical DM, entirely client-side. This is the
// bulk-backfill counterpart to logging things by hand one at a time above.
//
// Meta's export double-encodes non-ASCII text (emoji, accents) as UTF-8
// bytes misread as Latin-1 -- fixInstagramEncoding reverses that. The
// business's own display name is filtered out of "who's the contact" and
// prefixed onto each line instead, so the thread reads like a transcript.
// ---------------------------------------------------------------------------
const IG_BUSINESS_NAMES = new Set(['Fit 4 Sure', 'fit4sure.food'])

function fixInstagramEncoding(s: string): string {
  try {
    return decodeURIComponent(escape(s))
  } catch {
    return s
  }
}

// Conversation folders are named "<username>_<numericid>" -- the username
// segment is the real @handle, which is more useful here than the
// participant's freeform display name. Folders with no recoverable username
// (deleted accounts, the Meta AI assistant thread) return null and get
// skipped -- there's no one to follow up with.
function handleFromConversationPath(path: string): string | null {
  const parts = path.split('/')
  const idx = parts.findIndex((p) => p === 'message_1.json')
  const folder = idx > 0 ? parts[idx - 1] : null
  if (!folder) return null
  const match = folder.match(/^(.*)_[0-9]+$/)
  const slug = match ? match[1] : folder
  if (!slug || /^[0-9]+$/.test(slug) || slug.startsWith('instagramuser') || slug.startsWith('metaai')) return null
  return slug
}

async function parseInstagramMessageFile(file: File): Promise<{ handle: string; messages: SocialMessage[] } | null> {
  const path = (file as any).webkitRelativePath || file.name
  const handle = handleFromConversationPath(path)
  if (!handle) return null
  let data: any
  try {
    data = JSON.parse(await file.text())
  } catch {
    return null
  }
  const messages: SocialMessage[] = (data.messages || [])
    .filter((m: any) => typeof m.content === 'string' && m.content.length > 0)
    .map((m: any) => {
      const sender = fixInstagramEncoding(m.sender_name || '')
      const content = fixInstagramEncoding(m.content)
      const fromBusiness = IG_BUSINESS_NAMES.has(sender)
      return {
        id: `msg_${m.timestamp_ms}_${Math.random().toString(36).slice(2, 8)}`,
        type: 'dm' as const,
        text: `${fromBusiness ? '[You]' : '[Them]'}: ${content}`,
        created_at: new Date(m.timestamp_ms).toISOString(),
      }
    })
    .sort((a: SocialMessage, b: SocialMessage) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
  if (messages.length === 0) return null
  return { handle, messages }
}

// The Pipeline board itself is a working set, not a mirror of the whole
// customer table -- it starts empty every session (nobody wants yesterday's
// leftover triage staring back at them) and you build it by ticking people
// on Active/Prospects/Lost Prospects. Wrapping up a session moves everyone
// off the board and into this follow-up queue instead of just losing them --
// this queue persists (localStorage, preview-only) since the whole point is
// that nothing falls through the cracks. Becomes a real `crm-tasks` row per
// person once there's a POST endpoint for it; today it's a holding pen.
type FollowUpEntry = { customerId: number; name: string; note: string; createdAt: string }
const FOLLOWUP_KEY = 'f4s_followup_queue_preview'

function readFollowUps(): FollowUpEntry[] {
  try {
    const raw = localStorage.getItem(FOLLOWUP_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}
function writeFollowUps(list: FollowUpEntry[]) {
  localStorage.setItem(FOLLOWUP_KEY, JSON.stringify(list))
}

const LEAD_SOURCE_LABEL: Record<LeadSource, string> = {
  ambassador: 'Ambassador',
  outreach_visit: 'Outreach Visit',
  grab_and_go: 'Grab & Go',
  social_funnel: 'Social / Funnel',
  referral: 'Referral',
  organic: 'Organic',
}

// Alex Hormozi's "Core Four" ($100M Leads): every lead you get is either
// Warm or Cold, and Outreach (you contact them) or Content (they come to
// you). Mapped onto this business's actual categories -- Referral is warm
// outreach (people who already trust you, personally asked), Outreach Visit
// is cold outreach (strangers, contacted first), Ambassador is warm content
// (someone else's already-trusting audience posting for you), Social/Funnel
// is cold content (strangers finding you through posts/ads). Grab & Go is a
// physical trial touchpoint, not a lead-gen method in Hormozi's sense --
// kept as its own bucket rather than force-fit. Organic is the unattributed
// baseline every business has regardless of what it's actively doing.
const CORE_FOUR_LABEL: Record<LeadSource, string> = {
  referral: 'Warm Outreach',
  outreach_visit: 'Cold Outreach',
  ambassador: 'Warm Content',
  social_funnel: 'Cold Content',
  grab_and_go: 'Physical Touchpoint',
  organic: 'Unattributed Baseline',
}

// Reuses the exact palette already established by the pipeline-stage badges
// below -- no new hues introduced for the sake of a "preview" feature.
const LEAD_SOURCE_COLORS: Record<LeadSource, { bg: string; border: string; text: string }> = {
  ambassador: { bg: '#E3F3FF', border: '#B3D9F7', text: '#1E6BA8' },
  outreach_visit: { bg: '#FFF0E6', border: '#FFD4B0', text: '#C97C34' },
  grab_and_go: { bg: '#EBF8F0', border: '#B3DFC7', text: '#158A4D' },
  social_funnel: { bg: '#E0F2FE', border: '#BAE6FD', text: '#0369A1' },
  referral: { bg: '#FBF6EC', border: '#E9D9BF', text: '#9A6D34' },
  organic: { bg: '#F5F5F5', border: '#D4D4D4', text: '#666666' },
}

const STAGE_ORDER: NonNullable<Customer['sales_pipeline_stage']>[] = ['prospect', 'engaged', 'trial', 'active', 'at_risk', 'churned']
const STAGE_LABEL: Record<string, string> = {
  prospect: 'Prospect', engaged: 'Engaged', trial: 'Trial', active: 'Active', at_risk: 'At Risk', churned: 'Churned',
}
const STAGE_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  prospect: { bg: '#FBF6EC', border: '#E9D9BF', text: '#9A6D34' },
  engaged: { bg: '#E3F3FF', border: '#B3D9F7', text: '#1E6BA8' },
  trial: { bg: '#FFF0E6', border: '#FFD4B0', text: '#C97C34' },
  active: { bg: '#EBF8F0', border: '#B3DFC7', text: '#158A4D' },
  at_risk: { bg: '#FFE6EC', border: '#F7B3C5', text: '#C21E3C' },
  churned: { bg: '#F5F5F5', border: '#D4D4D4', text: '#666666' },
}

const ASSET_CATEGORY_LABEL: Record<string, string> = {
  pricing_offers: 'Pricing & Offers', menus_samples: 'Menus & Samples', social_proof: 'Social Proof', partnerships: 'Partnerships',
}
const ASSET_TYPE_ICON: Record<string, React.ElementType> = { pdf: FileText, image: ImageIcon, video: Video, link: LinkIcon }

function LeadSourceBadge({ source }: { source?: LeadSource }) {
  const s = source || 'organic'
  const c = LEAD_SOURCE_COLORS[s]
  return (
    <span
      className="text-[10px] px-2 py-0.5 rounded-full font-bold whitespace-nowrap"
      style={{ backgroundColor: c.bg, color: c.text, border: `1px solid ${c.border}` }}
    >
      {LEAD_SOURCE_LABEL[s]}
    </span>
  )
}

// ---------------------------------------------------------------------------
// WIN PROBABILITY -- real now (backend computes it from stage momentum,
// contact recency, profile completeness, and a logged objection, not the
// old flat per-stage constants). The ring is colored by band, the arrow
// compares today's live score against the last recompute-pipeline snapshot
// (conversion_probability_prev), and clicking it expands the four real
// component values instead of a placeholder breakdown.
// ---------------------------------------------------------------------------
function winProbabilityBand(score: number): { bg: string; border: string; text: string; ring: string } {
  if (score >= 65) return { bg: '#EBF8F0', border: '#B3DFC7', text: '#158A4D', ring: '#16A34A' }
  if (score >= 40) return { bg: '#FFF0E6', border: '#FFD4B0', text: '#C97C34', ring: '#D97706' }
  return { bg: '#FFE6EC', border: '#F7B3C5', text: '#C21E3C', ring: '#D62F3D' }
}

function WinProbabilityRing({ score, size = 44 }: { score: number; size?: number }) {
  const band = winProbabilityBand(score)
  const stroke = size >= 40 ? 4 : 3
  const r = (size - stroke) / 2
  const circumference = 2 * Math.PI * r
  const offset = circumference * (1 - score / 100)
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="flex-shrink-0">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#F0EAE0" strokeWidth={stroke} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={band.ring}
        strokeWidth={stroke}
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <text x="50%" y="50%" textAnchor="middle" dominantBaseline="central" fontSize={size * 0.3} fontWeight="800" fill={band.text}>
        {score}
      </text>
    </svg>
  )
}

function WinProbabilityTrend({ score, prev }: { score: number; prev?: number | null }) {
  if (prev == null) return <span className="text-[9px] text-[#9A7E6F]">new</span>
  const diff = score - prev
  if (diff === 0) return <span className="text-[10px] font-bold text-[#9A7E6F]">— flat</span>
  if (diff > 0) return <span className="text-[10px] font-bold text-[#16A34A]">▲ +{diff}</span>
  return <span className="text-[10px] font-bold text-[#D62F3D]">▼ {diff}</span>
}

// Each component has a different natural range (momentum -10..30, recency
// -30..30, completeness/objection 0..18) -- normalized to a 0-100% bar so
// they're visually comparable, with the real point value labeled alongside.
function WinProbabilityBreakdown({ customer }: { customer: Customer }) {
  const rows: { label: string; value: number; min: number; max: number; hint: string }[] = [
    { label: 'Stage momentum', value: customer.win_probability_momentum ?? 0, min: -10, max: 30, hint: 'Faster than typical pace for this stage = positive' },
    { label: 'Contact recency', value: customer.win_probability_recency ?? 0, min: -30, max: 30, hint: 'Decays the longer since last contact' },
    { label: 'Profile completeness', value: customer.win_probability_completeness ?? 0, min: 0, max: 18, hint: 'Goal + protein + dietary preference filled in' },
    { label: 'Objection logged', value: customer.win_probability_objection ?? 0, min: 0, max: 18, hint: customer.biggest_hurdle || 'No objection logged yet' },
  ]
  return (
    <div className="space-y-2 mt-1">
      {rows.map((r) => {
        const pct = clampPct(((r.value - r.min) / (r.max - r.min)) * 100)
        const positive = r.value >= 0
        return (
          <div key={r.label}>
            <div className="flex items-center justify-between text-[10px] mb-0.5">
              <span className="font-bold text-[#4B2B1D]">{r.label}</span>
              <span className={`font-bold ${positive ? 'text-[#16A34A]' : 'text-[#D62F3D]'}`}>{r.value > 0 ? `+${r.value}` : r.value}</span>
            </div>
            <div className="h-1.5 rounded-full bg-[#F0EAE0] overflow-hidden">
              <div className={`h-1.5 rounded-full ${positive ? 'bg-[#16A34A]' : 'bg-[#D62F3D]'}`} style={{ width: `${pct}%` }} />
            </div>
            <p className="text-[9px] text-[#9A7E6F] mt-0.5 truncate">{r.hint}</p>
          </div>
        )
      })}
    </div>
  )
}
function clampPct(n: number) {
  return Math.max(4, Math.min(100, n))
}

// The one thing used everywhere conversion_probability used to be a flat
// number: a ring + trend arrow, click to expand the real breakdown.
function WinProbabilityBadge({ customer, size = 44, compact = false }: { customer: Customer; size?: number; compact?: boolean }) {
  const [open, setOpen] = useState(false)
  const score = Math.round(customer.conversion_probability || 0)
  return (
    <div onClick={(e) => e.stopPropagation()} className={compact ? 'w-full' : undefined}>
      <button onClick={() => setOpen((v) => !v)} className="flex items-center gap-2 group">
        <WinProbabilityRing score={score} size={size} />
        {!compact && (
          <div className="text-left">
            <p className="text-[10px] font-bold text-[#755B4C] group-hover:text-[#2E527F]">Win Probability</p>
            <WinProbabilityTrend score={score} prev={customer.conversion_probability_prev} />
          </div>
        )}
        {compact && <WinProbabilityTrend score={score} prev={customer.conversion_probability_prev} />}
        <ChevronDown className={`h-3.5 w-3.5 text-[#9A7E6F] transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className={`mt-2 rounded-lg bg-[#FBF7F0] border border-[#E4D8C9] p-3 ${compact ? 'w-full' : 'w-64'}`}>
          <WinProbabilityBreakdown customer={customer} />
        </div>
      )}
    </div>
  )
}

type CustomerAddress = {
  id: number
  customer_id: number
  label: string | null
  address: string
  apt_gate_code: string | null
  is_primary: boolean
  created_at: string
}

// Full CRUD for a customer's delivery addresses -- add/edit/delete/set
// primary. The primary one is always mirrored back onto customer.address/
// apt_gate_code by the backend (see adminCustomers.js), so onPrimaryChanged
// updates the list/board rows immediately without a full refetch.
function CustomerAddressManager({
  customer,
  apiUrl,
  token,
  onPrimaryChanged,
}: {
  customer: Customer
  apiUrl: string
  token: string | null
  onPrimaryChanged: (patch: Partial<Customer>) => void
}) {
  const [addresses, setAddresses] = useState<CustomerAddress[]>([])
  const [loading, setLoading] = useState(true)
  const [showAddForm, setShowAddForm] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [form, setForm] = useState({ label: '', address: '', apt_gate_code: '', is_primary: false })
  const [saving, setSaving] = useState(false)

  const authHeaders = { headers: { Authorization: `Bearer ${token}` } }

  const fetchAddresses = async () => {
    try {
      const res = await axios.get(`${apiUrl}/api/admin/customers/${customer.id}/addresses`, authHeaders)
      setAddresses(res.data.data || [])
    } catch (error) {
      console.error('Error fetching addresses:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchAddresses()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customer.id])

  const applyPrimaryPatch = (list: CustomerAddress[]) => {
    const primary = list.find((a) => a.is_primary)
    onPrimaryChanged({ address: primary?.address, apt_gate_code: primary?.apt_gate_code || undefined, address_count: list.length })
  }

  const resetForm = () => {
    setForm({ label: '', address: '', apt_gate_code: '', is_primary: false })
    setShowAddForm(false)
    setEditingId(null)
  }

  const startEdit = (a: CustomerAddress) => {
    setEditingId(a.id)
    setShowAddForm(false)
    setForm({ label: a.label || '', address: a.address, apt_gate_code: a.apt_gate_code || '', is_primary: a.is_primary })
  }

  const saveNew = async () => {
    if (!form.address.trim()) return
    setSaving(true)
    try {
      await axios.post(
        `${apiUrl}/api/admin/customers/${customer.id}/addresses`,
        { label: form.label.trim() || null, address: form.address.trim(), apt_gate_code: form.apt_gate_code.trim() || null, is_primary: form.is_primary },
        authHeaders
      )
      const res = await axios.get(`${apiUrl}/api/admin/customers/${customer.id}/addresses`, authHeaders)
      setAddresses(res.data.data || [])
      applyPrimaryPatch(res.data.data || [])
      resetForm()
    } catch (error) {
      console.error('Error adding address:', error)
    } finally {
      setSaving(false)
    }
  }

  const saveEdit = async (id: number) => {
    if (!form.address.trim()) return
    setSaving(true)
    try {
      await axios.put(
        `${apiUrl}/api/admin/customers/${customer.id}/addresses/${id}`,
        { label: form.label.trim() || null, address: form.address.trim(), apt_gate_code: form.apt_gate_code.trim() || null, is_primary: form.is_primary },
        authHeaders
      )
      const res = await axios.get(`${apiUrl}/api/admin/customers/${customer.id}/addresses`, authHeaders)
      setAddresses(res.data.data || [])
      applyPrimaryPatch(res.data.data || [])
      resetForm()
    } catch (error) {
      console.error('Error updating address:', error)
    } finally {
      setSaving(false)
    }
  }

  const setPrimary = async (id: number) => {
    try {
      await axios.put(`${apiUrl}/api/admin/customers/${customer.id}/addresses/${id}`, { is_primary: true }, authHeaders)
      const res = await axios.get(`${apiUrl}/api/admin/customers/${customer.id}/addresses`, authHeaders)
      setAddresses(res.data.data || [])
      applyPrimaryPatch(res.data.data || [])
    } catch (error) {
      console.error('Error setting primary address:', error)
    }
  }

  const deleteAddress = async (id: number) => {
    if (!confirm('Remove this address?')) return
    try {
      await axios.delete(`${apiUrl}/api/admin/customers/${customer.id}/addresses/${id}`, authHeaders)
      const res = await axios.get(`${apiUrl}/api/admin/customers/${customer.id}/addresses`, authHeaders)
      setAddresses(res.data.data || [])
      applyPrimaryPatch(res.data.data || [])
    } catch (error) {
      console.error('Error deleting address:', error)
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-extrabold text-[#4B2B1D]">🏠 Delivery Addresses</h3>
        {!showAddForm && (
          <button
            onClick={() => { setShowAddForm(true); setEditingId(null); setForm({ label: '', address: '', apt_gate_code: '', is_primary: addresses.length === 0 }) }}
            className="flex items-center gap-1.5 rounded-lg bg-[#2E527F] text-white px-3 py-1.5 text-xs font-bold hover:bg-[#24466E] transition"
          >
            <Plus className="h-3.5 w-3.5" /> Add Address
          </button>
        )}
      </div>

      {loading ? (
        <p className="text-xs text-[#755B4C]">Loading addresses...</p>
      ) : (
        <div className="space-y-2">
          {addresses.length === 0 && !showAddForm && (
            <p className="text-xs text-[#755B4C] italic">No delivery address on file yet.</p>
          )}
          {addresses.map((a) =>
            editingId === a.id ? (
              <div key={a.id} className="rounded-lg border border-[#3E6594] bg-white p-3 space-y-2">
                <input
                  type="text"
                  value={form.label}
                  onChange={(e) => setForm((p) => ({ ...p, label: e.target.value }))}
                  placeholder="Label (e.g. Home, Office)"
                  className="w-full rounded-lg border border-[#B9A88F] bg-[#FBF7F0] px-2.5 py-1.5 text-sm text-[#4B2B1D] outline-none focus:border-[#3E6594]"
                />
                <input
                  type="text"
                  value={form.address}
                  onChange={(e) => setForm((p) => ({ ...p, address: e.target.value }))}
                  placeholder="Street address"
                  className="w-full rounded-lg border border-[#B9A88F] bg-[#FBF7F0] px-2.5 py-1.5 text-sm text-[#4B2B1D] outline-none focus:border-[#3E6594]"
                />
                <input
                  type="text"
                  value={form.apt_gate_code}
                  onChange={(e) => setForm((p) => ({ ...p, apt_gate_code: e.target.value }))}
                  placeholder="Apt / Gate code (optional)"
                  className="w-full rounded-lg border border-[#B9A88F] bg-[#FBF7F0] px-2.5 py-1.5 text-sm text-[#4B2B1D] outline-none focus:border-[#3E6594]"
                />
                <label className="flex items-center gap-2 text-xs text-[#4B2B1D]">
                  <input type="checkbox" checked={form.is_primary} onChange={(e) => setForm((p) => ({ ...p, is_primary: e.target.checked }))} />
                  Primary delivery address
                </label>
                <div className="flex justify-end gap-2">
                  <button onClick={resetForm} className="rounded-lg px-3 py-1.5 text-xs font-bold text-[#755B4C] hover:bg-[#F5F0E8] transition">Cancel</button>
                  <button
                    onClick={() => saveEdit(a.id)}
                    disabled={saving || !form.address.trim()}
                    className="rounded-lg bg-[#2E527F] text-white px-3 py-1.5 text-xs font-bold hover:bg-[#24466E] disabled:opacity-40 transition"
                  >
                    {saving ? 'Saving...' : 'Save'}
                  </button>
                </div>
              </div>
            ) : (
              <div key={a.id} className="rounded-lg border border-[#E4D8C9] bg-white p-3 flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {a.label && <span className="text-xs font-bold text-[#4B2B1D]">{a.label}</span>}
                    {a.is_primary && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-[#EAF5EC] text-[#16834A]">
                        <Star className="h-2.5 w-2.5 fill-current" /> Primary
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-[#4B2B1D] mt-0.5">{a.address}</p>
                  {a.apt_gate_code && <p className="text-xs text-[#755B4C] mt-0.5">{a.apt_gate_code}</p>}
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  {!a.is_primary && (
                    <button
                      onClick={() => setPrimary(a.id)}
                      title="Set as primary"
                      className="p-1.5 rounded-lg text-[#755B4C] hover:bg-[#F5F0E8] hover:text-[#2E527F] transition"
                    >
                      <Star className="h-3.5 w-3.5" />
                    </button>
                  )}
                  <button onClick={() => startEdit(a)} title="Edit" className="p-1.5 rounded-lg text-[#2E527F] hover:bg-[#EDF2F7] transition">
                    <Edit className="h-3.5 w-3.5" />
                  </button>
                  <button onClick={() => deleteAddress(a.id)} title="Delete" className="p-1.5 rounded-lg text-[#D62F3D] hover:bg-[#FDEBEC] transition">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            )
          )}

          {showAddForm && (
            <div className="rounded-lg border border-[#3E6594] bg-white p-3 space-y-2">
              <input
                type="text"
                value={form.label}
                onChange={(e) => setForm((p) => ({ ...p, label: e.target.value }))}
                placeholder="Label (e.g. Home, Office)"
                className="w-full rounded-lg border border-[#B9A88F] bg-[#FBF7F0] px-2.5 py-1.5 text-sm text-[#4B2B1D] outline-none focus:border-[#3E6594]"
              />
              <input
                type="text"
                value={form.address}
                onChange={(e) => setForm((p) => ({ ...p, address: e.target.value }))}
                placeholder="Street address"
                className="w-full rounded-lg border border-[#B9A88F] bg-[#FBF7F0] px-2.5 py-1.5 text-sm text-[#4B2B1D] outline-none focus:border-[#3E6594]"
              />
              <input
                type="text"
                value={form.apt_gate_code}
                onChange={(e) => setForm((p) => ({ ...p, apt_gate_code: e.target.value }))}
                placeholder="Apt / Gate code (optional)"
                className="w-full rounded-lg border border-[#B9A88F] bg-[#FBF7F0] px-2.5 py-1.5 text-sm text-[#4B2B1D] outline-none focus:border-[#3E6594]"
              />
              <label className="flex items-center gap-2 text-xs text-[#4B2B1D]">
                <input
                  type="checkbox"
                  checked={form.is_primary}
                  disabled={addresses.length === 0}
                  onChange={(e) => setForm((p) => ({ ...p, is_primary: e.target.checked }))}
                />
                Primary delivery address{addresses.length === 0 ? ' (first address is always primary)' : ''}
              </label>
              <div className="flex justify-end gap-2">
                <button onClick={resetForm} className="rounded-lg px-3 py-1.5 text-xs font-bold text-[#755B4C] hover:bg-[#F5F0E8] transition">Cancel</button>
                <button
                  onClick={saveNew}
                  disabled={saving || !form.address.trim()}
                  className="rounded-lg bg-[#2E527F] text-white px-3 py-1.5 text-xs font-bold hover:bg-[#24466E] disabled:opacity-40 transition"
                >
                  {saving ? 'Saving...' : 'Add Address'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// One page, sections you can fold away instead of five separate tab clicks.
// Defaults mirror what's actually useful at a glance vs. what you'd dig into
// on purpose: Insights open, the rest collapsed.
function CollapsibleSection({
  title,
  subtitle,
  icon,
  badge,
  defaultOpen,
  children,
}: {
  title: string
  subtitle?: string
  icon: string
  badge?: string
  defaultOpen?: boolean
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(!!defaultOpen)
  return (
    <div className="rounded-2xl border border-[#2E527F] bg-[rgba(251,247,240,0.9)] overflow-hidden">
      <button onClick={() => setOpen((v) => !v)} className="w-full flex items-center justify-between gap-3 p-5 text-left">
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-xl flex-shrink-0">{icon}</span>
          <div className="min-w-0">
            <p className="font-extrabold text-[#4B2B1D] flex items-center gap-2">
              {title}
              {badge && <span className="text-[10px] font-bold rounded-full bg-[#EDF2F7] text-[#2E527F] px-2 py-0.5">{badge}</span>}
            </p>
            {subtitle && <p className="text-xs text-[#755B4C] mt-0.5">{subtitle}</p>}
          </div>
        </div>
        <ChevronDown className={`h-5 w-5 text-[#755B4C] flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && <div className="px-5 pb-5 border-t border-[#E4D8C9] pt-5">{children}</div>}
    </div>
  )
}

export default function CustomersPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<Tab>('pipeline')
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null)
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null)
  const [showAddCustomer, setShowAddCustomer] = useState(false)
  const [formData, setFormData] = useState<Partial<Customer>>({
    name: '', email: '', phone: '', address: '', apt_gate_code: '', payment_mode: '',
    household_size: undefined, occupation: '', primary_goal: '', biggest_hurdle: '',
    protein_preference: '', dietary_preference: '', dietary_restrictions: '', foods_to_avoid: '', notes: '',
    sales_pipeline_stage: 'prospect', conversion_probability: 0, days_since_last_contact: 0, engagement_score: 0,
  })
  const [showCustomerDetail, setShowCustomerDetail] = useState(false)
  const [recentActivity, setRecentActivity] = useState<any[]>([])
  const [templates, setTemplates] = useState<any[]>([])
  const [selectedIds, setSelectedIds] = useState<number[]>([])

  // ---- new: lead metadata (localStorage-backed), view mode, filters ----
  const [leadMeta, setLeadMeta] = useState<Record<number, LeadMeta>>(() => readLeadMeta())
  const [pipelineView, setPipelineView] = useState<'list' | 'board'>('board')
  const [sourceFilter, setSourceFilter] = useState<LeadSource | 'all'>('all')
  const [staleOnly, setStaleOnly] = useState(false)
  const [customerCategory, setCustomerCategory] = useState<CustomerCategory>('all')
  const [lossReasonFilter, setLossReasonFilter] = useState<LossReason | 'all'>('all')

  // ---- new: managed Lead Sources (named, reusable, with optional cost) ----
  const [managedSources, setManagedSources] = useState<ManagedSource[]>(() => readManagedSources())
  const [showNewSource, setShowNewSource] = useState(false)
  const [newSource, setNewSource] = useState({ name: '', category: 'ambassador' as LeadSource, monthly_cost: '' })
  const [editingSourceId, setEditingSourceId] = useState<string | null>(null)

  useEffect(() => {
    writeManagedSources(managedSources)
  }, [managedSources])

  const createManagedSource = () => {
    if (!newSource.name.trim()) return
    const source: ManagedSource = {
      id: `src_${Date.now()}`,
      name: newSource.name.trim(),
      category: newSource.category,
      monthly_cost_cents: newSource.monthly_cost ? Math.round(parseFloat(newSource.monthly_cost) * 100) : undefined,
      created_at: new Date().toISOString(),
    }
    setManagedSources((prev) => [...prev, source])
    setNewSource({ name: '', category: 'ambassador', monthly_cost: '' })
    setShowNewSource(false)
    return source
  }

  const deleteManagedSource = (id: string) => {
    if (!confirm('Delete this source? Leads already tagged with it keep their category, but lose the specific source name.')) return
    setManagedSources((prev) => prev.filter((s) => s.id !== id))
    const next = { ...leadMeta }
    for (const cid of Object.keys(next)) {
      if (next[Number(cid)]?.source_id === id) {
        next[Number(cid)] = { ...next[Number(cid)], source_id: undefined }
      }
    }
    setLeadMeta(next)
    writeLeadMeta(next)
  }

  const assignSourceToCustomer = (customerId: number, sourceId: string) => {
    const source = managedSources.find((s) => s.id === sourceId)
    if (!source) return
    const next = { ...leadMeta, [customerId]: { ...leadMeta[customerId], source_id: sourceId, lead_source: source.category } }
    setLeadMeta(next)
    writeLeadMeta(next)
  }

  const assignLossReason = (customerId: number, reason: LossReason | '') => {
    const next = { ...leadMeta, [customerId]: { ...leadMeta[customerId], loss_reason: reason || undefined } }
    setLeadMeta(next)
    writeLeadMeta(next)
  }

  // ---- new: Promo Codes -- the Growth Plan's real lead-capture mechanism.
  // A code optionally rolls up to a Source, so redemptions count toward that
  // source's leaderboard numbers automatically. ----
  const [promoCodes, setPromoCodes] = useState<PromoCode[]>(() => readPromoCodes())
  const [showNewPromo, setShowNewPromo] = useState(false)
  const [newPromo, setNewPromo] = useState({ code: '', source_id: '', description: '' })

  useEffect(() => {
    writePromoCodes(promoCodes)
  }, [promoCodes])

  const createPromoCode = () => {
    if (!newPromo.code.trim()) return
    const promo: PromoCode = {
      id: `promo_${Date.now()}`,
      code: newPromo.code.trim().toUpperCase(),
      source_id: newPromo.source_id || undefined,
      description: newPromo.description.trim() || undefined,
      created_at: new Date().toISOString(),
    }
    setPromoCodes((prev) => [...prev, promo])
    setNewPromo({ code: '', source_id: '', description: '' })
    setShowNewPromo(false)
  }

  const deletePromoCode = (id: string) => {
    if (!confirm('Delete this promo code? Customers already tagged with it keep their record, but lose the code link.')) return
    setPromoCodes((prev) => prev.filter((p) => p.id !== id))
    const next = { ...leadMeta }
    for (const cid of Object.keys(next)) {
      if (next[Number(cid)]?.promo_code_id === id) next[Number(cid)] = { ...next[Number(cid)], promo_code_id: undefined }
    }
    setLeadMeta(next)
    writeLeadMeta(next)
  }

  // ---- new: Social Inbox -- threaded per-handle conversation log (no
  // Instagram API hookup, so this is the by-hand version). Logging against
  // an existing handle appends to their thread instead of creating a
  // duplicate contact, so context accumulates across every visit to this
  // inbox rather than resetting each time. ----
  const [socialContacts, setSocialContacts] = useState<SocialContact[]>(() => readSocialContacts())
  const [newSocialType, setNewSocialType] = useState<'dm' | 'comment'>('dm')
  const [newSocialHandle, setNewSocialHandle] = useState('')
  const [newSocialNote, setNewSocialNote] = useState('')
  const [expandedContactId, setExpandedContactId] = useState<string | null>(null)
  const [threadReplyText, setThreadReplyText] = useState('')
  const [threadReplyType, setThreadReplyType] = useState<'dm' | 'comment'>('dm')
  const [convertingContactId, setConvertingContactId] = useState<string | null>(null)
  const [importingExport, setImportingExport] = useState(false)
  const [importSummary, setImportSummary] = useState<string | null>(null)
  const [socialStatusFilter, setSocialStatusFilter] = useState<'all' | 'new' | 'converted' | 'ignored'>('new')
  const [socialSearch, setSocialSearch] = useState('')

  useEffect(() => {
    writeSocialContacts(socialContacts)
  }, [socialContacts])

  // Merges every message_1.json in a selected Instagram export folder into
  // the existing threads -- same handle gets appended to (deduped by
  // timestamp+text so re-importing the same export is harmless), new handle
  // becomes a new contact.
  const handleImportInstagramExport = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return
    setImportingExport(true)
    setImportSummary(null)
    try {
      const files = Array.from(fileList).filter((f) => f.name === 'message_1.json')
      const parsed = await Promise.all(files.map(parseInstagramMessageFile))
      const valid = parsed.filter((r): r is { handle: string; messages: SocialMessage[] } => r != null)

      let newContacts = 0
      let updatedContacts = 0
      let newMessages = 0

      setSocialContacts((prev) => {
        const next = [...prev]
        for (const { handle, messages } of valid) {
          const idx = next.findIndex((c) => c.handle.toLowerCase() === handle.toLowerCase())
          if (idx === -1) {
            next.push({ id: `soc_import_${handle}_${Date.now()}`, handle, status: 'new', messages, created_at: messages[0].created_at })
            newContacts++
            newMessages += messages.length
          } else {
            const existing = next[idx]
            const seen = new Set(existing.messages.map((m) => `${m.created_at}|${m.text}`))
            const toAdd = messages.filter((m) => !seen.has(`${m.created_at}|${m.text}`))
            if (toAdd.length > 0) {
              const merged = [...existing.messages, ...toAdd].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
              next[idx] = { ...existing, messages: merged }
              updatedContacts++
              newMessages += toAdd.length
            }
          }
        }
        return next
      })

      setImportSummary(
        newMessages === 0
          ? 'Nothing new -- looks like this export was already imported.'
          : `Imported ${newMessages} message${newMessages === 1 ? '' : 's'} across ${newContacts} new contact${newContacts === 1 ? '' : 's'}${updatedContacts ? ` (${updatedContacts} existing thread${updatedContacts === 1 ? '' : 's'} updated)` : ''}.`
      )
    } finally {
      setImportingExport(false)
    }
  }

  // New handle -> new contact. Existing handle (case-insensitive) -> append
  // to that thread instead, since it's the same relationship continuing.
  const logSocialEvent = () => {
    const handle = newSocialHandle.trim().replace(/^@/, '')
    if (!handle) return
    const message: SocialMessage = { id: `msg_${Date.now()}`, type: newSocialType, text: newSocialNote.trim(), created_at: new Date().toISOString() }
    setSocialContacts((prev) => {
      const existing = prev.find((c) => c.handle.toLowerCase() === handle.toLowerCase())
      if (existing) {
        return prev.map((c) => (c.id === existing.id ? { ...c, messages: [...c.messages, message] } : c))
      }
      const contact: SocialContact = { id: `soc_${Date.now()}`, handle, status: 'new', messages: [message], created_at: new Date().toISOString() }
      return [contact, ...prev]
    })
    setNewSocialHandle('')
    setNewSocialNote('')
  }

  const addThreadMessage = (contactId: string) => {
    if (!threadReplyText.trim()) return
    const message: SocialMessage = { id: `msg_${Date.now()}`, type: threadReplyType, text: threadReplyText.trim(), created_at: new Date().toISOString() }
    setSocialContacts((prev) => prev.map((c) => (c.id === contactId ? { ...c, messages: [...c.messages, message] } : c)))
    setThreadReplyText('')
  }

  const ignoreSocialContact = (id: string) => {
    setSocialContacts((prev) => prev.map((c) => (c.id === id ? { ...c, status: 'ignored' } : c)))
  }

  // Converting carries the whole thread over as the new customer's notes --
  // the context that built up here shouldn't evaporate the moment they
  // become a real lead.
  const startConvertSocialContact = (contact: SocialContact) => {
    setConvertingContactId(contact.id)
    const socialSource = managedSources.find((s) => s.category === 'social_funnel')
    const transcript = contact.messages
      .map((m) => `[${new Date(m.created_at).toLocaleDateString()}] ${m.type === 'dm' ? 'DM' : 'Comment'}: ${m.text || '(no text logged)'}`)
      .join('\n')
    setQuickAdd({
      name: `@${contact.handle}`,
      phone: '',
      email: '',
      lead_source: 'social_funnel',
      source_id: socialSource?.id || '',
      account_type: 'individual',
      company_name: '',
    })
    setQuickAddConversionNotes(transcript)
    setShowQuickAdd(true)
  }

  // ---- new: saved Lists -- real, same customer-lists endpoints the old
  // BulkActionBar/ListsTab used. Every list shows up as its own pill next to
  // Lost Prospects; selecting one filters the Customers tab to just its
  // members instead of needing a separate Lists tab to visit. ----
  const [lists, setLists] = useState<{ id: number; name: string; member_count: string }[]>([])
  const [selectedListId, setSelectedListId] = useState<number | null>(null)
  const [listMembersCache, setListMembersCache] = useState<Record<number, number[]>>({})
  const [showListActions, setShowListActions] = useState(false)
  const [newListName, setNewListName] = useState('')
  const [listActionBusy, setListActionBusy] = useState(false)
  const [listActionMessage, setListActionMessage] = useState<string | null>(null)

  const fetchLists = async () => {
    try {
      const res = await axios.get(`${apiUrl}/api/admin/customer-lists`, { headers: { Authorization: `Bearer ${token}` } })
      setLists(res.data.data || [])
    } catch (error) {
      console.error('Error fetching lists:', error)
    }
  }
  useEffect(() => {
    fetchLists()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const selectListFilter = async (listId: number) => {
    setCustomerCategory('all')
    setSelectedListId(listId)
    if (listMembersCache[listId]) return
    try {
      const res = await axios.get(`${apiUrl}/api/admin/customer-lists/${listId}/members`, { headers: { Authorization: `Bearer ${token}` } })
      const ids = (res.data.data || []).map((m: any) => m.id)
      setListMembersCache((prev) => ({ ...prev, [listId]: ids }))
    } catch (error) {
      console.error('Error fetching list members:', error)
    }
  }

  const addSelectionToList = async (listId: number, ids: number[]) => {
    setListActionBusy(true)
    try {
      await axios.post(`${apiUrl}/api/admin/customer-lists/${listId}/members`, { customer_ids: ids }, { headers: { Authorization: `Bearer ${token}` } })
      setListActionMessage(`Added ${ids.length} to that list.`)
      setListMembersCache((prev) => {
        const next = { ...prev }
        delete next[listId] // stale now, re-fetch next time it's opened
        return next
      })
      await fetchLists()
      setSelectedIds([])
      setShowListActions(false)
    } catch (error) {
      console.error('Error adding to list:', error)
      setListActionMessage('Failed to add -- check the console.')
    } finally {
      setListActionBusy(false)
    }
  }

  const createListFromSelection = async (ids: number[]) => {
    if (!newListName.trim()) return
    setListActionBusy(true)
    try {
      await axios.post(`${apiUrl}/api/admin/customer-lists`, { name: newListName.trim(), customer_ids: ids }, { headers: { Authorization: `Bearer ${token}` } })
      setListActionMessage(`Created "${newListName.trim()}" with ${ids.length} customer(s).`)
      setNewListName('')
      await fetchLists()
      setSelectedIds([])
      setShowListActions(false)
    } catch (error) {
      console.error('Error creating list:', error)
      setListActionMessage('Failed to create -- check the console.')
    } finally {
      setListActionBusy(false)
    }
  }

  // ---- new: Pipeline is a working set you build, not everyone by default.
  // Session-only on purpose (no localStorage) -- it's meant to reset. ----
  const [workingSet, setWorkingSet] = useState<number[]>([])
  const [followUps, setFollowUps] = useState<FollowUpEntry[]>(() => readFollowUps())

  useEffect(() => {
    writeFollowUps(followUps)
  }, [followUps])

  // ---- new: Task View -- one list under the board, merging real
  // `crm-tasks` (fetched, completed via the real endpoint) with the local
  // follow-up entries above (created here since there's no POST endpoint on
  // crm-tasks yet). One add row that stays open, not a modal. ----
  type RealTask = {
    id: number
    customer_id: number | null
    customer_name: string | null
    title: string
    description: string | null
    completed_at: string | null
    system_source: 'stale_flag' | 'win_probability_drop' | 'automation' | null
    source_automation_rule_id: number | null
  }
  const [realTasks, setRealTasks] = useState<RealTask[]>([])
  const [newTaskText, setNewTaskText] = useState('')
  const [savingTask, setSavingTask] = useState(false)
  const [taskFilter, setTaskFilter] = useState<'all' | 'auto' | 'manual'>('all')

  const fetchRealTasks = async () => {
    try {
      const res = await axios.get(`${apiUrl}/api/admin/crm-tasks`, { headers: { Authorization: `Bearer ${token}` }, params: { status: 'open' } })
      setRealTasks(res.data.data || [])
    } catch (error) {
      console.error('Error fetching tasks:', error)
    }
  }
  useEffect(() => {
    fetchRealTasks()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const completeRealTask = async (id: number) => {
    setRealTasks((prev) => prev.filter((t) => t.id !== id))
    try {
      await axios.put(`${apiUrl}/api/admin/crm-tasks/${id}/complete`, {}, { headers: { Authorization: `Bearer ${token}` } })
    } catch (error) {
      console.error('Error completing task:', error)
      fetchRealTasks()
    }
  }

  // Real now -- POST /api/admin/crm-tasks was the missing piece that used to
  // force manually-added tasks to live only in local followUps state (gone
  // on refresh). Now they're real rows, same as the auto-flagged ones.
  const addQuickTask = async () => {
    const text = newTaskText.trim()
    if (!text || savingTask) return
    setSavingTask(true)
    try {
      const res = await axios.post(
        `${apiUrl}/api/admin/crm-tasks`,
        { title: text },
        { headers: { Authorization: `Bearer ${token}` } }
      )
      setRealTasks((prev) => [res.data.data, ...prev])
      setNewTaskText('')
    } catch (error) {
      console.error('Error creating task:', error)
    } finally {
      setSavingTask(false)
    }
  }

  const taskSourceTag = (t: RealTask): { label: string; bg: string; text: string } => {
    if (t.system_source === 'stale_flag') return { label: 'Auto · Stale', bg: '#FFF0E6', text: '#C97C34' }
    if (t.system_source === 'win_probability_drop') return { label: 'Auto · WP drop', bg: '#FFE6EC', text: '#C21E3C' }
    if (t.system_source === 'automation' || t.source_automation_rule_id) return { label: 'Auto · Sequence', bg: '#E3F3FF', text: '#1E6BA8' }
    return { label: 'Manual', bg: '#F5F0E8', text: '#755B4C' }
  }

  const filteredRealTasks = realTasks.filter((t) => {
    if (taskFilter === 'all') return true
    const isAuto = !!t.system_source || !!t.source_automation_rule_id
    return taskFilter === 'auto' ? isAuto : !isAuto
  })

  // ---- new: Send & Automate -- one action instead of three separate
  // sections to browse. Targets whoever's currently ticked, or the whole
  // Pipeline working set if nothing's ticked. Enrolling is real (same
  // endpoint the old bulk-action bar used); sending a template stays
  // per-customer since it needs one specific phone/email, same as before. ----
  const [automationRules, setAutomationRules] = useState<{ id: number; name: string }[]>([])
  const [selectedRuleId, setSelectedRuleId] = useState<number | ''>('')
  const [enrolling, setEnrolling] = useState(false)
  const [enrollMessage, setEnrollMessage] = useState<string | null>(null)

  useEffect(() => {
    axios
      .get(`${apiUrl}/api/admin/automation-rules`, { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => setAutomationRules(res.data.data || []))
      .catch((error) => console.error('Error fetching automation rules:', error))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const sendTargetIds = selectedIds.length > 0 ? selectedIds : workingSet

  const enrollTargets = async () => {
    if (!selectedRuleId || sendTargetIds.length === 0) return
    setEnrolling(true)
    setEnrollMessage(null)
    try {
      const res = await axios.post(
        `${apiUrl}/api/admin/automation-rules/${selectedRuleId}/enroll`,
        { customer_ids: sendTargetIds },
        { headers: { Authorization: `Bearer ${token}` } }
      )
      setEnrollMessage(`Enrolled ${res.data.enrolled ?? sendTargetIds.length} customer(s).`)
      setSelectedIds([])
    } catch (error) {
      console.error('Error enrolling:', error)
      setEnrollMessage('Failed to enroll -- check the console.')
    } finally {
      setEnrolling(false)
    }
  }

  // ---- new: Sales Assets library -- a real catalog + tracking layer over
  // wherever the files actually live (a Google Drive share link by default,
  // per the build spec's open question), not a file store of its own.
  // Categories and asset_type are fixed to what the sales_assets CHECK
  // constraint allows -- see migrations/create_pipeline_intelligence.sql. ----
  type SalesAsset = {
    id: number
    title: string
    category: 'pricing_offers' | 'menus_samples' | 'social_proof' | 'partnerships'
    asset_type: 'pdf' | 'image' | 'video' | 'link'
    source_url: string
    credit: string | null
    created_at: string
    sent_count: string | number
    scan_count: string | number
    opened_count: string | number
  }
  const [salesAssets, setSalesAssets] = useState<SalesAsset[]>([])
  const [assetCategoryFilter, setAssetCategoryFilter] = useState<SalesAsset['category'] | 'all'>('all')
  const [showAddAsset, setShowAddAsset] = useState(false)
  const [newAsset, setNewAsset] = useState({ title: '', category: 'pricing_offers' as SalesAsset['category'], asset_type: 'link' as SalesAsset['asset_type'], source_url: '', credit: '' })
  const [savingAsset, setSavingAsset] = useState(false)
  const [sharingAssetId, setSharingAssetId] = useState<number | null>(null)
  const [copiedAssetId, setCopiedAssetId] = useState<number | null>(null)

  const fetchSalesAssets = async () => {
    try {
      const res = await axios.get(`${apiUrl}/api/admin/sales-assets`, { headers: { Authorization: `Bearer ${token}` } })
      setSalesAssets(res.data.data || [])
    } catch (error) {
      console.error('Error fetching sales assets:', error)
    }
  }
  useEffect(() => {
    fetchSalesAssets()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const addSalesAsset = async () => {
    if (!newAsset.title.trim() || !newAsset.source_url.trim() || savingAsset) return
    setSavingAsset(true)
    try {
      const res = await axios.post(
        `${apiUrl}/api/admin/sales-assets`,
        { ...newAsset, title: newAsset.title.trim(), source_url: newAsset.source_url.trim(), credit: newAsset.credit.trim() || null },
        { headers: { Authorization: `Bearer ${token}` } }
      )
      setSalesAssets((prev) => [{ ...res.data.data, sent_count: 0, scan_count: 0, opened_count: 0 }, ...prev])
      setNewAsset({ title: '', category: 'pricing_offers', asset_type: 'link', source_url: '', credit: '' })
      setShowAddAsset(false)
    } catch (error) {
      console.error('Error creating sales asset:', error)
    } finally {
      setSavingAsset(false)
    }
  }

  // Mints a fresh trackable link every click rather than reusing one -- each
  // share row is its own open-event bucket, which is what lets a future pass
  // tie an open back to the specific customer/context it was sent in.
  const shareSalesAsset = async (asset: SalesAsset) => {
    setSharingAssetId(asset.id)
    try {
      const res = await axios.post(
        `${apiUrl}/api/admin/sales-assets/${asset.id}/share`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      )
      await navigator.clipboard.writeText(res.data.share_url)
      setCopiedAssetId(asset.id)
      setTimeout(() => setCopiedAssetId((id) => (id === asset.id ? null : id)), 2000)
      fetchSalesAssets()
    } catch (error) {
      console.error('Error sharing sales asset:', error)
    } finally {
      setSharingAssetId(null)
    }
  }

  const filteredSalesAssets = assetCategoryFilter === 'all' ? salesAssets : salesAssets.filter((a) => a.category === assetCategoryFilter)

  // ---- new: quick add lead modal ----
  const [showQuickAdd, setShowQuickAdd] = useState(false)
  const [quickAdd, setQuickAdd] = useState({
    name: '', phone: '', email: '', lead_source: 'organic' as LeadSource, source_id: '',
    account_type: 'individual' as AccountType, company_name: '',
  })
  const [quickAddError, setQuickAddError] = useState<string | null>(null)
  const [duplicateMatch, setDuplicateMatch] = useState<Customer | null>(null)
  const [savingQuickAdd, setSavingQuickAdd] = useState(false)
  // Set when converting from the Social Inbox -- the full DM/comment
  // transcript, carried into the real customer's notes on creation so the
  // conversation history isn't stranded in the inbox once someone converts.
  const [quickAddConversionNotes, setQuickAddConversionNotes] = useState('')

  const toggleSelected = (id: number) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  const token = localStorage.getItem('token')
  const apiUrl = import.meta.env.VITE_API_BASE_URL

  useEffect(() => {
    fetchCustomers()
  }, [])

  useEffect(() => {
    const openId = searchParams.get('openId')
    if (!openId || customers.length === 0) return
    const match = customers.find((c) => c.id === Number(openId))
    if (match) {
      setSelectedCustomer(match)
      setShowCustomerDetail(true)
    }
    const next = new URLSearchParams(searchParams)
    next.delete('openId')
    setSearchParams(next, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customers])

  // Activities section is a standing section now (not gated behind its own
  // tab click), so this loads once on mount rather than waiting for a tab switch.
  useEffect(() => {
    const fetchActivityData = async () => {
      try {
        const [activityRes, templatesRes] = await Promise.all([
          axios.get(`${apiUrl}/api/admin/activities/recent`, { headers: { Authorization: `Bearer ${token}` } }),
          axios.get(`${apiUrl}/api/admin/communication-templates`, { headers: { Authorization: `Bearer ${token}` } }),
        ])
        setRecentActivity(activityRes.data.data || [])
        setTemplates(templatesRes.data.data || [])
      } catch (error) {
        console.error('Error fetching activity tab data:', error)
      }
    }
    fetchActivityData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const fetchCustomers = async () => {
    try {
      setLoading(true)
      const response = await axios.get(`${apiUrl}/api/admin/customers`, { headers: { Authorization: `Bearer ${token}` } })
      setCustomers(response.data.data || [])
    } catch (error) {
      console.error('Error fetching customers:', error)
    } finally {
      setLoading(false)
    }
  }

  // Merges the real customer record with its (preview-only) lead metadata --
  // every downstream list/board/filter/export reads from this, never from
  // raw `customers`, so the two data sources never have to be reconciled twice.
  const enriched = useMemo(
    () => customers.map((c) => ({ ...c, ...(leadMeta[c.id] || {}) })),
    [customers, leadMeta]
  )

  // A same-phone or same-email match anywhere in the list -- surfaced as a
  // quiet warning icon on the card instead of forcing a cleanup pass, since
  // this codebase has already hit real duplicate-customer bugs before.
  const duplicateIds = useMemo(() => {
    const byPhone = new Map<string, number[]>()
    const byEmail = new Map<string, number[]>()
    for (const c of customers) {
      if (c.phone) byPhone.set(c.phone, [...(byPhone.get(c.phone) || []), c.id])
      if (c.email) byEmail.set(c.email.toLowerCase(), [...(byEmail.get(c.email.toLowerCase()) || []), c.id])
    }
    const ids = new Set<number>()
    for (const list of [...byPhone.values(), ...byEmail.values()]) {
      if (list.length > 1) list.forEach((id) => ids.add(id))
    }
    return ids
  }, [customers])

  // Pipeline Intelligence strip. v1, computed client-side from what
  // GET /customers already returns -- no cohort/history table, so Win Rate
  // and Avg Sales Cycle are both approximations built on stage_entered_at
  // (which only tells you when a customer entered its CURRENT stage):
  //   - Win Rate: of everyone currently sitting in trial or who converted
  //     out of it into active within the last 90 days, what share converted.
  //     Customers who converted more than 90 days ago age out of the
  //     numerator on purpose -- this is a recent-rate, not a lifetime one.
  //   - Avg Sales Cycle: avg(stage_entered_at - created_at) for customers
  //     currently active. Doesn't capture anyone who churned before this
  //     column existed or after leaving active, which is the real limit of
  //     computing this without a full stage-history log.
  const pipelineIntelligence = useMemo(() => {
    const now = Date.now()
    const ninetyDaysMs = 90 * 24 * 60 * 60 * 1000

    const recentlyWon = customers.filter((c) => {
      if (c.sales_pipeline_stage !== 'active' || !c.stage_entered_at) return false
      return now - new Date(c.stage_entered_at).getTime() <= ninetyDaysMs
    })
    const stillInTrial = customers.filter((c) => c.sales_pipeline_stage === 'trial')
    const trialCohort = recentlyWon.length + stillInTrial.length
    const winRate = trialCohort > 0 ? Math.round((recentlyWon.length / trialCohort) * 100) : null

    const activeWithCycle = customers.filter((c) => c.sales_pipeline_stage === 'active' && c.stage_entered_at && c.created_at)
    const avgCycleDays =
      activeWithCycle.length > 0
        ? Math.round(
            activeWithCycle.reduce((sum, c) => {
              const days = (new Date(c.stage_entered_at as string).getTime() - new Date(c.created_at as string).getTime()) / (24 * 60 * 60 * 1000)
              return sum + Math.max(0, days)
            }, 0) / activeWithCycle.length
          )
        : null

    const total = customers.length
    const funnel = STAGE_ORDER.map((stage) => {
      const count = customers.filter((c) => c.sales_pipeline_stage === stage).length
      return { stage, count, pct: total > 0 ? Math.round((count / total) * 100) : 0 }
    })

    return { winRate, avgCycleDays, funnel, trialCohortSize: trialCohort }
  }, [customers])

  const filteredCustomers = useMemo(() => {
    let result = enriched

    if (activeTab === 'pipeline') {
      // The board is a working set you build, not the full customer table --
      // starts empty, only shows who's been ticked in.
      result = result.filter((c) => workingSet.includes(c.id))
      result = [...result].sort((a, b) => (b.conversion_probability || 0) - (a.conversion_probability || 0))
    } else if (activeTab === 'customers' && selectedListId != null) {
      // A saved list, real membership fetched from customer-lists.
      const memberIds = listMembersCache[selectedListId] || []
      result = result.filter((c) => memberIds.includes(c.id))
    } else if (activeTab === 'customers' && customerCategory !== 'all') {
      // The database, optionally narrowed to one category instead of three
      // separate tabs over the same table.
      result = result.filter((c) => (c.sales_pipeline_stage || 'prospect') === customerCategory)
    }

    if (sourceFilter !== 'all') {
      result = result.filter((c) => (c.lead_source || 'organic') === sourceFilter)
    }
    if (staleOnly) {
      result = result.filter((c) => (c.days_since_last_contact || 0) >= 7)
    }
    if (customerCategory === 'churned' && lossReasonFilter !== 'all') {
      result = result.filter((c) => c.loss_reason === lossReasonFilter)
    }

    if (searchTerm) {
      result = result.filter(
        (c) =>
          c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          c.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          c.phone?.includes(searchTerm)
      )
    }

    return result
  }, [enriched, activeTab, searchTerm, sourceFilter, staleOnly, workingSet, customerCategory, selectedListId, listMembersCache, lossReasonFilter])

  const handleDeleteCustomer = async (customerId: number) => {
    if (!confirm('Are you sure you want to delete this customer?')) return
    try {
      await axios.delete(`${apiUrl}/api/admin/customers/${customerId}`, { headers: { Authorization: `Bearer ${token}` } })
      const next = { ...leadMeta }
      delete next[customerId]
      setLeadMeta(next)
      writeLeadMeta(next)
      await fetchCustomers()
    } catch (error) {
      console.error('Error deleting customer:', error)
      alert('Failed to delete customer')
    }
  }

  const handleSaveCustomer = async () => {
    if (!formData.name?.trim()) {
      alert('Please enter a customer name')
      return
    }
    try {
      if (editingCustomer?.id) {
        await axios.put(`${apiUrl}/api/admin/customers/${editingCustomer.id}`, formData, { headers: { Authorization: `Bearer ${token}` } })
      } else {
        await axios.post(`${apiUrl}/api/admin/customers`, formData, { headers: { Authorization: `Bearer ${token}` } })
      }
      await fetchCustomers()
      setEditingCustomer(null)
      setShowAddCustomer(false)
      setFormData({
        name: '', email: '', phone: '', address: '', apt_gate_code: '', payment_mode: '',
        household_size: undefined, occupation: '', primary_goal: '', biggest_hurdle: '',
        protein_preference: '', dietary_preference: '', dietary_restrictions: '', foods_to_avoid: '', notes: '',
      })
    } catch (error) {
      console.error('Error saving customer:', error)
      alert('Failed to save customer')
    }
  }

  const openEditCustomer = (customer: Customer) => {
    setFormData(customer)
    setEditingCustomer(customer)
    setShowAddCustomer(true)
  }

  const handleFormChange = (field: keyof Customer, value: any) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
  }

  const getLifetimeValue = (cents: number) => (cents / 100).toFixed(2)

  // ---- new: one-click stage advance, real PATCH against production ----
  const moveStage = async (customer: Customer, direction: -1 | 1) => {
    const idx = STAGE_ORDER.indexOf(customer.sales_pipeline_stage || 'prospect')
    const nextIdx = idx + direction
    if (nextIdx < 0 || nextIdx >= STAGE_ORDER.length) return
    const nextStage = STAGE_ORDER[nextIdx]
    setCustomers((prev) => prev.map((c) => (c.id === customer.id ? { ...c, sales_pipeline_stage: nextStage } : c)))
    try {
      await axios.put(`${apiUrl}/api/admin/customers/${customer.id}`, { sales_pipeline_stage: nextStage }, { headers: { Authorization: `Bearer ${token}` } })
    } catch (error) {
      console.error('Error moving stage:', error)
      fetchCustomers()
    }
  }

  // ---- new: build/wrap up the Pipeline working set ----
  const addToWorkingSet = (ids: number[]) => {
    setWorkingSet((prev) => Array.from(new Set([...prev, ...ids])))
    setSelectedIds([])
  }
  const removeFromWorkingSet = (ids: number[]) => {
    setWorkingSet((prev) => prev.filter((id) => !ids.includes(id)))
    setSelectedIds([])
  }
  const sendToFollowUp = (ids: number[]) => {
    const entries: FollowUpEntry[] = ids.map((id) => {
      const c = customers.find((x) => x.id === id)
      return { customerId: id, name: c?.name || `#${id}`, note: '', createdAt: new Date().toISOString() }
    })
    setFollowUps((prev) => [...entries, ...prev])
    setWorkingSet((prev) => prev.filter((id) => !ids.includes(id)))
    setSelectedIds([])
  }
  const dismissFollowUp = (customerId: number) => {
    setFollowUps((prev) => prev.filter((f) => f.customerId !== customerId))
  }
  const updateFollowUpNote = (customerId: number, note: string) => {
    setFollowUps((prev) => prev.map((f) => (f.customerId === customerId ? { ...f, note } : f)))
  }

  // ---- new: quick add lead ----
  const resetQuickAdd = () => {
    setQuickAdd({ name: '', phone: '', email: '', lead_source: 'organic', source_id: '', account_type: 'individual', company_name: '' })
    setDuplicateMatch(null)
    setQuickAddError(null)
    setQuickAddConversionNotes('')
  }

  const checkDuplicate = (phone: string, email: string) => {
    const p = phone.trim()
    const e = email.trim().toLowerCase()
    return customers.find((c) => (p && c.phone === p) || (e && c.email?.toLowerCase() === e)) || null
  }

  const submitQuickAdd = async (force = false) => {
    setQuickAddError(null)
    if (!quickAdd.name.trim()) return setQuickAddError('Name is required.')
    // A social DM/comment conversion has no phone/email yet -- the Instagram
    // handle itself is the reach method until that changes.
    if (!convertingContactId && !quickAdd.phone.trim() && !quickAdd.email.trim()) {
      return setQuickAddError('Add a phone or an email so this lead can be followed up.')
    }

    if (!force) {
      const dup = checkDuplicate(quickAdd.phone, quickAdd.email)
      if (dup) {
        setDuplicateMatch(dup)
        return
      }
    }

    setSavingQuickAdd(true)
    try {
      const pickedSource = managedSources.find((s) => s.id === quickAdd.source_id)
      const category = pickedSource?.category || quickAdd.lead_source
      const sourceNote = `Lead source: ${LEAD_SOURCE_LABEL[category]}${pickedSource ? ` (${pickedSource.name})` : ''}`
      const notes = [
        sourceNote,
        quickAdd.account_type === 'business' && quickAdd.company_name ? `Business account: ${quickAdd.company_name}` : null,
        quickAddConversionNotes ? `\nInstagram conversation history:\n${quickAddConversionNotes}` : null,
      ].filter(Boolean).join('\n')
      const res = await axios.post(
        `${apiUrl}/api/admin/customers`,
        {
          name: quickAdd.name.trim(),
          phone: quickAdd.phone.trim() || undefined,
          email: quickAdd.email.trim() || undefined,
          sales_pipeline_stage: 'prospect',
          notes,
        },
        { headers: { Authorization: `Bearer ${token}` } }
      )
      const newId = res.data?.data?.id
      if (newId) {
        const next = {
          ...leadMeta,
          [newId]: {
            lead_source: category,
            source_id: quickAdd.source_id || undefined,
            account_type: quickAdd.account_type,
            company_name: quickAdd.company_name || undefined,
          },
        }
        setLeadMeta(next)
        writeLeadMeta(next)
      }
      if (convertingContactId && newId) {
        setSocialContacts((prev) => prev.map((c) => (c.id === convertingContactId ? { ...c, status: 'converted', converted_customer_id: newId } : c)))
        setConvertingContactId(null)
      }
      await fetchCustomers()
      setShowQuickAdd(false)
      resetQuickAdd()
    } catch (error) {
      console.error('Error creating lead:', error)
      setQuickAddError('Failed to save. Check the console for details.')
    } finally {
      setSavingQuickAdd(false)
    }
  }

  // ---- new: CSV export of whatever's currently filtered ----
  const exportCSV = () => {
    const header = ['Name', 'Email', 'Phone', 'Stage', 'Lead Source', 'Account Type', 'Company', 'Lifetime Value', 'Win Probability', 'Days Since Contact', 'Loss Reason']
    const rows = filteredCustomers.map((c) => [
      c.name,
      c.email || '',
      c.phone || '',
      STAGE_LABEL[c.sales_pipeline_stage || 'prospect'],
      LEAD_SOURCE_LABEL[c.lead_source || 'organic'],
      c.account_type === 'business' ? 'Business' : 'Individual',
      c.company_name || '',
      getLifetimeValue(c.lifetime_value_cents || 0),
      String(c.conversion_probability || 0),
      String(c.days_since_last_contact || 0),
      c.loss_reason ? LOSS_REASON_LABEL[c.loss_reason] : '',
    ])
    const csv = [header, ...rows].map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `sales-pipeline-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (loading) {
    return (
      <main className="flex-1 space-y-6 p-8">
        <div className="rounded-2xl border border-[#2E527F] bg-[rgba(251,247,240,0.9)] p-8 text-center">
          <p className="text-[#755B4C]">Loading customers...</p>
        </div>
      </main>
    )
  }

  return (
    <main className="flex-1 space-y-6 p-8">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-[#4B2B1D]">Sales Pipeline</h1>
          <p className="mt-1 text-sm text-[#755B4C]">Track leads, conversions, and customer engagement</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => { resetQuickAdd(); setShowQuickAdd(true) }}
            className="flex items-center gap-2 rounded-lg bg-[#16A34A] text-white px-4 py-2.5 font-bold hover:bg-[#15873F] transition"
          >
            <UserPlus className="h-5 w-5" />
            Quick Add Lead
          </button>
          <button
            onClick={() => setShowAddCustomer(true)}
            className="flex items-center gap-2 rounded-lg bg-[#2E527F] text-white px-4 py-2.5 font-bold hover:bg-[#24466E] transition"
          >
            <Plus className="h-5 w-5" />
            Full Add Prospect
          </button>
        </div>
      </div>

      {/* Salesman dashboard strip -- just the three numbers that matter day
          to day, not a wall of stats. Always visible, not tab-gated. */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl border border-[#2E527F] bg-[rgba(251,247,240,0.9)] px-5 py-4">
          <p className="text-xs font-bold text-[#755B4C]">Leads in Pipeline</p>
          <p className="text-2xl font-extrabold text-[#2E527F] mt-1">{workingSet.length}</p>
        </div>
        <div className="rounded-xl border border-[#2E527F] bg-[rgba(251,247,240,0.9)] px-5 py-4">
          <p className="text-xs font-bold text-[#755B4C]">Prospects</p>
          <p className="text-2xl font-extrabold text-[#9A6D34] mt-1">{customers.filter((c) => c.sales_pipeline_stage === 'prospect').length}</p>
        </div>
        <div className="rounded-xl border border-[#2E527F] bg-[rgba(251,247,240,0.9)] px-5 py-4">
          <p className="text-xs font-bold text-[#755B4C]">Need Follow-Up</p>
          <p className="text-2xl font-extrabold text-[#D62F3D] mt-1">{followUps.length + realTasks.length}</p>
        </div>
      </div>

      {/* Pipeline Intelligence -- Win Rate, Avg Sales Cycle, and the current
          stage funnel, all real numbers computed from what's already loaded.
          See the pipelineIntelligence useMemo for what these approximate and
          why (no stage-history log yet, so this is a v1 read, not a cohort
          funnel). */}
      <div className="rounded-2xl border border-[#E4D8C9] bg-[rgba(251,247,240,0.9)] p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-extrabold text-[#4B2B1D]">Pipeline Intelligence</h3>
          <p className="text-[10px] text-[#9A7E6F]">Win Rate & Avg Sales Cycle are last-90-day reads, not lifetime</p>
        </div>
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div className="rounded-xl bg-white border border-[#E4D8C9] px-4 py-3">
            <p className="text-xs font-bold text-[#755B4C]">Win Rate (Trial → Active, 90d)</p>
            <p className="text-2xl font-extrabold text-[#16A34A] mt-1">
              {pipelineIntelligence.winRate == null ? '—' : `${pipelineIntelligence.winRate}%`}
            </p>
            <p className="text-[10px] text-[#9A7E6F] mt-0.5">
              {pipelineIntelligence.trialCohortSize > 0 ? `of ${pipelineIntelligence.trialCohortSize} in the trial cohort` : 'No trial activity yet'}
            </p>
          </div>
          <div className="rounded-xl bg-white border border-[#E4D8C9] px-4 py-3">
            <p className="text-xs font-bold text-[#755B4C]">Avg Sales Cycle</p>
            <p className="text-2xl font-extrabold text-[#2E527F] mt-1">
              {pipelineIntelligence.avgCycleDays == null ? '—' : `${pipelineIntelligence.avgCycleDays}d`}
            </p>
            <p className="text-[10px] text-[#9A7E6F] mt-0.5">Lead created → entered Active</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {pipelineIntelligence.funnel.map((f, i) => (
            <React.Fragment key={f.stage}>
              <div className="flex-1 rounded-lg px-2 py-2 text-center" style={{ backgroundColor: STAGE_COLORS[f.stage]?.bg, border: `1px solid ${STAGE_COLORS[f.stage]?.border}` }}>
                <p className="text-[9px] font-bold uppercase tracking-wide" style={{ color: STAGE_COLORS[f.stage]?.text }}>{STAGE_LABEL[f.stage]}</p>
                <p className="text-sm font-extrabold mt-0.5" style={{ color: STAGE_COLORS[f.stage]?.text }}>{f.count}</p>
                <p className="text-[9px] text-[#9A7E6F]">{f.pct}%</p>
              </div>
              {i < pipelineIntelligence.funnel.length - 1 && <ChevronRight className="h-3 w-3 text-[#C9BBA8] flex-shrink-0" />}
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-[#D8CDBE] overflow-x-auto">
        {[
          { id: 'pipeline' as Tab, label: 'Pipeline', icon: '📊' },
          { id: 'customers' as Tab, label: 'Customers', icon: '🗂️' },
          { id: 'sources' as Tab, label: 'Lead Sources', icon: '📡' },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-6 py-3 text-sm font-extrabold whitespace-nowrap transition border-b-2 ${
              activeTab === tab.id ? 'border-[#2E527F] text-[#2E527F]' : 'border-transparent text-[#755B4C] hover:text-[#4B2B1D]'
            }`}
          >
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {/* Customers tab: the database, with the old three tabs collapsed into
          one category filter instead of three separate views over the same
          table. */}
      {activeTab === 'customers' && (
        <div className="flex gap-2 flex-wrap">
          {([
            ['all', 'All'],
            ['active', 'Active'],
            ['prospect', 'Prospects'],
            ['churned', 'Lost Prospects'],
          ] as [CustomerCategory, string][]).map(([id, label]) => (
            <button
              key={id}
              onClick={() => { setCustomerCategory(id); setSelectedListId(null) }}
              className={`rounded-full px-4 py-2 text-xs font-bold transition ${
                customerCategory === id && selectedListId == null ? 'bg-[#2E527F] text-white' : 'bg-[#FBF6EE] border border-[#B9A88F] text-[#4B2B1D] hover:bg-white'
              }`}
            >
              {label}
            </button>
          ))}
          {/* Every saved list, as its own pill -- real customer-lists data,
              same ones you can add to below when you tick a selection. */}
          {lists.map((l) => (
            <button
              key={l.id}
              onClick={() => selectListFilter(l.id)}
              title={`${l.member_count} customers`}
              className={`flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-bold transition ${
                selectedListId === l.id ? 'bg-[#2E527F] text-white' : 'bg-white border border-[#3E6594] text-[#2E527F] hover:bg-[#EAF0F7]'
              }`}
            >
              <List className="h-3 w-3" />
              {l.name} <span className="opacity-70">({l.member_count})</span>
            </button>
          ))}
        </div>
      )}

      {/* Search + filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 h-5 w-5 text-[#2E527F]" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search by name, email, or phone..."
            className="w-full rounded-xl border border-[#B9A88F] bg-[#FBF6EE] pl-12 pr-4 py-3 text-[#4B2B1D] outline-none focus:border-[#3E6594] focus:ring-4 focus:ring-[#3E6594]/10"
          />
        </div>

        {(activeTab === 'pipeline' || activeTab === 'customers') && (
          <>
            <select
              value={sourceFilter}
              onChange={(e) => setSourceFilter(e.target.value as any)}
              className="rounded-xl border border-[#B9A88F] bg-[#FBF6EE] px-3 py-3 text-sm font-bold text-[#4B2B1D] outline-none focus:border-[#3E6594]"
            >
              <option value="all">All sources</option>
              {(Object.keys(LEAD_SOURCE_LABEL) as LeadSource[]).map((s) => (
                <option key={s} value={s}>{LEAD_SOURCE_LABEL[s]}</option>
              ))}
            </select>

            {activeTab === 'customers' && customerCategory === 'churned' && (
              <select
                value={lossReasonFilter}
                onChange={(e) => setLossReasonFilter(e.target.value as any)}
                className="rounded-xl border border-[#B9A88F] bg-[#FBF6EE] px-3 py-3 text-sm font-bold text-[#4B2B1D] outline-none focus:border-[#3E6594]"
              >
                <option value="all">All reasons</option>
                {(Object.keys(LOSS_REASON_LABEL) as LossReason[]).map((r) => (
                  <option key={r} value={r}>{LOSS_REASON_LABEL[r]}</option>
                ))}
              </select>
            )}

            <button
              onClick={() => setStaleOnly((v) => !v)}
              className={`flex items-center gap-2 rounded-xl border px-4 py-3 text-sm font-bold whitespace-nowrap transition ${
                staleOnly ? 'border-[#D62F3D] bg-[#FFF4F4] text-[#D62F3D]' : 'border-[#B9A88F] bg-[#FBF6EE] text-[#4B2B1D] hover:bg-white'
              }`}
              title="Not contacted in 7+ days"
            >
              <Clock className="h-4 w-4" />
              Stale (7d+)
            </button>

            <button
              onClick={exportCSV}
              className="flex items-center gap-2 rounded-xl border border-[#B9A88F] bg-[#FBF6EE] px-4 py-3 text-sm font-bold text-[#4B2B1D] hover:bg-white transition whitespace-nowrap"
            >
              <Download className="h-4 w-4" />
              Export CSV
            </button>

            {activeTab === 'pipeline' && (
              <div className="flex rounded-xl border border-[#B9A88F] overflow-hidden flex-shrink-0">
                <button
                  onClick={() => setPipelineView('board')}
                  title="Board view"
                  className={`px-3 py-3 transition ${pipelineView === 'board' ? 'bg-[#2E527F] text-white' : 'bg-[#FBF6EE] text-[#4B2B1D] hover:bg-white'}`}
                >
                  <LayoutGrid className="h-4 w-4" />
                </button>
                <button
                  onClick={() => setPipelineView('list')}
                  title="List view"
                  className={`px-3 py-3 transition ${pipelineView === 'list' ? 'bg-[#2E527F] text-white' : 'bg-[#FBF6EE] text-[#4B2B1D] hover:bg-white'}`}
                >
                  <AlignJustify className="h-4 w-4" />
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* ---- new: Pipeline is a working set -- ticking people on the other
          tabs adds them here; ticking people already on the board lets you
          pull them back off or wrap them into a follow-up. ---- */}
      {activeTab !== 'pipeline' && selectedIds.length > 0 && (
        <div className="rounded-xl border border-[#B3DFC7] bg-[#EBF8F0] px-4 py-3 space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <span className="text-sm font-extrabold text-[#158A4D]">{selectedIds.length} selected</span>
            <div className="flex items-center gap-2">
              <button onClick={() => setSelectedIds([])} className="text-xs font-bold text-[#755B4C] hover:text-[#4B2B1D]">Clear</button>
              <button
                onClick={() => addToWorkingSet(selectedIds)}
                className="flex items-center gap-1.5 rounded-lg bg-[#16A34A] text-white px-3 py-2 text-xs font-bold hover:bg-[#15873F]"
              >
                <LayoutGrid className="h-3.5 w-3.5" /> Move to Pipeline
              </button>
              <button
                onClick={() => { setShowListActions((v) => !v); setListActionMessage(null) }}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold transition ${
                  showListActions ? 'bg-[#2E527F] text-white' : 'bg-white border border-[#B9A88F] text-[#4B2B1D] hover:bg-[#F8F2E8]'
                }`}
              >
                <List className="h-3.5 w-3.5" /> Move to List
              </button>
            </div>
          </div>

          {showListActions && (
            <div className="rounded-lg bg-white border border-[#E4D8C9] p-3 flex flex-wrap items-center gap-2">
              {lists.length === 0 && <span className="text-xs text-[#755B4C]">No lists yet -- create one below.</span>}
              {lists.map((l) => (
                <button
                  key={l.id}
                  disabled={listActionBusy}
                  onClick={() => addSelectionToList(l.id, selectedIds)}
                  className="h-8 px-3 rounded-lg bg-[#FBF6EE] border border-[#B9A88F] text-xs font-bold text-[#4B2B1D] hover:bg-white disabled:opacity-50"
                >
                  {l.name} ({l.member_count})
                </button>
              ))}
              <span className="text-xs text-[#9A7E6F]">or</span>
              <input
                value={newListName}
                onChange={(e) => setNewListName(e.target.value)}
                placeholder="New list name..."
                className="h-8 rounded-lg border border-[#B9A88F] bg-white px-2 text-xs text-[#4B2B1D] outline-none focus:border-[#3E6594]"
              />
              <button
                disabled={listActionBusy || !newListName.trim()}
                onClick={() => createListFromSelection(selectedIds)}
                className="h-8 px-3 rounded-lg bg-[#2E527F] text-white text-xs font-bold disabled:opacity-50"
              >
                Create List
              </button>
              {listActionMessage && <span className="text-xs font-bold text-[#16834A]">{listActionMessage}</span>}
            </div>
          )}
        </div>
      )}
      {activeTab === 'pipeline' && selectedIds.length > 0 && (
        <div className="rounded-xl border border-[#B9A88F] bg-[#FBF6EE] px-4 py-3 flex items-center justify-between">
          <span className="text-sm font-extrabold text-[#4B2B1D]">{selectedIds.length} selected</span>
          <div className="flex items-center gap-2">
            <button onClick={() => setSelectedIds([])} className="text-xs font-bold text-[#755B4C] hover:text-[#4B2B1D]">Clear</button>
            <button
              onClick={() => removeFromWorkingSet(selectedIds)}
              className="rounded-lg border border-[#B9A88F] bg-white px-3 py-2 text-xs font-bold text-[#4B2B1D] hover:bg-[#F8F2E8]"
            >
              Remove from Pipeline
            </button>
            <button
              onClick={() => sendToFollowUp(selectedIds)}
              className="rounded-lg bg-[#2E527F] text-white px-3 py-2 text-xs font-bold hover:bg-[#24466E]"
            >
              Move {selectedIds.length} to Follow-Up
            </button>
          </div>
        </div>
      )}

      {activeTab === 'pipeline' && workingSet.length > 0 && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-[#755B4C]">
            {workingSet.length} in your working pipeline right now -- ticked people from the Customers tab land here.
          </p>
          <button
            onClick={() => sendToFollowUp(workingSet)}
            className="flex items-center gap-1.5 rounded-lg border border-[#2E527F] bg-white px-3 py-2 text-xs font-bold text-[#2E527F] hover:bg-[#EAF0F7]"
          >
            Finish Session -- Move All {workingSet.length} to Follow-Up
          </button>
        </div>
      )}

      {/* ---- Pipeline tab: board or list ---- */}
      {activeTab === 'pipeline' && workingSet.length === 0 && (
        <div className="rounded-2xl border border-[#2E527F] bg-[rgba(251,247,240,0.9)] p-8 text-center">
          <p className="font-extrabold text-[#4B2B1D]">Your working pipeline is empty.</p>
          <p className="text-sm text-[#755B4C] mt-1">
            Go to the Customers tab, tick the people you want to work right now, and click "Add to Pipeline."
          </p>
          <p className="text-xs text-[#9A7E6F] mt-2">Saved on this device only -- not shared with other admins or devices.</p>
        </div>
      )}
      {activeTab === 'pipeline' && pipelineView === 'board' ? (
        <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-6 gap-3 items-start">
          {STAGE_ORDER.map((stage) => {
            const stageCustomers = filteredCustomers.filter((c) => (c.sales_pipeline_stage || 'prospect') === stage)
            const stageValue = stageCustomers.reduce((sum, c) => sum + (c.lifetime_value_cents || 0), 0)
            const colors = STAGE_COLORS[stage]
            return (
              <div key={stage} className="rounded-2xl border border-[#2E527F] bg-[rgba(251,247,240,0.6)] min-h-[200px]">
                <div className="p-3 border-b border-[#E4D8C9]" style={{ backgroundColor: colors.bg }}>
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-extrabold" style={{ color: colors.text }}>{STAGE_LABEL[stage]}</p>
                    <span className="text-[10px] font-bold rounded-full bg-white/70 px-2 py-0.5" style={{ color: colors.text }}>
                      {stageCustomers.length}
                    </span>
                  </div>
                  <p className="text-[10px] mt-0.5" style={{ color: colors.text }}>${getLifetimeValue(stageValue)} total</p>
                </div>
                <div className="p-2 space-y-2">
                  {stageCustomers.length === 0 ? (
                    <p className="text-[11px] text-[#9A7E6F] text-center py-4">Empty</p>
                  ) : (
                    stageCustomers.map((customer, idx) => {
                      const stageIdx = STAGE_ORDER.indexOf(stage)
                      return (
                        <div
                          key={customer.id}
                          onClick={() => { setSelectedCustomer(customer); setShowCustomerDetail(true) }}
                          className="rounded-xl border border-[#E4D8C9] bg-white p-2.5 cursor-pointer hover:shadow-md transition"
                        >
                          <div className="flex items-start justify-between gap-1">
                            <p className="text-xs font-extrabold text-[#4B2B1D] leading-tight flex items-center gap-1.5 min-w-0">
                              <input
                                type="checkbox"
                                checked={selectedIds.includes(customer.id)}
                                onClick={(e) => e.stopPropagation()}
                                onChange={() => toggleSelected(customer.id)}
                                className="h-3.5 w-3.5 flex-shrink-0"
                              />
                              <span className="truncate">{customer.name}</span>
                              {duplicateIds.has(customer.id) && (
                                <AlertTriangle className="h-3 w-3 text-[#D97706] flex-shrink-0" />
                              )}
                            </p>
                            <button
                              onClick={(e) => { e.stopPropagation(); sendToFollowUp([customer.id]) }}
                              title="Mark done -- move to Follow-Up"
                              className="text-[10px] font-bold text-[#2E527F] hover:underline flex-shrink-0"
                            >
                              ✓ Done
                            </button>
                          </div>
                          <div className="mt-1.5 flex flex-wrap gap-1">
                            <LeadSourceBadge source={customer.lead_source} />
                            {customer.account_type === 'business' && (
                              <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-[#EDF2F7] text-[#2E527F] border border-[#B3D9F7] flex items-center gap-1">
                                <Building2 className="h-2.5 w-2.5" /> B2B
                              </span>
                            )}
                          </div>
                          <div className="mt-2 flex items-center justify-between text-[10px] text-[#755B4C]">
                            <span>${getLifetimeValue(customer.lifetime_value_cents || 0)}</span>
                            <WinProbabilityBadge customer={customer} size={22} compact />
                          </div>
                          <div className="mt-2 flex items-center justify-between border-t border-[#F0EAE0] pt-1.5">
                            <button
                              onClick={(e) => { e.stopPropagation(); moveStage(customer, -1) }}
                              disabled={stageIdx === 0}
                              title="Move to previous stage"
                              className="rounded p-1 text-[#2E527F] hover:bg-[#EAF0F7] disabled:opacity-20 disabled:hover:bg-transparent"
                            >
                              <ChevronLeft className="h-3.5 w-3.5" />
                            </button>
                            <span className="text-[9px] text-[#9A7E6F]">{customer.days_since_last_contact || 0}d since contact</span>
                            <button
                              onClick={(e) => { e.stopPropagation(); moveStage(customer, 1) }}
                              disabled={stageIdx === STAGE_ORDER.length - 1}
                              title="Move to next stage"
                              className="rounded p-1 text-[#2E527F] hover:bg-[#EAF0F7] disabled:opacity-20 disabled:hover:bg-transparent"
                            >
                              <ChevronRight className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      )
                    })
                  )}
                </div>
              </div>
            )
          })}
        </div>
      ) : activeTab === 'pipeline' ? (
        <div className="space-y-3">
          {filteredCustomers.length === 0 ? (
            <div className="rounded-2xl border border-[#2E527F] bg-[rgba(251,247,240,0.9)] p-8 text-center">
              <p className="text-[#755B4C]">{workingSet.length === 0 ? 'Nobody in your working pipeline yet.' : 'No one in your working pipeline matches these filters.'}</p>
            </div>
          ) : (
            filteredCustomers.map((customer) => {
              const stage = customer.sales_pipeline_stage || 'prospect'
              const colors = STAGE_COLORS[stage]
              const stageIdx = STAGE_ORDER.indexOf(stage)
              return (
                <div
                  key={customer.id}
                  onClick={() => { setSelectedCustomer(customer); setShowCustomerDetail(true) }}
                  className="rounded-2xl border border-[#2E527F] bg-[rgba(251,247,240,0.9)] p-4 hover:shadow-md transition cursor-pointer"
                >
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(customer.id)}
                      onClick={(e) => e.stopPropagation()}
                      onChange={() => toggleSelected(customer.id)}
                      className="mt-1.5 h-4 w-4 shrink-0"
                    />
                    <div className="grid grid-cols-1 md:grid-cols-8 gap-4 items-start flex-1 min-w-0">
                      <div className="md:col-span-2">
                        <h3 className="font-extrabold text-[#4B2B1D] text-lg flex items-center gap-1.5">
                          {customer.name}
                          {duplicateIds.has(customer.id) && (
                            <AlertTriangle className="h-4 w-4 text-[#D97706]" titleAccess="Possible duplicate contact" />
                          )}
                        </h3>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          <span
                            className="text-xs px-3 py-1 rounded-full font-bold"
                            style={{ backgroundColor: colors.bg, color: colors.text, border: `1px solid ${colors.border}` }}
                          >
                            {STAGE_LABEL[stage]}
                          </span>
                          <LeadSourceBadge source={customer.lead_source} />
                          {customer.account_type === 'business' && (
                            <span className="text-xs px-2 py-1 rounded-full font-bold bg-[#EDF2F7] text-[#2E527F] border border-[#B3D9F7] flex items-center gap-1">
                              <Building2 className="h-3 w-3" /> {customer.company_name || 'Business'}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="text-sm space-y-1">
                        {customer.email && (
                          <div className="flex items-center gap-2 text-[#755B4C]">
                            <Mail className="h-4 w-4" />
                            <span className="truncate text-xs">{customer.email}</span>
                          </div>
                        )}
                        {customer.phone && (
                          <div className="flex items-center gap-2 text-[#755B4C]">
                            <Phone className="h-4 w-4" />
                            <span className="text-xs">{customer.phone}</span>
                          </div>
                        )}
                        {customer.address && (
                          <div className="flex items-start gap-2 text-[#755B4C]">
                            <MapPin className="h-4 w-4 mt-0.5 shrink-0" />
                            <span className="text-xs">
                              {customer.address}
                              {(customer.address_count || 0) > 1 && (
                                <span className="ml-1 font-bold text-[#2E527F]">+{(customer.address_count || 1) - 1} more</span>
                              )}
                            </span>
                          </div>
                        )}
                      </div>

                      <div className="rounded-lg bg-white p-2 text-center">
                        <p className="text-[#755B4C] text-xs font-bold">Total Meals</p>
                        <p className="text-lg font-extrabold text-[#2E527F] mt-1">{customer.total_meals_ordered || 0}</p>
                      </div>

                      <div className="rounded-lg bg-white p-2 text-center">
                        <p className="text-[#755B4C] text-xs font-bold">Lifetime Value</p>
                        <p className="text-lg font-extrabold text-[#16813D] mt-1">${getLifetimeValue(customer.lifetime_value_cents || 0)}</p>
                      </div>

                      <div className="rounded-lg bg-white p-2 text-center">
                        <p className="text-[#755B4C] text-xs font-bold">Engagement</p>
                        <div className="flex items-center justify-center gap-1 mt-1">
                          <Zap className="h-3 w-3 text-[#D97706]" />
                          <p className="text-lg font-extrabold text-[#D97706]">{customer.engagement_score || 0}%</p>
                        </div>
                      </div>

                      <div className="rounded-lg bg-white p-2 text-center">
                        <p className="text-[#755B4C] text-xs font-bold">Last Contact</p>
                        <div className="flex items-center justify-center gap-1 mt-1">
                          <Clock className="h-3 w-3 text-[#0EA5E9]" />
                          <p className="text-lg font-extrabold text-[#0EA5E9]">{customer.days_since_last_contact || 0}d</p>
                        </div>
                      </div>

                      <div className="rounded-lg bg-white p-2 text-center">
                        <p className="text-[#755B4C] text-xs font-bold mb-1">Win Probability</p>
                        <div className="flex items-center justify-center">
                          <WinProbabilityBadge customer={customer} size={40} compact />
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        onClick={(e) => { e.stopPropagation(); sendToFollowUp([customer.id]) }}
                        title="Mark done -- move to Follow-Up"
                        className="p-2 rounded-lg text-[#2E527F] hover:bg-[#EAF0F7] transition text-xs font-bold"
                      >
                        ✓ Done
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); moveStage(customer, -1) }}
                        disabled={stageIdx === 0}
                        title="Move to previous stage"
                        className="p-2 rounded-lg text-[#2E527F] hover:bg-[#EAF0F7] disabled:opacity-20 transition"
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); moveStage(customer, 1) }}
                        disabled={stageIdx === STAGE_ORDER.length - 1}
                        title="Move to next stage"
                        className="p-2 rounded-lg text-[#2E527F] hover:bg-[#EAF0F7] disabled:opacity-20 transition"
                      >
                        <ChevronRight className="h-4 w-4" />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); openEditCustomer(customer) }}
                        className="p-2 rounded-lg text-[#2E527F] hover:bg-[#EAF0F7] transition"
                        aria-label={`Edit ${customer.name}`}
                        title="Edit"
                      >
                        <Edit className="h-4 w-4" />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDeleteCustomer(customer.id) }}
                        className="p-2 rounded-lg text-[#D62F3D] hover:bg-[#FFF4F4] transition"
                        aria-label={`Delete ${customer.name}`}
                        title="Delete"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              )
            })
          )}
        </div>
      ) : activeTab === 'customers' ? (
        <div className="space-y-3">
          {filteredCustomers.length === 0 ? (
            <div className="rounded-2xl border border-[#2E527F] bg-[rgba(251,247,240,0.9)] p-8 text-center">
              <p className="text-[#755B4C]">No customers found</p>
            </div>
          ) : (
            filteredCustomers.map((customer) => (
              <div
                key={customer.id}
                onClick={() => { setSelectedCustomer(customer); setShowCustomerDetail(true) }}
                className="rounded-2xl border border-[#2E527F] bg-[rgba(251,247,240,0.9)] p-4 hover:shadow-md transition cursor-pointer"
              >
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(customer.id)}
                    onClick={(e) => e.stopPropagation()}
                    onChange={() => toggleSelected(customer.id)}
                    className="mt-1.5 h-4 w-4 shrink-0"
                  />
                  <div className="grid grid-cols-1 md:grid-cols-5 gap-4 items-start flex-1 min-w-0">
                    <div className="md:col-span-2">
                      <h3 className="font-extrabold text-[#4B2B1D] text-lg">{customer.name}</h3>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {customer.dietary_restrictions && (
                          <span className="text-xs bg-[#FFF4F4] text-[#D62F3D] px-2 py-1 rounded font-bold">{customer.dietary_restrictions}</span>
                        )}
                        <span className={`text-xs px-2 py-1 rounded font-bold ${customer.sales_pipeline_stage === 'active' ? 'bg-[#EAF5EC] text-[#16A34A]' : 'bg-[#F5F5F5] text-[#9CA3AF]'}`}>
                          {customer.sales_pipeline_stage === 'active' ? '✓ Active' : '⏸️ Inactive'}
                        </span>
                        <LeadSourceBadge source={customer.lead_source} />
                        {customer.sales_pipeline_stage === 'churned' && (
                          <>
                            <span className="text-[10px] px-2 py-1 rounded-full font-bold bg-[#F5F0E8] text-[#755B4C] whitespace-nowrap">
                              Last outreach: {customer.days_since_last_contact != null ? `${customer.days_since_last_contact}d ago` : 'unknown'}
                            </span>
                            {customer.loss_reason ? (
                              <span
                                className="text-[10px] px-2 py-1 rounded-full font-bold whitespace-nowrap"
                                style={{ backgroundColor: LOSS_REASON_COLORS.bg, color: LOSS_REASON_COLORS.text, border: `1px solid ${LOSS_REASON_COLORS.border}` }}
                              >
                                Lost: {LOSS_REASON_LABEL[customer.loss_reason]}
                              </span>
                            ) : (
                              <select
                                onClick={(e) => e.stopPropagation()}
                                onChange={(e) => assignLossReason(customer.id, e.target.value as LossReason)}
                                defaultValue=""
                                className="text-[10px] font-bold rounded-full border border-[#F7B3C5] bg-[#FFF4F5] text-[#C21E3C] px-2 py-1 outline-none"
                              >
                                <option value="" disabled>Reason for loss...</option>
                                {(Object.keys(LOSS_REASON_LABEL) as LossReason[]).map((r) => (
                                  <option key={r} value={r}>{LOSS_REASON_LABEL[r]}</option>
                                ))}
                              </select>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                    <div className="text-sm space-y-1">
                      {customer.email && (
                        <div className="flex items-center gap-2 text-[#755B4C]">
                          <Mail className="h-4 w-4" />
                          <span className="truncate">{customer.email}</span>
                        </div>
                      )}
                      {customer.phone && (
                        <div className="flex items-center gap-2 text-[#755B4C]">
                          <Phone className="h-4 w-4" />
                          <span>{customer.phone}</span>
                        </div>
                      )}
                      {customer.address && (
                        <div className="flex items-start gap-2 text-[#755B4C]">
                          <MapPin className="h-4 w-4 mt-0.5 shrink-0" />
                          <span className="text-xs">
                            {customer.address}
                            {(customer.address_count || 0) > 1 && (
                              <span className="ml-1 font-bold text-[#2E527F]">+{(customer.address_count || 1) - 1} more</span>
                            )}
                          </span>
                        </div>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="rounded-lg bg-white p-2">
                        <p className="text-[#755B4C] font-bold">Weeks</p>
                        <p className="text-lg font-extrabold text-[#2E527F]">{customer.weeks_active || 0}</p>
                      </div>
                      <div className="rounded-lg bg-white p-2">
                        <p className="text-[#755B4C] font-bold">Meals</p>
                        <p className="text-lg font-extrabold text-[#2E527F]">{customer.total_meals_ordered || 0}</p>
                      </div>
                    </div>
                    <div className="rounded-lg bg-white p-3 text-center">
                      <p className="text-[#755B4C] text-xs font-bold">Lifetime Value</p>
                      <p className="text-xl font-extrabold text-[#16A34A]">${getLifetimeValue(customer.lifetime_value_cents || 0)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button onClick={(e) => { e.stopPropagation(); openEditCustomer(customer) }} className="p-2 rounded-lg text-[#2E527F] hover:bg-[#EAF0F7] transition" title="Edit">
                      <Edit className="h-4 w-4" />
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); handleDeleteCustomer(customer.id) }} className="p-2 rounded-lg text-[#D62F3D] hover:bg-[#FFF4F4] transition" title="Delete">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      ) : activeTab === 'sources' ? (
        <div className="space-y-4">
          <div className="rounded-2xl border border-[#3E6594] bg-[#EAF0F7] p-4 flex items-start justify-between gap-3">
            <p className="text-sm text-[#2E527F]">
              Every source ranked by LTV:CAC, not just lead count -- below 1:1 loses money, 1-3:1 needs work, 3:1+ is worth scaling.
              Cost accrues for every month a source has run, not just its current bill.
              <span className="block mt-1 text-xs text-[#5A7A9C]">
                Sources, promo codes, and the Social Inbox on this tab are saved on this device only -- not shared with other admins or devices.
              </span>
            </p>
            <button
              onClick={() => { setShowNewSource(true); setEditingSourceId(null); setNewSource({ name: '', category: 'ambassador', monthly_cost: '' }) }}
              className="flex items-center gap-1.5 rounded-lg bg-[#2E527F] text-white px-4 py-2.5 text-sm font-bold hover:bg-[#24466E] transition flex-shrink-0"
            >
              <Plus className="h-4 w-4" /> New Source
            </button>
          </div>

          {(showNewSource || editingSourceId) && (
            <div className="rounded-2xl border border-[#2E527F] bg-[rgba(251,247,240,0.9)] p-5">
              <h3 className="font-extrabold text-[#4B2B1D] mb-4">{editingSourceId ? 'Edit Source' : 'New Source'}</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-[#4B2B1D] mb-1.5">Name</label>
                  <input
                    type="text"
                    value={newSource.name}
                    onChange={(e) => setNewSource((p) => ({ ...p, name: e.target.value }))}
                    placeholder="e.g. Xavier's CrossFit, @fit4sure.food"
                    className="w-full rounded-lg border border-[#B9A88F] bg-white px-3 py-2 text-sm text-[#4B2B1D] outline-none focus:border-[#3E6594]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-[#4B2B1D] mb-1.5">Category</label>
                  <select
                    value={newSource.category}
                    onChange={(e) => setNewSource((p) => ({ ...p, category: e.target.value as LeadSource }))}
                    className="w-full rounded-lg border border-[#B9A88F] bg-white px-3 py-2 text-sm text-[#4B2B1D] outline-none focus:border-[#3E6594]"
                  >
                    {(Object.keys(LEAD_SOURCE_LABEL) as LeadSource[]).map((s) => (
                      <option key={s} value={s}>{LEAD_SOURCE_LABEL[s]}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-[#4B2B1D] mb-1.5">Monthly Cost ($, optional)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={newSource.monthly_cost}
                    onChange={(e) => setNewSource((p) => ({ ...p, monthly_cost: e.target.value }))}
                    placeholder="e.g. 210"
                    className="w-full rounded-lg border border-[#B9A88F] bg-white px-3 py-2 text-sm text-[#4B2B1D] outline-none focus:border-[#3E6594]"
                  />
                </div>
              </div>
              <div className="flex gap-2 mt-4">
                <button
                  onClick={() => { setShowNewSource(false); setEditingSourceId(null) }}
                  className="rounded-lg border border-[#B9A88F] bg-white px-4 py-2 text-xs font-bold text-[#4B2B1D] hover:bg-[#F8F2E8]"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    if (editingSourceId) {
                      setManagedSources((prev) =>
                        prev.map((s) =>
                          s.id === editingSourceId
                            ? { ...s, name: newSource.name.trim() || s.name, category: newSource.category, monthly_cost_cents: newSource.monthly_cost ? Math.round(parseFloat(newSource.monthly_cost) * 100) : undefined }
                            : s
                        )
                      )
                      setEditingSourceId(null)
                    } else {
                      createManagedSource()
                    }
                  }}
                  disabled={!newSource.name.trim()}
                  className="rounded-lg bg-[#16A34A] text-white px-4 py-2 text-xs font-bold hover:bg-[#15873F] disabled:opacity-40"
                >
                  {editingSourceId ? 'Save' : 'Create'}
                </button>
              </div>
            </div>
          )}

          {managedSources.length === 0 ? (
            <div className="rounded-2xl border border-[#2E527F] bg-[rgba(251,247,240,0.9)] p-8 text-center">
              <p className="text-[#755B4C]">No sources yet -- click "New Source" to add your first ambassador, campaign, or referral partner.</p>
            </div>
          ) : (
            (() => {
              const rows = managedSources.map((s) => ({ source: s, metrics: computeSourceMetrics(s, enriched) }))
              const ranked = [...rows].sort((a, b) => {
                const ra = a.metrics.ratio, rb = b.metrics.ratio
                if (ra == null && rb == null) return 0
                if (ra == null) return 1
                if (rb == null) return -1
                return rb - ra
              })
              const blendedLeads = rows.reduce((sum, r) => sum + r.metrics.leadCount, 0)
              const blendedConverted = rows.reduce((sum, r) => sum + r.metrics.convertedCount, 0)
              const blendedRevenue = rows.reduce((sum, r) => sum + r.metrics.revenueCents, 0)
              const blendedCost = rows.reduce((sum, r) => sum + r.metrics.totalCostCents, 0)
              const blendedCac = blendedConverted > 0 ? blendedCost / blendedConverted : null
              const blendedLtv = blendedConverted > 0 ? blendedRevenue / blendedConverted : 0
              const blendedRatio = blendedCac != null && blendedCac > 0 ? blendedLtv / blendedCac : (blendedCost === 0 && blendedConverted > 0 ? Infinity : null)
              const blendedVerdict = ltvCacVerdict(blendedRatio)
              const unattributed = enriched.filter((c) => !c.source_id)

              return (
                <>
                  {/* Blended -- the sanity-check number across every source
                      combined, same instinct as checking blended CAC before
                      trusting any one channel's number in isolation. */}
                  <div className="rounded-2xl border border-[#2E527F] bg-[rgba(251,247,240,0.9)] p-5">
                    <p className="text-xs font-bold text-[#755B4C] mb-3">BLENDED ACROSS ALL SOURCES</p>
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                      <div className="rounded-xl bg-white p-4">
                        <p className="text-xs text-[#755B4C]">Leads</p>
                        <p className="text-2xl font-extrabold text-[#2E527F] mt-1">{blendedLeads}</p>
                      </div>
                      <div className="rounded-xl bg-white p-4">
                        <p className="text-xs text-[#755B4C]">Converted</p>
                        <p className="text-2xl font-extrabold text-[#16A34A] mt-1">{blendedConverted}</p>
                      </div>
                      <div className="rounded-xl bg-white p-4">
                        <p className="text-xs text-[#755B4C]">Blended CAC</p>
                        <p className="text-2xl font-extrabold text-[#4B2B1D] mt-1">{blendedCac != null ? fmtCents(blendedCac) : '—'}</p>
                      </div>
                      <div className="rounded-xl bg-white p-4">
                        <p className="text-xs text-[#755B4C]">Blended LTV</p>
                        <p className="text-2xl font-extrabold text-[#4B2B1D] mt-1">{fmtCents(blendedLtv)}</p>
                      </div>
                      <div className="rounded-xl p-4" style={{ backgroundColor: blendedVerdict.bg, border: `1px solid ${blendedVerdict.border}` }}>
                        <p className="text-xs font-bold" style={{ color: blendedVerdict.text }}>LTV : CAC</p>
                        <p className="text-2xl font-extrabold mt-1" style={{ color: blendedVerdict.text }}>{fmtRatio(blendedRatio)}</p>
                        <p className="text-[10px] font-bold mt-0.5" style={{ color: blendedVerdict.text }}>{blendedVerdict.label}</p>
                      </div>
                    </div>
                  </div>

                  {/* Leaderboard -- ranked by LTV:CAC, not by lead count.
                      Doubling down on the winner and fixing/killing the
                      loser is the entire point of measuring this at all. */}
                  <div className="rounded-2xl border border-[#2E527F] bg-[rgba(251,247,240,0.9)] p-5">
                    <p className="text-xs font-bold text-[#755B4C] mb-3">RANKED BY LTV : CAC</p>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-left text-[10px] font-bold text-[#9A7E6F] uppercase tracking-wide border-b border-[#E4D8C9]">
                            <th className="pb-2 pr-3">#</th>
                            <th className="pb-2 pr-3">Source</th>
                            <th className="pb-2 pr-3">Method</th>
                            <th className="pb-2 pr-3 text-right">Leads</th>
                            <th className="pb-2 pr-3 text-right">Converted</th>
                            <th className="pb-2 pr-3 text-right">CAC</th>
                            <th className="pb-2 pr-3 text-right">LTV</th>
                            <th className="pb-2 pr-3 text-right">LTV:CAC</th>
                            <th className="pb-2 pr-3">Verdict</th>
                            <th className="pb-2"></th>
                          </tr>
                        </thead>
                        <tbody>
                          {ranked.map(({ source: s, metrics: m }, idx) => {
                            const verdict = ltvCacVerdict(m.ratio)
                            const catColors = LEAD_SOURCE_COLORS[s.category]
                            return (
                              <tr key={s.id} className="border-b border-[#F0EAE0] last:border-0">
                                <td className="py-2.5 pr-3 text-[#9A7E6F] font-bold">{idx + 1}</td>
                                <td className="py-2.5 pr-3">
                                  <p className="font-extrabold text-[#4B2B1D]">{s.name}</p>
                                  <span
                                    className="text-[10px] px-1.5 py-0.5 rounded-full font-bold"
                                    style={{ backgroundColor: catColors.bg, color: catColors.text, border: `1px solid ${catColors.border}` }}
                                  >
                                    {LEAD_SOURCE_LABEL[s.category]}
                                  </span>
                                </td>
                                <td className="py-2.5 pr-3 text-xs text-[#755B4C]">{CORE_FOUR_LABEL[s.category]}</td>
                                <td className="py-2.5 pr-3 text-right font-bold text-[#2E527F]">{m.leadCount}</td>
                                <td className="py-2.5 pr-3 text-right font-bold text-[#16A34A]">{m.convertedCount}</td>
                                <td className="py-2.5 pr-3 text-right text-[#4B2B1D]">{m.cacCents != null ? fmtCents(m.cacCents) : '—'}</td>
                                <td className="py-2.5 pr-3 text-right text-[#4B2B1D]">{m.convertedCount > 0 ? fmtCents(m.avgLtvCents) : '—'}</td>
                                <td className="py-2.5 pr-3 text-right font-extrabold" style={{ color: verdict.text }}>{fmtRatio(m.ratio)}</td>
                                <td className="py-2.5 pr-3">
                                  <span className="text-[10px] px-2 py-0.5 rounded-full font-bold whitespace-nowrap" style={{ backgroundColor: verdict.bg, color: verdict.text, border: `1px solid ${verdict.border}` }}>
                                    {verdict.label}
                                  </span>
                                </td>
                                <td className="py-2.5">
                                  <div className="flex items-center gap-1">
                                    <button
                                      onClick={() => {
                                        setEditingSourceId(s.id)
                                        setShowNewSource(false)
                                        setNewSource({ name: s.name, category: s.category, monthly_cost: s.monthly_cost_cents ? (s.monthly_cost_cents / 100).toString() : '' })
                                      }}
                                      className="p-1.5 rounded-lg text-[#2E527F] hover:bg-[#EAF0F7]"
                                      title="Edit"
                                    >
                                      <Edit className="h-3.5 w-3.5" />
                                    </button>
                                    <button onClick={() => deleteManagedSource(s.id)} className="p-1.5 rounded-lg text-[#D62F3D] hover:bg-[#FFF4F4]" title="Delete">
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                    <p className="text-[10px] text-[#9A7E6F] mt-3">
                      CAC accrues monthly cost across every month the source has existed. LTV is average lifetime value per converted customer.
                      3:1+ is a healthy bar for scaling; below 1:1 the channel is losing money.
                    </p>
                  </div>

                  {unattributed.length > 0 && (
                    <div className="rounded-2xl border border-dashed border-[#D8CDBE] bg-transparent p-4">
                      <p className="text-xs text-[#9A7E6F]">
                        {unattributed.length} customer{unattributed.length === 1 ? '' : 's'} with no source assigned -- Organic/word-of-mouth baseline,
                        not counted in the leaderboard since there's no channel to scale or cut.
                      </p>
                    </div>
                  )}
                </>
              )
            })()
          )}

          {/* ---- Promo Codes -- the Growth Plan's real lead-capture
              mechanism: every sample drop hands one out, redeeming it is
              what turns a stranger into a tracked lead. ---- */}
          <div className="rounded-2xl border border-[#2E527F] bg-[rgba(251,247,240,0.9)] p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="font-extrabold text-[#4B2B1D]">🎟️ Promo Codes</p>
                <p className="text-xs text-[#755B4C] mt-0.5">Every sample drop and outreach visit hands one out -- redemptions roll up to the linked source automatically.</p>
              </div>
              <button
                onClick={() => { setShowNewPromo((v) => !v); setNewPromo({ code: '', source_id: '', description: '' }) }}
                className="flex items-center gap-1.5 rounded-lg bg-[#2E527F] text-white px-4 py-2.5 text-sm font-bold hover:bg-[#24466E] transition flex-shrink-0"
              >
                <Plus className="h-4 w-4" /> New Code
              </button>
            </div>

            {showNewPromo && (
              <div className="rounded-xl border border-[#E4D8C9] bg-white p-4 mb-3 grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-[#4B2B1D] mb-1.5">Code</label>
                  <input
                    type="text"
                    value={newPromo.code}
                    onChange={(e) => setNewPromo((p) => ({ ...p, code: e.target.value }))}
                    placeholder="e.g. FIT4SURE15"
                    className="w-full rounded-lg border border-[#B9A88F] bg-white px-3 py-2 text-sm text-[#4B2B1D] outline-none focus:border-[#3E6594]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-[#4B2B1D] mb-1.5">Linked Source (optional)</label>
                  <select
                    value={newPromo.source_id}
                    onChange={(e) => setNewPromo((p) => ({ ...p, source_id: e.target.value }))}
                    className="w-full rounded-lg border border-[#B9A88F] bg-white px-3 py-2 text-sm text-[#4B2B1D] outline-none focus:border-[#3E6594]"
                  >
                    <option value="">No specific source</option>
                    {managedSources.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-[#4B2B1D] mb-1.5">Description (optional)</label>
                  <input
                    type="text"
                    value={newPromo.description}
                    onChange={(e) => setNewPromo((p) => ({ ...p, description: e.target.value }))}
                    placeholder="e.g. 15% off first order"
                    className="w-full rounded-lg border border-[#B9A88F] bg-white px-3 py-2 text-sm text-[#4B2B1D] outline-none focus:border-[#3E6594]"
                  />
                </div>
                <div className="md:col-span-3 flex gap-2">
                  <button onClick={() => setShowNewPromo(false)} className="rounded-lg border border-[#B9A88F] bg-white px-4 py-2 text-xs font-bold text-[#4B2B1D] hover:bg-[#F8F2E8]">
                    Cancel
                  </button>
                  <button onClick={createPromoCode} disabled={!newPromo.code.trim()} className="rounded-lg bg-[#16A34A] text-white px-4 py-2 text-xs font-bold hover:bg-[#15873F] disabled:opacity-40">
                    Create
                  </button>
                </div>
              </div>
            )}

            {promoCodes.length === 0 ? (
              <p className="text-xs text-[#755B4C]">No codes yet -- click "New Code" to create your first one.</p>
            ) : (
              <div className="space-y-2">
                {promoCodes.map((p) => {
                  const redemptions = enriched.filter((c) => c.promo_code_id === p.id).length
                  const linkedSource = managedSources.find((s) => s.id === p.source_id)
                  return (
                    <div key={p.id} className="rounded-xl border border-[#E4D8C9] bg-white p-4 flex items-center justify-between gap-4 flex-wrap">
                      <div className="min-w-0">
                        <p className="text-sm font-extrabold text-[#4B2B1D] font-mono">{p.code}</p>
                        <p className="text-xs text-[#755B4C] mt-0.5">
                          {redemptions} redemption{redemptions === 1 ? '' : 's'}
                          {linkedSource && <> · linked to {linkedSource.name}</>}
                          {p.description && <> · {p.description}</>}
                        </p>
                      </div>
                      <button onClick={() => deletePromoCode(p.id)} className="p-2 rounded-lg text-[#D62F3D] hover:bg-[#FFF4F4] flex-shrink-0" title="Delete">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* ---- Social Inbox -- threaded conversation log, not a flat
              one-liner list. Logging against an existing handle appends to
              their thread; expanding a contact shows the whole history. ---- */}
          <div className="rounded-2xl border border-[#2E527F] bg-[rgba(251,247,240,0.9)] p-5">
            <div className="flex items-start justify-between gap-3 mb-4">
              <div>
                <p className="font-extrabold text-[#4B2B1D] mb-1">📱 Social Inbox</p>
                <p className="text-xs text-[#755B4C]">
                  Instagram DMs and comments. Logging against the same handle again adds to their thread, so the full conversation is
                  there when you decide whether to convert them.
                </p>
              </div>
              <div className="flex-shrink-0 text-right">
                <label className="inline-flex items-center gap-1.5 rounded-lg border border-[#B9A88F] bg-white px-3 py-2 text-xs font-bold text-[#4B2B1D] hover:bg-[#F8F2E8] cursor-pointer">
                  {importingExport ? 'Importing...' : 'Import Instagram Export'}
                  <input
                    type="file"
                    multiple
                    // @ts-ignore -- webkitdirectory isn't in the TS DOM lib but every Chromium browser supports it
                    webkitdirectory=""
                    disabled={importingExport}
                    onChange={(e) => { handleImportInstagramExport(e.target.files); e.target.value = '' }}
                    className="hidden"
                  />
                </label>
                <p className="text-[10px] text-[#9A7E6F] mt-1 max-w-[220px]">Pick your unzipped "Download Your Information" export folder -- every real DM, parsed client-side.</p>
                {importSummary && <p className="text-[10px] font-bold text-[#158A4D] mt-1">{importSummary}</p>}
              </div>
            </div>

            <div className="flex flex-wrap gap-2 mb-4">
              <div className="flex rounded-lg border border-[#B9A88F] overflow-hidden flex-shrink-0">
                <button
                  onClick={() => setNewSocialType('dm')}
                  className={`px-3 py-2 text-xs font-bold transition ${newSocialType === 'dm' ? 'bg-[#2E527F] text-white' : 'bg-white text-[#4B2B1D] hover:bg-[#F8F2E8]'}`}
                >
                  DM
                </button>
                <button
                  onClick={() => setNewSocialType('comment')}
                  className={`px-3 py-2 text-xs font-bold transition ${newSocialType === 'comment' ? 'bg-[#2E527F] text-white' : 'bg-white text-[#4B2B1D] hover:bg-[#F8F2E8]'}`}
                >
                  Comment
                </button>
              </div>
              <input
                type="text"
                value={newSocialHandle}
                onChange={(e) => setNewSocialHandle(e.target.value)}
                placeholder="@handle"
                className="w-32 rounded-lg border border-[#B9A88F] bg-white px-3 py-2 text-sm text-[#4B2B1D] outline-none focus:border-[#3E6594]"
              />
              <input
                type="text"
                value={newSocialNote}
                onChange={(e) => setNewSocialNote(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') logSocialEvent() }}
                placeholder="What did they say? (e.g. asking about pricing)"
                className="flex-1 min-w-[200px] rounded-lg border border-[#B9A88F] bg-white px-3 py-2 text-sm text-[#4B2B1D] outline-none focus:border-[#3E6594]"
              />
              <button
                onClick={logSocialEvent}
                disabled={!newSocialHandle.trim()}
                className="rounded-lg bg-[#2E527F] text-white px-4 py-2 text-sm font-bold hover:bg-[#24466E] disabled:opacity-40"
              >
                Log
              </button>
            </div>

            {socialContacts.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-3">
                {([
                  ['new', `New (${socialContacts.filter((c) => c.status === 'new').length})`],
                  ['all', `All (${socialContacts.length})`],
                  ['converted', `Converted (${socialContacts.filter((c) => c.status === 'converted').length})`],
                  ['ignored', `Ignored (${socialContacts.filter((c) => c.status === 'ignored').length})`],
                ] as [typeof socialStatusFilter, string][]).map(([id, label]) => (
                  <button
                    key={id}
                    onClick={() => setSocialStatusFilter(id)}
                    className={`rounded-full px-3 py-1.5 text-[11px] font-bold transition ${
                      socialStatusFilter === id ? 'bg-[#2E527F] text-white' : 'bg-[#FBF6EE] border border-[#B9A88F] text-[#4B2B1D] hover:bg-white'
                    }`}
                  >
                    {label}
                  </button>
                ))}
                <input
                  type="text"
                  value={socialSearch}
                  onChange={(e) => setSocialSearch(e.target.value)}
                  placeholder="Search handle..."
                  className="rounded-full border border-[#B9A88F] bg-white px-3 py-1.5 text-[11px] text-[#4B2B1D] outline-none focus:border-[#3E6594] flex-1 min-w-[120px] max-w-[200px]"
                />
              </div>
            )}

            {(() => {
              const filteredSocialContacts = socialContacts
                .filter((c) => socialStatusFilter === 'all' || c.status === socialStatusFilter)
                .filter((c) => !socialSearch.trim() || c.handle.toLowerCase().includes(socialSearch.trim().toLowerCase()))

              if (socialContacts.length === 0) {
                return <p className="text-xs text-[#755B4C]">Nothing logged yet -- add a DM/comment above, or import an Instagram export.</p>
              }
              if (filteredSocialContacts.length === 0) {
                return <p className="text-xs text-[#755B4C]">No contacts match this filter.</p>
              }
              return (
              <div className="space-y-2 max-h-[600px] overflow-y-auto">
                {filteredSocialContacts.map((c) => {
                  const expanded = expandedContactId === c.id
                  const lastMessage = c.messages[c.messages.length - 1]
                  return (
                    <div key={c.id} className="rounded-xl border border-[#E4D8C9] bg-white overflow-hidden">
                      <button
                        onClick={() => setExpandedContactId(expanded ? null : c.id)}
                        className="w-full flex items-center justify-between gap-3 p-3 text-left"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-extrabold text-[#4B2B1D] flex items-center gap-1.5">
                            @{c.handle}
                            <span className="text-[10px] font-bold rounded-full bg-[#EDF2F7] text-[#2E527F] px-2 py-0.5">
                              {c.messages.length} message{c.messages.length === 1 ? '' : 's'}
                            </span>
                          </p>
                          {lastMessage && <p className="text-xs text-[#755B4C] mt-0.5 truncate">{lastMessage.text || `(${lastMessage.type}, no text logged)`}</p>}
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          {c.status !== 'new' && (
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${c.status === 'converted' ? 'bg-[#EBF8F0] text-[#158A4D]' : 'bg-[#F5F5F5] text-[#9CA3AF]'}`}>
                              {c.status === 'converted' ? '✓ Converted' : 'Ignored'}
                            </span>
                          )}
                          <ChevronDown className={`h-4 w-4 text-[#755B4C] transition-transform ${expanded ? 'rotate-180' : ''}`} />
                        </div>
                      </button>

                      {expanded && (
                        <div className="border-t border-[#E4D8C9] p-3 space-y-3">
                          {/* Full thread -- every DM/comment from this person, oldest first */}
                          <div className="space-y-1.5 max-h-64 overflow-y-auto">
                            {c.messages.map((m) => (
                              <div key={m.id} className="rounded-lg bg-[#FBF7F0] px-3 py-2">
                                <div className="flex items-center gap-1.5">
                                  <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-full bg-[#E0F2FE] text-[#0369A1]">{m.type === 'dm' ? 'DM' : 'Comment'}</span>
                                  <span className="text-[10px] text-[#9A7E6F]">{new Date(m.created_at).toLocaleString()}</span>
                                </div>
                                {m.text && <p className="text-xs text-[#4B2B1D] mt-1">{m.text}</p>}
                              </div>
                            ))}
                          </div>

                          {c.status === 'new' && (
                            <>
                              {/* Keep logging against this same thread */}
                              <div className="flex flex-wrap gap-2">
                                <div className="flex rounded-lg border border-[#B9A88F] overflow-hidden flex-shrink-0">
                                  <button
                                    onClick={() => setThreadReplyType('dm')}
                                    className={`px-2.5 py-1.5 text-[10px] font-bold transition ${threadReplyType === 'dm' ? 'bg-[#2E527F] text-white' : 'bg-white text-[#4B2B1D]'}`}
                                  >
                                    DM
                                  </button>
                                  <button
                                    onClick={() => setThreadReplyType('comment')}
                                    className={`px-2.5 py-1.5 text-[10px] font-bold transition ${threadReplyType === 'comment' ? 'bg-[#2E527F] text-white' : 'bg-white text-[#4B2B1D]'}`}
                                  >
                                    Comment
                                  </button>
                                </div>
                                <input
                                  type="text"
                                  value={threadReplyText}
                                  onChange={(e) => setThreadReplyText(e.target.value)}
                                  onKeyDown={(e) => { if (e.key === 'Enter') addThreadMessage(c.id) }}
                                  placeholder="Add another message to this thread..."
                                  className="flex-1 min-w-[160px] rounded-lg border border-[#B9A88F] bg-white px-2.5 py-1.5 text-xs text-[#4B2B1D] outline-none focus:border-[#3E6594]"
                                />
                                <button
                                  onClick={() => addThreadMessage(c.id)}
                                  disabled={!threadReplyText.trim()}
                                  className="rounded-lg bg-[#2E527F] text-white px-3 py-1.5 text-xs font-bold hover:bg-[#24466E] disabled:opacity-40"
                                >
                                  Add
                                </button>
                              </div>

                              <div className="flex items-center gap-2 pt-1">
                                <button onClick={() => ignoreSocialContact(c.id)} className="text-xs font-bold text-[#755B4C] hover:text-[#4B2B1D]">Ignore</button>
                                <button onClick={() => startConvertSocialContact(c)} className="rounded-lg bg-[#16A34A] text-white px-3 py-1.5 text-xs font-bold hover:bg-[#15873F]">
                                  Convert to Lead (carries this whole thread)
                                </button>
                              </div>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
              )
            })()}
          </div>
        </div>
      ) : null}

      {/* ---- Task View -- sits right under the board on every tab. Not
          collapsible on purpose: this is the one thing a salesperson should
          never have to click to reveal. The add row stays open at the top --
          type, hit Enter, it's logged, ready for the next one. Merges real
          crm-tasks (completed via the real endpoint) with local follow-ups
          created when someone's marked "Done" on the board above. ---- */}
      <div className="rounded-2xl border border-[#2E527F] bg-[rgba(251,247,240,0.9)] p-5">
        <div className="flex items-center justify-between mb-3">
          <p className="font-extrabold text-[#4B2B1D] flex items-center gap-2">
            ☑️ Tasks
            {(followUps.length + realTasks.length) > 0 && (
              <span className="text-[10px] font-bold rounded-full bg-[#EDF2F7] text-[#2E527F] px-2 py-0.5">{followUps.length + realTasks.length} open</span>
            )}
          </p>
        </div>

        <div className="flex gap-2 mb-4">
          <input
            type="text"
            value={newTaskText}
            onChange={(e) => setNewTaskText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') addQuickTask() }}
            placeholder="Add a task or reminder and hit Enter..."
            className="flex-1 rounded-lg border border-[#B9A88F] bg-white px-3 py-2.5 text-sm text-[#4B2B1D] outline-none focus:border-[#3E6594] focus:ring-4 focus:ring-[#3E6594]/10"
          />
          <button
            onClick={addQuickTask}
            disabled={!newTaskText.trim() || savingTask}
            className="rounded-lg bg-[#2E527F] text-white px-4 py-2.5 text-sm font-bold hover:bg-[#24466E] disabled:opacity-40 transition"
          >
            {savingTask ? 'Adding...' : 'Add'}
          </button>
        </div>

        {realTasks.length > 0 && (
          <div className="flex gap-2 mb-3">
            {([
              ['all', `All (${realTasks.length})`],
              ['auto', `Auto (${realTasks.filter((t) => !!t.system_source || !!t.source_automation_rule_id).length})`],
              ['manual', `Manual (${realTasks.filter((t) => !t.system_source && !t.source_automation_rule_id).length})`],
            ] as [typeof taskFilter, string][]).map(([id, label]) => (
              <button
                key={id}
                onClick={() => setTaskFilter(id)}
                className={`rounded-full px-3 py-1.5 text-[11px] font-bold transition ${
                  taskFilter === id ? 'bg-[#2E527F] text-white' : 'bg-[#FBF6EE] border border-[#B9A88F] text-[#4B2B1D] hover:bg-white'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        )}

        {followUps.length === 0 && realTasks.length === 0 ? (
          <p className="text-xs text-[#755B4C]">Nothing open. Tasks you add here, and anyone you mark "✓ Done" on the board above, show up in this list.</p>
        ) : (
          <div className="space-y-2">
            {followUps.map((f) => (
              <div key={`f-${f.customerId}`} className="rounded-xl border border-[#E4D8C9] bg-white p-3 flex items-start gap-3">
                <button onClick={() => dismissFollowUp(f.customerId)} className="mt-0.5 flex-shrink-0 text-[#755B4C] hover:text-[#16A34A]" title="Mark done">
                  <Square className="h-4 w-4" />
                </button>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-extrabold text-[#4B2B1D] flex items-center gap-1.5 flex-wrap">
                    {f.name}
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-[#F5F0E8] text-[#9A7E6F]">This device only</span>
                  </p>
                  {f.customerId > 0 ? (
                    <>
                      <p className="text-[10px] text-[#9A7E6F] mb-1.5">Moved off Pipeline {new Date(f.createdAt).toLocaleDateString()}</p>
                      <input
                        type="text"
                        value={f.note}
                        onChange={(e) => updateFollowUpNote(f.customerId, e.target.value)}
                        placeholder="What's the next step? (e.g. call back Thursday)"
                        className="w-full rounded-lg border border-[#E4D8C9] bg-[#FBF7F0] px-2.5 py-1.5 text-xs text-[#4B2B1D] outline-none focus:border-[#3E6594]"
                      />
                    </>
                  ) : (
                    <p className="text-[10px] text-[#9A7E6F]">Added {new Date(f.createdAt).toLocaleDateString()}</p>
                  )}
                </div>
                {f.customerId > 0 && (
                  <button
                    onClick={() => addToWorkingSet([f.customerId])}
                    title="Put back on the Pipeline board"
                    className="text-[10px] font-bold text-[#2E527F] hover:underline flex-shrink-0"
                  >
                    Back to Pipeline
                  </button>
                )}
              </div>
            ))}
            {filteredRealTasks.length === 0 && realTasks.length > 0 && (
              <p className="text-xs text-[#755B4C] py-2">No tasks match this filter.</p>
            )}
            {filteredRealTasks.map((t) => {
              const tag = taskSourceTag(t)
              return (
                <div key={`t-${t.id}`} className="rounded-xl border border-[#E4D8C9] bg-white p-3 flex items-start gap-3">
                  <button onClick={() => completeRealTask(t.id)} className="mt-0.5 flex-shrink-0 text-[#755B4C] hover:text-[#16A34A]" title="Mark done">
                    <Square className="h-4 w-4" />
                  </button>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-extrabold text-[#4B2B1D] flex items-center gap-1.5 flex-wrap">
                      {t.title}
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{ backgroundColor: tag.bg, color: tag.text }}>{tag.label}</span>
                    </p>
                    {t.description && <p className="text-[10.5px] text-[#755B4C] mt-0.5">{t.description}</p>}
                    {t.customer_name && <p className="text-[10px] text-[#9A7E6F] mt-0.5">{t.customer_name}</p>}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ---- Everything else, folded away by default since it's not a
          look-every-time thing. ---- */}
      <div className="space-y-4">
          <CollapsibleSection
            title="Send & Automate"
            icon="⚡"
            subtitle="Enroll people in a follow-up sequence -- one button instead of three sections to dig through"
          >
            <div className="space-y-4">
              {/* The one action -- pick who, pick what, go. Replaces browsing
                  Automations/Activities/Templates as three separate places. */}
              <div className="rounded-xl border border-[#3E6594] bg-[#EAF0F7] p-4">
                <p className="text-xs font-bold text-[#2E527F] mb-3">
                  {sendTargetIds.length > 0
                    ? `Sending to ${sendTargetIds.length} ${selectedIds.length > 0 ? 'selected' : 'in your Pipeline'}`
                    : 'Tick people (or build a Pipeline working set) to enable sending'}
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={selectedRuleId}
                    onChange={(e) => setSelectedRuleId(e.target.value ? Number(e.target.value) : '')}
                    className="rounded-lg border border-[#B9A88F] bg-white px-3 py-2 text-sm font-medium text-[#4B2B1D] outline-none focus:border-[#3E6594]"
                  >
                    <option value="">Choose an automation...</option>
                    {automationRules.map((r) => (
                      <option key={r.id} value={r.id}>{r.name}</option>
                    ))}
                  </select>
                  <button
                    onClick={enrollTargets}
                    disabled={!selectedRuleId || sendTargetIds.length === 0 || enrolling}
                    className="flex items-center gap-1.5 rounded-lg bg-[#2E527F] text-white px-4 py-2 text-sm font-bold hover:bg-[#24466E] disabled:opacity-40 transition"
                  >
                    <Send className="h-3.5 w-3.5" />
                    {enrolling ? 'Enrolling...' : 'Enroll'}
                  </button>
                  {enrollMessage && <span className="text-xs font-bold text-[#2E527F]">{enrollMessage}</span>}
                </div>
              </div>

              {/* Manage the rules themselves -- still here, just underneath
                  the action instead of being its own top-level tab. */}
              <AutomationBuilder />

              {/* Templates + activity log, kept as reference/context. */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="md:col-span-2 rounded-xl border border-[#E4D8C9] bg-white p-5">
                  <h4 className="font-extrabold text-[#4B2B1D] mb-1 text-sm">Templates</h4>
                  <p className="text-xs text-[#755B4C] mb-4">Sent from an individual customer's profile, where there's a specific email/phone to send to.</p>
                  <div className="space-y-2">
                    {templates.map((t) => (
                      <div key={t.id} className="rounded-lg bg-[#FBF7F0] px-4 py-3 border border-[#E4D8C9]">
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-bold text-[#4B2B1D]">{t.name}</p>
                          <span className="text-[10px] font-bold uppercase text-[#755B4C] bg-[#F5F0E8] px-2 py-0.5 rounded-full">{t.channel}</span>
                        </div>
                        <p className="text-xs text-[#755B4C] mt-1 truncate">{t.body}</p>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="rounded-xl border border-[#E4D8C9] bg-white p-5">
                  <h4 className="font-extrabold text-[#4B2B1D] mb-4 text-sm">Recent Activity</h4>
                  <div className="space-y-3 text-sm max-h-96 overflow-y-auto">
                    {recentActivity.length === 0 && <p className="text-xs text-[#2E527F]">No activity logged yet.</p>}
                    {recentActivity.map((a) => (
                      <div key={a.id} className="bg-[#FBF7F0] rounded-lg p-3">
                        <p className="font-bold text-[#4B2B1D] text-xs">{a.customer_name} -- {a.type === 'stage_change' ? 'Stage changed' : a.subject || a.type}</p>
                        <p className="text-xs text-[#755B4C]">{new Date(a.created_at).toLocaleString()}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </CollapsibleSection>

          <CollapsibleSection
            title="Sales Assets"
            icon="📁"
            subtitle="One-click trackable links for pricing sheets, sample menus, testimonials -- see who's actually opened what"
          >
            <div className="space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex gap-2 flex-wrap">
                  {([
                    ['all', `All (${salesAssets.length})`],
                    ...(['pricing_offers', 'menus_samples', 'social_proof', 'partnerships'] as SalesAsset['category'][]).map(
                      (c) => [c, `${ASSET_CATEGORY_LABEL[c]} (${salesAssets.filter((a) => a.category === c).length})`] as [string, string]
                    ),
                  ] as [SalesAsset['category'] | 'all', string][]).map(([id, label]) => (
                    <button
                      key={id}
                      onClick={() => setAssetCategoryFilter(id)}
                      className={`rounded-full px-3 py-1.5 text-[11px] font-bold transition ${
                        assetCategoryFilter === id ? 'bg-[#2E527F] text-white' : 'bg-[#FBF6EE] border border-[#B9A88F] text-[#4B2B1D] hover:bg-white'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <button
                  onClick={() => setShowAddAsset((v) => !v)}
                  className="flex items-center gap-1.5 rounded-lg bg-[#2E527F] text-white px-3 py-2 text-xs font-bold hover:bg-[#24466E] transition"
                >
                  <Plus className="h-3.5 w-3.5" /> Add Asset
                </button>
              </div>

              {showAddAsset && (
                <div className="rounded-xl border border-[#3E6594] bg-[#EAF0F7] p-4 space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <input
                      type="text"
                      value={newAsset.title}
                      onChange={(e) => setNewAsset({ ...newAsset, title: e.target.value })}
                      placeholder="Title (e.g. 'Fall Pricing Sheet')"
                      className="rounded-lg border border-[#B9A88F] bg-white px-3 py-2 text-sm text-[#4B2B1D] outline-none focus:border-[#3E6594]"
                    />
                    <input
                      type="text"
                      value={newAsset.credit}
                      onChange={(e) => setNewAsset({ ...newAsset, credit: e.target.value })}
                      placeholder="Credit, optional (e.g. 'shot by Daniela')"
                      className="rounded-lg border border-[#B9A88F] bg-white px-3 py-2 text-sm text-[#4B2B1D] outline-none focus:border-[#3E6594]"
                    />
                    <select
                      value={newAsset.category}
                      onChange={(e) => setNewAsset({ ...newAsset, category: e.target.value as SalesAsset['category'] })}
                      className="rounded-lg border border-[#B9A88F] bg-white px-3 py-2 text-sm text-[#4B2B1D] outline-none focus:border-[#3E6594]"
                    >
                      {(['pricing_offers', 'menus_samples', 'social_proof', 'partnerships'] as SalesAsset['category'][]).map((c) => (
                        <option key={c} value={c}>{ASSET_CATEGORY_LABEL[c]}</option>
                      ))}
                    </select>
                    <select
                      value={newAsset.asset_type}
                      onChange={(e) => setNewAsset({ ...newAsset, asset_type: e.target.value as SalesAsset['asset_type'] })}
                      className="rounded-lg border border-[#B9A88F] bg-white px-3 py-2 text-sm text-[#4B2B1D] outline-none focus:border-[#3E6594]"
                    >
                      <option value="link">Link</option>
                      <option value="pdf">PDF</option>
                      <option value="image">Image</option>
                      <option value="video">Video</option>
                    </select>
                    <input
                      type="text"
                      value={newAsset.source_url}
                      onChange={(e) => setNewAsset({ ...newAsset, source_url: e.target.value })}
                      placeholder="Source URL (e.g. a Google Drive share link)"
                      className="col-span-2 rounded-lg border border-[#B9A88F] bg-white px-3 py-2 text-sm text-[#4B2B1D] outline-none focus:border-[#3E6594]"
                    />
                  </div>
                  <div className="flex justify-end gap-2">
                    <button onClick={() => setShowAddAsset(false)} className="rounded-lg px-3 py-2 text-xs font-bold text-[#755B4C] hover:bg-white/50 transition">Cancel</button>
                    <button
                      onClick={addSalesAsset}
                      disabled={!newAsset.title.trim() || !newAsset.source_url.trim() || savingAsset}
                      className="rounded-lg bg-[#2E527F] text-white px-4 py-2 text-xs font-bold hover:bg-[#24466E] disabled:opacity-40 transition"
                    >
                      {savingAsset ? 'Saving...' : 'Save Asset'}
                    </button>
                  </div>
                </div>
              )}

              {filteredSalesAssets.length === 0 ? (
                <p className="text-xs text-[#755B4C]">No assets in this category yet. Add a pricing sheet, sample menu, or testimonial to start tracking who opens what.</p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {filteredSalesAssets.map((asset) => {
                    const Icon = ASSET_TYPE_ICON[asset.asset_type] || FileText
                    const sent = Number(asset.sent_count) || 0
                    const scans = Number(asset.scan_count) || 0
                    const opened = Number(asset.opened_count) || 0
                    return (
                      <div key={asset.id} className="rounded-xl border border-[#E4D8C9] bg-white p-3 flex items-start gap-3">
                        <div className="rounded-lg bg-[#EAF0F7] p-2 flex-shrink-0">
                          <Icon className="h-4 w-4 text-[#2E527F]" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-extrabold text-[#4B2B1D] truncate">{asset.title}</p>
                          <p className="text-[10px] text-[#9A7E6F]">{ASSET_CATEGORY_LABEL[asset.category]}{asset.credit ? ` · ${asset.credit}` : ''}</p>
                          <div className="flex items-center gap-3 mt-1.5 text-[10px] text-[#755B4C]">
                            <span className="flex items-center gap-1"><Send className="h-2.5 w-2.5" /> {sent} sent</span>
                            <span className="flex items-center gap-1"><Eye className="h-2.5 w-2.5" /> {sent > 0 ? `${opened} opened` : 'N/A'}</span>
                            {scans > 0 && <span>{scans} scanned</span>}
                          </div>
                        </div>
                        <button
                          onClick={() => shareSalesAsset(asset)}
                          disabled={sharingAssetId === asset.id}
                          className="flex items-center gap-1 rounded-lg border border-[#B9A88F] px-2.5 py-1.5 text-[10px] font-bold text-[#2E527F] hover:bg-[#EAF0F7] disabled:opacity-40 transition flex-shrink-0"
                          title="Create a trackable link and copy it"
                        >
                          <Copy className="h-3 w-3" />
                          {copiedAssetId === asset.id ? 'Copied!' : sharingAssetId === asset.id ? '...' : 'Copy link'}
                        </button>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </CollapsibleSection>
      </div>

      {/* ---- NEW: Quick Add Lead modal ---- */}
      {showQuickAdd && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-[rgba(251,247,240,0.9)] rounded-2xl border border-[#2E527F] max-w-md w-full my-8">
            <div className="sticky top-0 bg-[rgba(251,247,240,0.9)] border-b border-[#E4D8C9] p-6 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-extrabold text-[#4B2B1D]">{convertingContactId ? 'Convert to Lead' : 'Quick Add Lead'}</h2>
                <p className="text-xs text-[#755B4C] mt-0.5">
                  {convertingContactId ? 'From the Social Inbox -- add a phone/email once you get one.' : "For a cold lead -- fill in the rest once they're further along."}
                </p>
              </div>
              <button onClick={() => { setShowQuickAdd(false); resetQuickAdd(); setConvertingContactId(null) }} className="text-[#755B4C] hover:text-[#4B2B1D]">
                <X className="h-6 w-6" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              {duplicateMatch ? (
                <div className="rounded-xl border border-[#F0C5B8] bg-[#FFF4F0] p-4 space-y-3">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="h-4 w-4 text-[#C97C34] flex-shrink-0 mt-0.5" />
                    <p className="text-sm text-[#8A4A1F]">
                      <b>{duplicateMatch.name}</b> already exists with this phone or email.
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => { setDuplicateMatch(null); setShowQuickAdd(false); setSelectedCustomer(duplicateMatch); setShowCustomerDetail(true); resetQuickAdd() }}
                      className="flex-1 rounded-lg border border-[#B9A88F] bg-white px-3 py-2 text-xs font-bold text-[#4B2B1D] hover:bg-[#F8F2E8]"
                    >
                      Open existing card
                    </button>
                    <button
                      onClick={() => submitQuickAdd(true)}
                      disabled={savingQuickAdd}
                      className="flex-1 rounded-lg bg-[#C97C34] text-white px-3 py-2 text-xs font-bold hover:bg-[#B36A28] disabled:opacity-50"
                    >
                      Add anyway
                    </button>
                  </div>
                </div>
              ) : null}

              <div>
                <label className="block text-xs font-bold text-[#4B2B1D] mb-2">Name *</label>
                <input
                  type="text"
                  value={quickAdd.name}
                  onChange={(e) => setQuickAdd((p) => ({ ...p, name: e.target.value }))}
                  placeholder="Lead name"
                  className="w-full rounded-xl border border-[#B9A88F] bg-white px-3 py-2.5 text-[#4B2B1D] outline-none focus:border-[#3E6594] focus:ring-4 focus:ring-[#3E6594]/10"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-[#4B2B1D] mb-2">Phone</label>
                  <input
                    type="tel"
                    value={quickAdd.phone}
                    onChange={(e) => setQuickAdd((p) => ({ ...p, phone: e.target.value }))}
                    placeholder="(555) 123-4567"
                    className="w-full rounded-xl border border-[#B9A88F] bg-white px-3 py-2.5 text-[#4B2B1D] outline-none focus:border-[#3E6594] focus:ring-4 focus:ring-[#3E6594]/10"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-[#4B2B1D] mb-2">Email</label>
                  <input
                    type="email"
                    value={quickAdd.email}
                    onChange={(e) => setQuickAdd((p) => ({ ...p, email: e.target.value }))}
                    placeholder="email@example.com"
                    className="w-full rounded-xl border border-[#B9A88F] bg-white px-3 py-2.5 text-[#4B2B1D] outline-none focus:border-[#3E6594] focus:ring-4 focus:ring-[#3E6594]/10"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-[#4B2B1D] mb-2">
                  Source <span className="font-normal text-[#9A7E6F]">(which ambassador, which visit, which channel)</span>
                </label>
                {managedSources.length > 0 ? (
                  <select
                    value={quickAdd.source_id}
                    onChange={(e) => setQuickAdd((p) => ({ ...p, source_id: e.target.value }))}
                    className="w-full rounded-xl border border-[#B9A88F] bg-white px-3 py-2.5 text-[#4B2B1D] outline-none focus:border-[#3E6594] focus:ring-4 focus:ring-[#3E6594]/10"
                  >
                    <option value="">No specific source -- just pick a category below</option>
                    {(Object.keys(LEAD_SOURCE_LABEL) as LeadSource[]).map((cat) => {
                      const inCat = managedSources.filter((s) => s.category === cat)
                      if (inCat.length === 0) return null
                      return (
                        <optgroup key={cat} label={LEAD_SOURCE_LABEL[cat]}>
                          {inCat.map((s) => (
                            <option key={s.id} value={s.id}>{s.name}</option>
                          ))}
                        </optgroup>
                      )
                    })}
                  </select>
                ) : (
                  <p className="text-xs text-[#9A7E6F] mb-1">No sources created yet -- add one from the Lead Sources tab, or just pick a category below for now.</p>
                )}
              </div>

              {!quickAdd.source_id && (
                <div>
                  <label className="block text-xs font-bold text-[#4B2B1D] mb-2">Category</label>
                  <select
                    value={quickAdd.lead_source}
                    onChange={(e) => setQuickAdd((p) => ({ ...p, lead_source: e.target.value as LeadSource }))}
                    className="w-full rounded-xl border border-[#B9A88F] bg-white px-3 py-2.5 text-[#4B2B1D] outline-none focus:border-[#3E6594] focus:ring-4 focus:ring-[#3E6594]/10"
                  >
                    {(Object.keys(LEAD_SOURCE_LABEL) as LeadSource[]).map((s) => (
                      <option key={s} value={s}>{LEAD_SOURCE_LABEL[s]}</option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-[#4B2B1D] mb-2">Account Type</label>
                <div className="flex gap-2">
                  <button
                    onClick={() => setQuickAdd((p) => ({ ...p, account_type: 'individual' }))}
                    className={`flex-1 rounded-lg border px-3 py-2 text-sm font-bold transition ${
                      quickAdd.account_type === 'individual' ? 'border-[#2E527F] bg-[#EAF0F7] text-[#2E527F]' : 'border-[#B9A88F] bg-white text-[#755B4C]'
                    }`}
                  >
                    Individual
                  </button>
                  <button
                    onClick={() => setQuickAdd((p) => ({ ...p, account_type: 'business' }))}
                    className={`flex-1 rounded-lg border px-3 py-2 text-sm font-bold transition flex items-center justify-center gap-1.5 ${
                      quickAdd.account_type === 'business' ? 'border-[#2E527F] bg-[#EAF0F7] text-[#2E527F]' : 'border-[#B9A88F] bg-white text-[#755B4C]'
                    }`}
                  >
                    <Building2 className="h-3.5 w-3.5" /> Business
                  </button>
                </div>
              </div>

              {quickAdd.account_type === 'business' && (
                <div>
                  <label className="block text-xs font-bold text-[#4B2B1D] mb-2">Company Name</label>
                  <input
                    type="text"
                    value={quickAdd.company_name}
                    onChange={(e) => setQuickAdd((p) => ({ ...p, company_name: e.target.value }))}
                    placeholder="e.g. Southern Boom CrossFit"
                    className="w-full rounded-xl border border-[#B9A88F] bg-white px-3 py-2.5 text-[#4B2B1D] outline-none focus:border-[#3E6594] focus:ring-4 focus:ring-[#3E6594]/10"
                  />
                </div>
              )}

              {quickAddError && <p className="text-xs font-bold text-[#D62F3D]">{quickAddError}</p>}

              <div className="flex gap-3 pt-2 border-t border-[#E4D8C9]">
                <button
                  onClick={() => { setShowQuickAdd(false); resetQuickAdd(); setConvertingContactId(null) }}
                  className="flex-1 rounded-lg border border-[#B9A88F] bg-white px-4 py-3 text-sm font-extrabold text-[#4B2B1D] hover:bg-[#F8F2E8] transition"
                >
                  Cancel
                </button>
                <button
                  onClick={() => submitQuickAdd(false)}
                  disabled={savingQuickAdd || !!duplicateMatch}
                  className="flex-1 rounded-lg bg-[#16A34A] text-white px-4 py-3 text-sm font-extrabold hover:bg-[#15873F] disabled:opacity-50 transition"
                >
                  {savingQuickAdd ? 'Saving...' : 'Add Lead'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ---- Full Add/Edit Customer modal (unchanged from production) ---- */}
      {showAddCustomer && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-[rgba(251,247,240,0.9)] rounded-2xl border border-[#2E527F] max-w-3xl w-full my-8">
            <div className="sticky top-0 bg-[rgba(251,247,240,0.9)] border-b border-[#E4D8C9] p-6 flex items-center justify-between">
              <h2 className="text-2xl font-extrabold text-[#4B2B1D]">{editingCustomer ? 'Edit Customer' : 'Add New Customer'}</h2>
              <button
                onClick={() => {
                  setShowAddCustomer(false)
                  setEditingCustomer(null)
                  setFormData({
                    name: '', email: '', phone: '', address: '', apt_gate_code: '', payment_mode: '',
                    household_size: undefined, occupation: '', primary_goal: '', biggest_hurdle: '',
                    protein_preference: '', dietary_preference: '', dietary_restrictions: '', foods_to_avoid: '', notes: '',
                  })
                }}
                className="text-[#755B4C] hover:text-[#4B2B1D]"
              >
                <X className="h-6 w-6" />
              </button>
            </div>

            <div className="p-6 space-y-6 overflow-y-auto max-h-[calc(90vh-100px)]">
              <div>
                <h3 className="text-lg font-extrabold text-[#4B2B1D] mb-4">📋 Contact Information</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-[#4B2B1D] mb-2">Name *</label>
                    <input type="text" value={formData.name || ''} onChange={(e) => handleFormChange('name', e.target.value)} placeholder="Customer name" className="w-full rounded-xl border border-[#B9A88F] bg-white px-3 py-2.5 text-[#4B2B1D] outline-none focus:border-[#3E6594] focus:ring-4 focus:ring-[#3E6594]/10" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-[#4B2B1D] mb-2">Email</label>
                    <input type="email" value={formData.email || ''} onChange={(e) => handleFormChange('email', e.target.value)} placeholder="email@example.com" className="w-full rounded-xl border border-[#B9A88F] bg-white px-3 py-2.5 text-[#4B2B1D] outline-none focus:border-[#3E6594] focus:ring-4 focus:ring-[#3E6594]/10" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-[#4B2B1D] mb-2">Phone</label>
                    <input type="tel" value={formData.phone || ''} onChange={(e) => handleFormChange('phone', e.target.value)} placeholder="(555) 123-4567" className="w-full rounded-xl border border-[#B9A88F] bg-white px-3 py-2.5 text-[#4B2B1D] outline-none focus:border-[#3E6594] focus:ring-4 focus:ring-[#3E6594]/10" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-[#4B2B1D] mb-2">Payment Mode</label>
                    <input type="text" value={formData.payment_mode || ''} onChange={(e) => handleFormChange('payment_mode', e.target.value)} placeholder="e.g., Credit Card, ACH" className="w-full rounded-xl border border-[#B9A88F] bg-white px-3 py-2.5 text-[#4B2B1D] outline-none focus:border-[#3E6594] focus:ring-4 focus:ring-[#3E6594]/10" />
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-lg font-extrabold text-[#4B2B1D] mb-4">🏠 Address</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-[#4B2B1D] mb-2">Street Address</label>
                    <input type="text" value={formData.address || ''} onChange={(e) => handleFormChange('address', e.target.value)} placeholder="123 Main St" className="w-full rounded-xl border border-[#B9A88F] bg-white px-3 py-2.5 text-[#4B2B1D] outline-none focus:border-[#3E6594] focus:ring-4 focus:ring-[#3E6594]/10" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-[#4B2B1D] mb-2">Apt / Gate Code</label>
                    <input type="text" value={formData.apt_gate_code || ''} onChange={(e) => handleFormChange('apt_gate_code', e.target.value)} placeholder="Apt 5B or Gate: 1234" className="w-full rounded-xl border border-[#B9A88F] bg-white px-3 py-2.5 text-[#4B2B1D] outline-none focus:border-[#3E6594] focus:ring-4 focus:ring-[#3E6594]/10" />
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-lg font-extrabold text-[#4B2B1D] mb-4">👤 Personal Information</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-[#4B2B1D] mb-2">Household Size</label>
                    <input type="number" value={formData.household_size || ''} onChange={(e) => handleFormChange('household_size', e.target.value ? parseInt(e.target.value) : undefined)} placeholder="Number of people" className="w-full rounded-xl border border-[#B9A88F] bg-white px-3 py-2.5 text-[#4B2B1D] outline-none focus:border-[#3E6594] focus:ring-4 focus:ring-[#3E6594]/10" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-[#4B2B1D] mb-2">Occupation</label>
                    <input type="text" value={formData.occupation || ''} onChange={(e) => handleFormChange('occupation', e.target.value)} placeholder="e.g., Software Engineer" className="w-full rounded-xl border border-[#B9A88F] bg-white px-3 py-2.5 text-[#4B2B1D] outline-none focus:border-[#3E6594] focus:ring-4 focus:ring-[#3E6594]/10" />
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-lg font-extrabold text-[#4B2B1D] mb-4">🎯 Sales & Goals</h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-[#4B2B1D] mb-2">Pipeline Stage</label>
                    <select value={formData.sales_pipeline_stage || 'prospect'} onChange={(e) => handleFormChange('sales_pipeline_stage', e.target.value as any)} className="w-full rounded-xl border border-[#B9A88F] bg-white px-3 py-2.5 text-[#4B2B1D] outline-none focus:border-[#3E6594] focus:ring-4 focus:ring-[#3E6594]/10">
                      <option value="prospect">Prospect</option>
                      <option value="engaged">Engaged</option>
                      <option value="trial">Trial</option>
                      <option value="active">Active</option>
                      <option value="at_risk">At Risk</option>
                      <option value="churned">Churned</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-[#4B2B1D] mb-2">Win Probability (%)</label>
                    <input type="number" min="0" max="100" value={formData.conversion_probability || 0} onChange={(e) => handleFormChange('conversion_probability', parseInt(e.target.value))} placeholder="0-100" className="w-full rounded-xl border border-[#B9A88F] bg-white px-3 py-2.5 text-[#4B2B1D] outline-none focus:border-[#3E6594] focus:ring-4 focus:ring-[#3E6594]/10" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-[#4B2B1D] mb-2">Primary Goal</label>
                    <input type="text" value={formData.primary_goal || ''} onChange={(e) => handleFormChange('primary_goal', e.target.value)} placeholder="e.g., Weight loss, Muscle gain, Healthier lifestyle" className="w-full rounded-xl border border-[#B9A88F] bg-white px-3 py-2.5 text-[#4B2B1D] outline-none focus:border-[#3E6594] focus:ring-4 focus:ring-[#3E6594]/10" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-[#4B2B1D] mb-2">Biggest Hurdle / Objection</label>
                    <input type="text" value={formData.biggest_hurdle || ''} onChange={(e) => handleFormChange('biggest_hurdle', e.target.value)} placeholder="e.g., Time management, Budget concerns" className="w-full rounded-xl border border-[#B9A88F] bg-white px-3 py-2.5 text-[#4B2B1D] outline-none focus:border-[#3E6594] focus:ring-4 focus:ring-[#3E6594]/10" />
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-lg font-extrabold text-[#4B2B1D] mb-4">🍽️ Dietary Information</h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-[#4B2B1D] mb-2">Protein Preference</label>
                    <input type="text" value={formData.protein_preference || ''} onChange={(e) => handleFormChange('protein_preference', e.target.value)} placeholder="e.g., Chicken, Beef, Fish, Vegetarian" className="w-full rounded-xl border border-[#B9A88F] bg-white px-3 py-2.5 text-[#4B2B1D] outline-none focus:border-[#3E6594] focus:ring-4 focus:ring-[#3E6594]/10" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-[#4B2B1D] mb-2">Dietary Preference</label>
                    <input type="text" value={formData.dietary_preference || ''} onChange={(e) => handleFormChange('dietary_preference', e.target.value)} placeholder="e.g., Keto, Vegan, Paleo, Mediterranean" className="w-full rounded-xl border border-[#B9A88F] bg-white px-3 py-2.5 text-[#4B2B1D] outline-none focus:border-[#3E6594] focus:ring-4 focus:ring-[#3E6594]/10" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-[#4B2B1D] mb-2">Dietary Restrictions</label>
                    <input type="text" value={formData.dietary_restrictions || ''} onChange={(e) => handleFormChange('dietary_restrictions', e.target.value)} placeholder="e.g., Gluten-free, Dairy-free, Nut allergy" className="w-full rounded-xl border border-[#B9A88F] bg-white px-3 py-2.5 text-[#4B2B1D] outline-none focus:border-[#3E6594] focus:ring-4 focus:ring-[#3E6594]/10" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-[#4B2B1D] mb-2">Foods to Avoid</label>
                    <textarea value={formData.foods_to_avoid || ''} onChange={(e) => handleFormChange('foods_to_avoid', e.target.value)} placeholder="e.g., Spicy foods, Shellfish, Mushrooms" className="w-full rounded-xl border border-[#B9A88F] bg-white px-3 py-2.5 text-[#4B2B1D] outline-none focus:border-[#3E6594] focus:ring-4 focus:ring-[#3E6594]/10 resize-none h-20" />
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-lg font-extrabold text-[#4B2B1D] mb-4">📝 Notes</h3>
                <textarea value={formData.notes || ''} onChange={(e) => handleFormChange('notes', e.target.value)} placeholder="Any additional notes about the customer..." className="w-full rounded-xl border border-[#B9A88F] bg-white px-3 py-2.5 text-[#4B2B1D] outline-none focus:border-[#3E6594] focus:ring-4 focus:ring-[#3E6594]/10 resize-none h-24" />
              </div>

              <div className="flex gap-3 pt-4 border-t border-[#E4D8C9]">
                <button
                  onClick={() => {
                    setShowAddCustomer(false)
                    setEditingCustomer(null)
                    setFormData({
                      name: '', email: '', phone: '', address: '', apt_gate_code: '', payment_mode: '',
                      household_size: undefined, occupation: '', primary_goal: '', biggest_hurdle: '',
                      protein_preference: '', dietary_preference: '', dietary_restrictions: '', foods_to_avoid: '', notes: '',
                    })
                  }}
                  className="flex-1 rounded-lg border border-[#B9A88F] bg-white px-4 py-3 text-sm font-extrabold text-[#4B2B1D] hover:bg-[#F8F2E8] transition"
                >
                  Cancel
                </button>
                <button onClick={handleSaveCustomer} className="flex-1 rounded-lg bg-[#16A34A] text-white px-4 py-3 text-sm font-extrabold hover:bg-[#15873F] disabled:opacity-50 transition">
                  {editingCustomer ? 'Update Customer' : 'Add Customer'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Customer Detail Modal */}
      {showCustomerDetail && selectedCustomer && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-[rgba(251,247,240,0.9)] rounded-2xl border border-[#2E527F] max-w-3xl w-full my-8">
            <div className="sticky top-0 bg-[rgba(251,247,240,0.9)] border-b border-[#E4D8C9] p-6 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <h2 className="text-2xl font-extrabold text-[#4B2B1D]">{selectedCustomer.name}</h2>
                {/* Always shown, same as the list/board cards -- defaults to
                    Organic so every profile carries this tag, not just the
                    ones we've explicitly tagged so far. */}
                <LeadSourceBadge source={leadMeta[selectedCustomer.id]?.lead_source} />
              </div>
              <button onClick={() => setShowCustomerDetail(false)} className="text-[#755B4C] hover:text-[#4B2B1D]">
                <X className="h-6 w-6" />
              </button>
            </div>

            <div className="p-6 space-y-6 overflow-y-auto max-h-[calc(90vh-100px)]">
              {/* NEW: lead source / account type -- always shown, since every
                  profile carries a source tag now, and reassignable right
                  here without a trip to the Lead Sources tab. */}
              <div>
                <h3 className="text-lg font-extrabold text-[#4B2B1D] mb-4">🧭 Lead Source & Account <span className="text-xs font-normal text-[#755B4C]">(this device only)</span></h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="rounded-lg bg-white p-4">
                    <p className="text-xs font-bold text-[#755B4C]">Source</p>
                    <div className="mt-1"><LeadSourceBadge source={leadMeta[selectedCustomer.id]?.lead_source} /></div>
                    {(() => {
                      const meta = leadMeta[selectedCustomer.id]
                      const named = managedSources.find((s) => s.id === meta?.source_id)
                      if (named) return <p className="text-sm font-bold text-[#4B2B1D] mt-2">{named.name}</p>
                      if (meta?.source_detail) return <p className="text-sm text-[#4B2B1D] mt-2">{meta.source_detail}</p>
                      return null
                    })()}
                    {managedSources.length > 0 && (
                      <select
                        value={leadMeta[selectedCustomer.id]?.source_id || ''}
                        onChange={(e) => e.target.value && assignSourceToCustomer(selectedCustomer.id, e.target.value)}
                        className="mt-2 w-full rounded-lg border border-[#E4D8C9] bg-[#FBF7F0] px-2 py-1.5 text-xs text-[#4B2B1D] outline-none focus:border-[#3E6594]"
                      >
                        <option value="">Assign a specific source...</option>
                        {(Object.keys(LEAD_SOURCE_LABEL) as LeadSource[]).map((cat) => {
                          const inCat = managedSources.filter((s) => s.category === cat)
                          if (inCat.length === 0) return null
                          return (
                            <optgroup key={cat} label={LEAD_SOURCE_LABEL[cat]}>
                              {inCat.map((s) => (
                                <option key={s.id} value={s.id}>{s.name}</option>
                              ))}
                            </optgroup>
                          )
                        })}
                      </select>
                    )}
                  </div>
                  {leadMeta[selectedCustomer.id]?.account_type === 'business' && (
                    <div className="rounded-lg bg-white p-4">
                      <p className="text-xs font-bold text-[#755B4C]">Account Type</p>
                      <p className="text-sm font-medium text-[#4B2B1D] mt-1 flex items-center gap-1.5"><Building2 className="h-3.5 w-3.5" /> {leadMeta[selectedCustomer.id]?.company_name || 'Business'}</p>
                    </div>
                  )}
                </div>
              </div>

              <div>
                <h3 className="text-lg font-extrabold text-[#4B2B1D] mb-4">📋 Contact Information</h3>
                <div className="grid grid-cols-2 gap-4">
                  {selectedCustomer.email && (
                    <div className="rounded-lg bg-white p-4">
                      <p className="text-xs font-bold text-[#755B4C]">Email</p>
                      <p className="text-sm font-medium text-[#4B2B1D] mt-1">{selectedCustomer.email}</p>
                    </div>
                  )}
                  {selectedCustomer.phone && (
                    <div className="rounded-lg bg-white p-4">
                      <p className="text-xs font-bold text-[#755B4C]">Phone</p>
                      <p className="text-sm font-medium text-[#4B2B1D] mt-1">{selectedCustomer.phone}</p>
                    </div>
                  )}
                  {selectedCustomer.payment_mode && (
                    <div className="rounded-lg bg-white p-4">
                      <p className="text-xs font-bold text-[#755B4C]">Payment Mode</p>
                      <p className="text-sm font-medium text-[#4B2B1D] mt-1">{selectedCustomer.payment_mode}</p>
                    </div>
                  )}
                </div>
              </div>

              <CustomerAddressManager
                customer={selectedCustomer}
                apiUrl={apiUrl}
                token={token}
                onPrimaryChanged={(patch) => {
                  setSelectedCustomer((prev) => (prev ? { ...prev, ...patch } : prev))
                  setCustomers((prev) => prev.map((c) => (c.id === selectedCustomer.id ? { ...c, ...patch } : c)))
                }}
              />

              <div>
                <h3 className="text-lg font-extrabold text-[#4B2B1D] mb-4">👤 Personal Information</h3>
                <div className="grid grid-cols-2 gap-4">
                  {selectedCustomer.household_size && (
                    <div className="rounded-lg bg-white p-4">
                      <p className="text-xs font-bold text-[#755B4C]">Household Size</p>
                      <p className="text-sm font-medium text-[#4B2B1D] mt-1">{selectedCustomer.household_size} people</p>
                    </div>
                  )}
                  {selectedCustomer.occupation && (
                    <div className="rounded-lg bg-white p-4">
                      <p className="text-xs font-bold text-[#755B4C]">Occupation</p>
                      <p className="text-sm font-medium text-[#4B2B1D] mt-1">{selectedCustomer.occupation}</p>
                    </div>
                  )}
                </div>
              </div>

              <div>
                <h3 className="text-lg font-extrabold text-[#4B2B1D] mb-4">🎯 Goals & Preferences</h3>
                <div className="space-y-3">
                  {selectedCustomer.primary_goal && (
                    <div className="rounded-lg bg-white p-4">
                      <p className="text-xs font-bold text-[#755B4C]">Primary Goal</p>
                      <p className="text-sm font-medium text-[#4B2B1D] mt-1">{selectedCustomer.primary_goal}</p>
                    </div>
                  )}
                  {selectedCustomer.biggest_hurdle && (
                    <div className="rounded-lg bg-[#FFF4F4] p-4 border border-[#FFE4E8]">
                      <p className="text-xs font-bold text-[#D62F3D]">Biggest Hurdle</p>
                      <p className="text-sm font-medium text-[#4B2B1D] mt-1">{selectedCustomer.biggest_hurdle}</p>
                    </div>
                  )}
                </div>
              </div>

              <div>
                <h3 className="text-lg font-extrabold text-[#4B2B1D] mb-4">🍽️ Dietary Information</h3>
                <div className="space-y-3">
                  {selectedCustomer.protein_preference && (
                    <div className="rounded-lg bg-white p-4">
                      <p className="text-xs font-bold text-[#755B4C]">Protein Preference</p>
                      <p className="text-sm font-medium text-[#4B2B1D] mt-1">{selectedCustomer.protein_preference}</p>
                    </div>
                  )}
                  {selectedCustomer.dietary_preference && (
                    <div className="rounded-lg bg-white p-4">
                      <p className="text-xs font-bold text-[#755B4C]">Dietary Preference</p>
                      <p className="text-sm font-medium text-[#4B2B1D] mt-1">{selectedCustomer.dietary_preference}</p>
                    </div>
                  )}
                  {selectedCustomer.dietary_restrictions && (
                    <div className="rounded-lg bg-[#FFF4F4] p-4 border border-[#FFE4E8]">
                      <p className="text-xs font-bold text-[#D62F3D]">Restrictions</p>
                      <p className="text-sm font-medium text-[#4B2B1D] mt-1">{selectedCustomer.dietary_restrictions}</p>
                    </div>
                  )}
                  {selectedCustomer.foods_to_avoid && (
                    <div className="rounded-lg bg-[#FFF4F4] p-4 border border-[#FFE4E8]">
                      <p className="text-xs font-bold text-[#D62F3D]">Foods to Avoid</p>
                      <p className="text-sm font-medium text-[#4B2B1D] mt-1">{selectedCustomer.foods_to_avoid}</p>
                    </div>
                  )}
                </div>
              </div>

              <div>
                <h3 className="text-lg font-extrabold text-[#4B2B1D] mb-4">📊 Order History</h3>
                <div className="grid grid-cols-3 gap-3">
                  <div className="rounded-lg bg-white p-4 text-center">
                    <p className="text-xs text-[#755B4C] font-bold">Active Weeks</p>
                    <p className="text-2xl font-extrabold text-[#2E527F] mt-2">{selectedCustomer.weeks_active || 0}</p>
                  </div>
                  <div className="rounded-lg bg-white p-4 text-center">
                    <p className="text-xs text-[#755B4C] font-bold">Total Meals</p>
                    <p className="text-2xl font-extrabold text-[#D97706] mt-2">{selectedCustomer.total_meals_ordered || 0}</p>
                  </div>
                  <div className="rounded-lg bg-white p-4 text-center">
                    <p className="text-xs text-[#755B4C] font-bold">Lifetime Value</p>
                    <p className="text-2xl font-extrabold text-[#16A34A] mt-2">${getLifetimeValue(selectedCustomer.lifetime_value_cents || 0)}</p>
                  </div>
                </div>
              </div>

              {selectedCustomer.notes && (
                <div>
                  <h3 className="text-lg font-extrabold text-[#4B2B1D] mb-4">📝 Notes</h3>
                  <div className="rounded-lg bg-white p-4">
                    <p className="text-sm text-[#4B2B1D]">{selectedCustomer.notes}</p>
                  </div>
                </div>
              )}

              <CustomerActivityPanel customerId={selectedCustomer.id} customerEmail={selectedCustomer.email} customerPhone={selectedCustomer.phone} />

              <div className="flex gap-3 pt-4 border-t border-[#E4D8C9]">
                <button
                  onClick={() => { openEditCustomer(selectedCustomer); setShowCustomerDetail(false) }}
                  className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-[#2E527F] text-white px-4 py-3 text-sm font-extrabold hover:bg-[#24466E] transition"
                >
                  <Edit className="h-4 w-4" />
                  Edit Profile
                </button>
                <button
                  onClick={() => { handleDeleteCustomer(selectedCustomer.id); setShowCustomerDetail(false) }}
                  className="flex-1 flex items-center justify-center gap-2 rounded-lg border border-[#D62F3D] text-[#D62F3D] px-4 py-3 text-sm font-extrabold hover:bg-[#FFF4F4] transition"
                >
                  <Trash2 className="h-4 w-4" />
                  Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
