
import React, { useEffect, useState } from 'react'
import axios from 'axios'
import { Plus, X, Trash2, Mail, MessageSquare, CheckSquare, Zap } from 'lucide-react'

type Step = {
  delay_days: number
  action_type: 'send_email' | 'send_sms' | 'create_task'
  template_id?: number | null
  task_title?: string
  task_description?: string
}

type Rule = {
  id: number
  name: string
  trigger_type: 'time_since_last_order' | 'stage_enter' | 'manual'
  trigger_config: { days?: number; stage?: string } | null
  is_active: boolean
  active_enrollments: number
  steps: Step[]
}

const STAGES = ['prospect', 'engaged', 'trial', 'active', 'at_risk', 'churned']
const ACTION_ICON = { send_email: Mail, send_sms: MessageSquare, create_task: CheckSquare }

export function AutomationBuilder() {
  const [rules, setRules] = useState<Rule[]>([])
  const [showBuilder, setShowBuilder] = useState(false)
  const [templates, setTemplates] = useState<any[]>([])

  const [name, setName] = useState('')
  const [triggerType, setTriggerType] = useState<Rule['trigger_type']>('manual')
  const [triggerDays, setTriggerDays] = useState('14')
  const [triggerStage, setTriggerStage] = useState('trial')
  const [steps, setSteps] = useState<Step[]>([])

  const token = localStorage.getItem('token')
  const apiUrl = import.meta.env.VITE_API_BASE_URL
  const headers = { Authorization: `Bearer ${token}` }

  const fetchRules = async () => {
    const res = await axios.get(`${apiUrl}/api/admin/automation-rules`, { headers })
    setRules(res.data.data || [])
  }
  const fetchTemplates = async () => {
    const res = await axios.get(`${apiUrl}/api/admin/communication-templates`, { headers })
    setTemplates(res.data.data || [])
  }

  useEffect(() => {
    fetchRules()
    fetchTemplates()
  }, [])

  const toggleRule = async (id: number) => {
    await axios.put(`${apiUrl}/api/admin/automation-rules/${id}/toggle`, {}, { headers })
    fetchRules()
  }

  const deleteRule = async (id: number) => {
    if (!confirm('Delete this automation? Active enrollments will stop.')) return
    await axios.delete(`${apiUrl}/api/admin/automation-rules/${id}`, { headers })
    fetchRules()
  }

  const addStep = (actionType: Step['action_type']) => {
    setSteps((prev) => [...prev, { delay_days: prev.length === 0 ? 0 : 3, action_type: actionType }])
  }
  const updateStep = (i: number, patch: Partial<Step>) => {
    setSteps((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)))
  }
  const removeStep = (i: number) => setSteps((prev) => prev.filter((_, idx) => idx !== i))

  const resetBuilder = () => {
    setName('')
    setTriggerType('manual')
    setTriggerDays('14')
    setTriggerStage('trial')
    setSteps([])
    setShowBuilder(false)
  }

  const save = async () => {
    if (!name.trim() || steps.length === 0) return
    const trigger_config = triggerType === 'time_since_last_order' ? { days: Number(triggerDays) } : triggerType === 'stage_enter' ? { stage: triggerStage } : null
    await axios.post(
      `${apiUrl}/api/admin/automation-rules`,
      { name: name.trim(), trigger_type: triggerType, trigger_config, steps },
      { headers }
    )
    resetBuilder()
    fetchRules()
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs text-[#755B4C]">{rules.length} sequences -- {rules.filter((r) => r.is_active).length} active</p>
        <button
          onClick={() => setShowBuilder(true)}
          className="flex items-center gap-1.5 h-8 px-3 rounded-lg bg-[#2E527F] text-white text-xs font-bold hover:bg-[#24466E]"
        >
          <Plus className="h-3.5 w-3.5" /> New automation
        </button>
      </div>

      <div className="space-y-3">
        {rules.map((rule) => (
          <div key={rule.id} className="rounded-2xl border border-[#CDBDA8] bg-[#FBF7F0] p-4">
            <div className="flex items-start justify-between mb-3">
              <div>
                <p className="font-extrabold text-[#4B2B1D] text-sm">{rule.name}</p>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-[10px] font-bold bg-white border border-[#CDBDA8] text-[#755B4C] px-2 py-0.5 rounded-full">
                    {rule.trigger_type === 'time_since_last_order'
                      ? `Trigger: no order in ${rule.trigger_config?.days ?? '?'} days`
                      : rule.trigger_type === 'stage_enter'
                        ? `Trigger: stage -> ${rule.trigger_config?.stage}`
                        : 'Trigger: manual only'}
                  </span>
                  {rule.active_enrollments > 0 && (
                    <span className="text-[10px] font-bold bg-[#E8EEF5] text-[#2E527F] px-2 py-0.5 rounded-full">
                      {rule.active_enrollments} in progress
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => toggleRule(rule.id)} className="relative w-9 h-5 rounded-full transition" style={{ background: rule.is_active ? '#16A34A' : '#D4D4D4' }}>
                  <div className="absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all" style={{ left: rule.is_active ? '18px' : '2px' }} />
                </button>
                <button onClick={() => deleteRule(rule.id)} className="text-[#D62F3D] hover:bg-[#FFF4F4] p-1 rounded">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
            <div className="flex gap-2 overflow-x-auto">
              {rule.steps.map((s, i) => {
                const Icon = ACTION_ICON[s.action_type]
                return (
                  <div key={i} className="shrink-0 bg-white rounded-lg px-3 py-2 text-center min-w-[110px]">
                    <p className="text-[9px] font-extrabold text-[#9A8774]">DAY {s.delay_days}</p>
                    <p className="text-[10px] font-bold text-[#2E527F] flex items-center justify-center gap-1 mt-0.5">
                      <Icon className="h-3 w-3" />
                      {s.action_type === 'create_task' ? s.task_title || 'Task' : s.action_type === 'send_email' ? 'Auto-send email' : 'Auto-send SMS'}
                    </p>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      {showBuilder && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-[#FBF7F0] rounded-2xl border border-[#CDBDA8] max-w-2xl w-full my-8">
            <div className="sticky top-0 bg-[#FBF7F0] border-b border-[#E4D8C9] p-5 flex items-center justify-between">
              <h2 className="text-xl font-extrabold text-[#4B2B1D] flex items-center gap-2">
                <Zap className="h-5 w-5" /> New automation
              </h2>
              <button onClick={resetBuilder} className="text-[#755B4C]">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-bold text-[#4B2B1D] mb-1.5">Name</label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Win-back sequence"
                  className="w-full h-9 rounded-lg border border-[#B9A88F] bg-white px-3 text-sm text-[#4B2B1D] outline-none focus:border-[#3E6594]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#4B2B1D] mb-1.5">Trigger</label>
                <select
                  value={triggerType}
                  onChange={(e) => setTriggerType(e.target.value as Rule['trigger_type'])}
                  className="w-full h-9 rounded-lg border border-[#B9A88F] bg-white px-3 text-sm text-[#4B2B1D]"
                >
                  <option value="manual">Manual only (trigger from a list)</option>
                  <option value="time_since_last_order">Time since last order</option>
                  <option value="stage_enter">Customer enters a pipeline stage</option>
                </select>
                {triggerType === 'time_since_last_order' && (
                  <div className="mt-2 flex items-center gap-2">
                    <span className="text-xs text-[#755B4C]">No order in</span>
                    <input
                      type="number"
                      value={triggerDays}
                      onChange={(e) => setTriggerDays(e.target.value)}
                      className="w-16 h-8 rounded-lg border border-[#B9A88F] bg-white px-2 text-sm text-center"
                    />
                    <span className="text-xs text-[#755B4C]">days</span>
                  </div>
                )}
                {triggerType === 'stage_enter' && (
                  <select
                    value={triggerStage}
                    onChange={(e) => setTriggerStage(e.target.value)}
                    className="mt-2 h-8 rounded-lg border border-[#B9A88F] bg-white px-2 text-sm"
                  >
                    {STAGES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div>
                <label className="block text-xs font-bold text-[#4B2B1D] mb-1.5">Steps</label>
                <div className="space-y-2">
                  {steps.map((step, i) => (
                    <div key={i} className="rounded-lg border border-[#D8CDBE] bg-white p-3">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-extrabold text-[#9A8774]">STEP {i + 1}</span>
                          <span className="text-xs text-[#755B4C]">delay</span>
                          <input
                            type="number"
                            value={step.delay_days}
                            onChange={(e) => updateStep(i, { delay_days: Number(e.target.value) })}
                            className="w-14 h-7 rounded border border-[#D8CDBE] px-1.5 text-xs text-center"
                          />
                          <span className="text-xs text-[#755B4C]">days</span>
                        </div>
                        <button onClick={() => removeStep(i)} className="text-[#D62F3D]">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      {(step.action_type === 'send_email' || step.action_type === 'send_sms') && (
                        <select
                          value={step.template_id || ''}
                          onChange={(e) => updateStep(i, { template_id: Number(e.target.value) })}
                          className="w-full h-8 rounded border border-[#D8CDBE] px-2 text-xs"
                        >
                          <option value="">Select a template...</option>
                          {templates
                            .filter((t) => t.channel === (step.action_type === 'send_email' ? 'email' : 'sms'))
                            .map((t) => (
                              <option key={t.id} value={t.id}>
                                {t.name}
                              </option>
                            ))}
                        </select>
                      )}
                      {step.action_type === 'create_task' && (
                        <div className="space-y-1.5">
                          <input
                            value={step.task_title || ''}
                            onChange={(e) => updateStep(i, { task_title: e.target.value })}
                            placeholder="Task title, e.g. Call {{first_name}}"
                            className="w-full h-8 rounded border border-[#D8CDBE] px-2 text-xs"
                          />
                          <input
                            value={step.task_description || ''}
                            onChange={(e) => updateStep(i, { task_description: e.target.value })}
                            placeholder="Description (optional)"
                            className="w-full h-8 rounded border border-[#D8CDBE] px-2 text-xs"
                          />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                <div className="flex gap-1.5 mt-2">
                  <button onClick={() => addStep('send_email')} className="flex-1 h-8 rounded-lg border border-[#B9A88F] bg-white text-xs font-bold text-[#4B2B1D]">
                    + Email step
                  </button>
                  <button onClick={() => addStep('send_sms')} className="flex-1 h-8 rounded-lg border border-[#B9A88F] bg-white text-xs font-bold text-[#4B2B1D]">
                    + SMS step
                  </button>
                  <button onClick={() => addStep('create_task')} className="flex-1 h-8 rounded-lg border border-[#B9A88F] bg-white text-xs font-bold text-[#4B2B1D]">
                    + Task step
                  </button>
                </div>
              </div>

              <div className="flex gap-3 pt-3 border-t border-[#E4D8C9]">
                <button onClick={resetBuilder} className="flex-1 h-10 rounded-lg border border-[#B9A88F] bg-white text-sm font-extrabold text-[#4B2B1D]">
                  Cancel
                </button>
                <button
                  onClick={save}
                  disabled={!name.trim() || steps.length === 0}
                  className="flex-1 h-10 rounded-lg bg-[#16A34A] text-white text-sm font-extrabold hover:bg-[#15873F] disabled:opacity-50"
                >
                  Create automation
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
