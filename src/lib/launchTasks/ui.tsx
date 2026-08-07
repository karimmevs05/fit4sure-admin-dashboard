import React from 'react'
import type { Tag, Urgency } from './types'

// Design tokens -- exact values from the handoff doc / Recipes.tsx, reused
// verbatim rather than the (slightly different) named tailwind colors.
export const COLORS = {
  pageBg: '#E9DFD0',
  cardBg: '#FBF7F0',
  cardBorder: '#CDBDA8',
  divider: '#E4D8C9',
  textPrimary: '#4B2B1D',
  textSecondary: '#755B4C',
  textMuted: '#9A8774',
  blue: '#2E527F',
  blueHover: '#24466E',
  green: '#16813D',
  greenAlt: '#16834A',
  red: '#D62F3D',
  redBg: '#FFF4F5',
  redBorder: '#E8B4B9',
  orange: '#DC6500',
}

export const CARD_SHADOW = '0 8px 24px rgba(75,43,29,0.06)'

export const TAG_CLASSES: Record<Tag, string> = {
  operations: 'bg-[#E8EEF5] text-[#134DA1]',
  admin: 'bg-[#F3E8FE] text-[#7c3fc4]',
  marketing: 'bg-[#FFF0E1] text-[#DC6500]',
  sales: 'bg-[#EAF5EC] text-[#16834A]',
}

export const TAG_LABELS: Record<Tag, string> = {
  operations: 'Operations',
  admin: 'Admin',
  marketing: 'Marketing',
  sales: 'Sales',
}

export const URGENCY_DOT_CLASSES: Record<Urgency, string> = {
  critical: 'bg-[#D62F3D]',
  workon: 'bg-[#DC6500]',
  eventually: 'bg-[#16813D]',
}

export const URGENCY_LABELS: Record<Urgency, string> = {
  critical: 'Critical',
  workon: 'To work on',
  eventually: 'Eventually',
}

export function TagBadge({ tag, className = '' }: { tag: Tag; className?: string }) {
  return (
    <span className={`text-[11px] px-2 py-[3px] rounded-full whitespace-nowrap font-medium ${TAG_CLASSES[tag]} ${className}`}>
      {TAG_LABELS[tag]}
    </span>
  )
}

export function UrgencyDot({ urgency, onClick, size = 8 }: { urgency: Urgency; onClick?: () => void; size?: number }) {
  return (
    <span
      onClick={onClick}
      className={`inline-block rounded-full flex-shrink-0 ${URGENCY_DOT_CLASSES[urgency]} ${onClick ? 'cursor-pointer' : ''}`}
      style={{ width: size, height: size, marginTop: size === 8 ? 5 : 0 }}
      title={URGENCY_LABELS[urgency]}
    />
  )
}

export function OverdueBadge() {
  return (
    <span className="text-[10px] font-bold ml-1 px-1.5 py-0.5 rounded" style={{ background: COLORS.redBg, color: COLORS.red, border: `1px solid ${COLORS.redBorder}` }}>
      OVERDUE
    </span>
  )
}

export function DecisionBadge() {
  return (
    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ background: '#F3E8FE', color: '#7c3fc4' }}>
      NEEDS DECISION
    </span>
  )
}

export function Card({ children, className = '', style = {} }: { children: React.ReactNode; className?: string; style?: React.CSSProperties }) {
  return (
    <div className={`rounded-2xl ${className}`} style={{ background: COLORS.cardBg, boxShadow: CARD_SHADOW, ...style }}>
      {children}
    </div>
  )
}

export function AttentionIconDot({ icon }: { icon: 'overdue' | 'critical' | 'decision' }) {
  const colors = { overdue: COLORS.red, critical: COLORS.orange, decision: '#7c3fc4' }
  return <span className="w-[7px] h-[7px] rounded-full flex-shrink-0" style={{ background: colors[icon] }} />
}
