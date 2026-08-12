// Drops into the customer detail modal, replacing the old hardcoded fake
// "Recent Activity" block. Shows the real activity feed for this customer
// (emails, texts, calls, notes, pipeline stage changes) and a composer that
// actually sends email/SMS via the backend (SendGrid/Twilio), or just logs
// a call/note.

import React, { useEffect, useState } from 'react'
import axios from 'axios'
import { Mail, MessageSquare, Phone, StickyNote, ArrowRightLeft, Check, X as XIcon, Loader2 } from 'lucide-react'

type Activity = {
  id: number
  type: 'email' | 'sms' | 'call' | 'note' | 'stage_change'
  direction: 'outbound' | 'inbound' | null
  subject: string | null
  body: string | null
  status: 'sent' | 'failed' | 'logged'
  metadata: { from_stage?: string; to_stage?: string; error?: string } | null
  created_at: string
}

type Template = {
  id: number
  name: string
  channel: 'email' | 'sms'
  subject: string | null
  body: string
}

const TYPE_ICON = { email: Mail, sms: MessageSquare, call: Phone, note: StickyNote, stage_change: ArrowRightLeft }

function timeAgo(iso: string) {
  const diffMs = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diffMs / 60000)
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

export function CustomerActivityPanel({ customerId, customerEmail, customerPhone }: { customerId: number; customerEmail?: string; customerPhone?: string }) {
  const [activities, setActivities] = useState<Activity[]>([])
  const [loading, setLoading] = useState(true)
  const [channel, setChannel] = useState<'email' | 'sms' | 'call' | 'note'>('email')
  const [templates, setTemplates] = useState<Template[]>([])
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)

  const token = localStorage.getItem('token')
  const apiUrl = import.meta.env.VITE_API_BASE_URL

  const fetchActivities = async () => {
    setLoading(true)
    try {
      const res = await axios.get(`${apiUrl}/api/admin/customers/${customerId}/activities`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      setActivities(res.data.data || [])
    } catch (err) {
      console.error('Error fetching activities:', err)
    } finally {
      setLoading(false)
    }
  }

  const fetchTemplates = async (forChannel: 'email' | 'sms') => {
    try {
      const res = await axios.get(`${apiUrl}/api/admin/communication-templates`, {
        headers: { Authorization: `Bearer ${token}` },
        params: { channel: forChannel },
      })
      setTemplates(res.data.data || [])
    } catch (err) {
      console.error('Error fetching templates:', err)
    }
  }

  useEffect(() => {
    fetchActivities()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerId])

  useEffect(() => {
    if (channel === 'email' || channel === 'sms') fetchTemplates(channel)
    setSubject('')
    setBody('')
    setSendError(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel])

  const applyTemplate = (templateId: string) => {
    const t = templates.find((tpl) => tpl.id === Number(templateId))
    if (!t) return
    setSubject(t.subject || '')
    setBody(t.body)
  }

  const send = async () => {
    if (!body.trim()) return
    if (channel === 'email' && !customerEmail) return setSendError('This customer has no email on file.')
    if (channel === 'sms' && !customerPhone) return setSendError('This customer has no phone on file.')

    setSending(true)
    setSendError(null)
    try {
      await axios.post(
        `${apiUrl}/api/admin/customers/${customerId}/activities`,
        { type: channel, subject: channel === 'email' ? subject : undefined, body },
        { headers: { Authorization: `Bearer ${token}` } }
      )
      setBody('')
      setSubject('')
      await fetchActivities()
    } catch (err: any) {
      setSendError(err.response?.data?.error || 'Failed to send')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="rounded-2xl border border-[#CDBDA8] bg-[#FBF7F0] p-6">
      <h3 className="font-extrabold text-[#4B2B1D] mb-4 flex items-center gap-2">
        <MessageSquare className="h-5 w-5" /> Communication
      </h3>

      {/* Composer */}
      <div className="rounded-xl border border-[#B9A88F] bg-white p-3 mb-4">
        <div className="flex gap-1.5 mb-2">
          {(['email', 'sms', 'call', 'note'] as const).map((c) => (
            <button
              key={c}
              onClick={() => setChannel(c)}
              className={`flex-1 rounded-lg border px-2 py-1.5 text-[11px] font-bold capitalize transition ${
                channel === c ? 'border-[#3E6594] bg-[#E8EEF5] text-[#2E527F]' : 'border-[#D8CDBE] bg-white text-[#755B4C]'
              }`}
            >
              {c}
            </button>
          ))}
        </div>

        {(channel === 'email' || channel === 'sms') && templates.length > 0 && (
          <select
            onChange={(e) => e.target.value && applyTemplate(e.target.value)}
            defaultValue=""
            className="mb-2 h-8 w-full rounded-lg border border-[#D8CDBE] bg-[#FBF6EE] px-2 text-xs font-medium text-[#4B2B1D]"
          >
            <option value="">Use a template...</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        )}

        {channel === 'email' && (
          <input
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Subject"
            className="mb-2 h-8 w-full rounded-lg border border-[#D8CDBE] bg-[#FBF6EE] px-2 text-xs font-medium text-[#4B2B1D]"
          />
        )}

        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={
            channel === 'email' ? 'Email body...' : channel === 'sms' ? 'Text message...' : channel === 'call' ? 'What was discussed on the call...' : 'Note...'
          }
          className="mb-2 min-h-16 w-full resize-none rounded-lg border border-[#D8CDBE] bg-[#FBF6EE] px-2 py-2 text-xs font-medium text-[#4B2B1D]"
        />

        {sendError && <p className="mb-2 text-[11px] font-bold text-[#D62F3D]">{sendError}</p>}

        <button
          onClick={send}
          disabled={sending || !body.trim()}
          className="h-8 w-full rounded-lg bg-[#2E527F] text-xs font-bold text-white hover:bg-[#24466E] disabled:opacity-50 flex items-center justify-center gap-1.5"
        >
          {sending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {channel === 'email' ? 'Send Email' : channel === 'sms' ? 'Send Text' : channel === 'call' ? 'Log Call' : 'Save Note'}
        </button>
      </div>

      {/* Feed */}
      {loading ? (
        <p className="text-xs text-[#9A7E6F]">Loading activity...</p>
      ) : activities.length === 0 ? (
        <p className="text-xs text-[#9A7E6F]">No activity logged yet.</p>
      ) : (
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {activities.map((a) => {
            const Icon = TYPE_ICON[a.type]
            return (
              <div key={a.id} className="rounded-lg bg-white p-3">
                <div className="flex items-start gap-2">
                  <Icon className="h-3.5 w-3.5 mt-0.5 shrink-0 text-[#755B4C]" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="text-xs font-bold text-[#4B2B1D] capitalize">
                        {a.type === 'stage_change'
                          ? `Stage: ${a.metadata?.from_stage || '—'} → ${a.metadata?.to_stage}`
                          : a.subject || a.type}
                      </p>
                      {a.status === 'sent' && <Check className="h-3 w-3 text-[#16834A]" />}
                      {a.status === 'failed' && <XIcon className="h-3 w-3 text-[#D62F3D]" />}
                    </div>
                    {a.body && a.type !== 'stage_change' && <p className="text-[11px] text-[#755B4C] truncate">{a.body}</p>}
                    {a.status === 'failed' && a.metadata?.error && (
                      <p className="text-[10px] text-[#D62F3D]">{a.metadata.error}</p>
                    )}
                    <p className="text-[10px] text-[#9A7E6F] mt-0.5">{timeAgo(a.created_at)}</p>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
