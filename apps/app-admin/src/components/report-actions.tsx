"use client"

import { useEffect, useMemo, useState } from "react"
import { Download, Mail, MessageCircle, Loader2, Plus, Trash2 } from "lucide-react"
import Link from "next/link"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { PhoneInput } from "@/components/ui/phone-input"
import { showToast } from "@/lib/toast"

interface ReportActionsProps {
  contractId: string
  report: {
    id: string
    fileUrl: string | null
    version: number | string
  }
  customerEmail?: string | null
  customerName?: string | null
  customerPhone?: string | null
  contactPersons?: Array<{
    id: string
    name?: string | null
    email?: string | null
    phone?: string | null
  }>
}

export function ReportActions({ contractId, report, customerEmail, customerName, customerPhone, contactPersons = [] }: ReportActionsProps) {
  const normalizeToE164 = (raw?: string | null) => {
    if (!raw) return null
    const trimmed = raw.trim()
    if (!trimmed) return null
    if (trimmed.startsWith('+')) {
      const compact = trimmed.replace(/\s+/g, '')
      return compact.length > 1 ? compact : null
    }

    const digits = trimmed.replace(/[^0-9]/g, '')
    if (!digits) return null

    if (digits.startsWith('65') && digits.length > 2) {
      return `+${digits}`
    }

    if (digits.length === 8) {
      return `+65${digits}`
    }

    return `+${digits}`
  }

  const createRecipient = (name = '', phone = '') => ({
    id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2),
    name,
    phone
  })

  const [isEmailing, setIsEmailing] = useState(false)
  const [isMessaging, setIsMessaging] = useState(false)
  const [emailDialogOpen, setEmailDialogOpen] = useState(false)
  const [whatsAppDialogOpen, setWhatsAppDialogOpen] = useState(false)
  const [emailTo, setEmailTo] = useState(customerEmail ?? "")
  const [emailCc, setEmailCc] = useState("")
  const [selectedContactIds, setSelectedContactIds] = useState<string[]>([])

  const contactOptions = contactPersons
  const contactsWithEmail = useMemo(
    () => contactPersons.filter((person) => Boolean(person.email && person.email.trim())),
    [contactPersons]
  )
  const contactPersonsWithPhone = useMemo(() => {
    return contactPersons.reduce<Array<{ id: string; name?: string | null; email?: string | null; phone?: string | null; normalizedPhone: string }>>(
      (acc, person) => {
        const normalizedPhone = normalizeToE164(person.phone)
        if (!normalizedPhone) return acc
        acc.push({ ...person, normalizedPhone })
        return acc
      },
      []
    )
  }, [contactPersons])

  useEffect(() => {
    if (!emailDialogOpen) {
      setSelectedContactIds([])
      setEmailTo(customerEmail ?? "")
      setEmailCc("")
    }
  }, [emailDialogOpen, customerEmail])
  const buildDefaultRecipients = () => {
    const fallback = '+959767210712'
    const normalizedPhone = normalizeToE164(customerPhone)
    return [createRecipient(customerName?.trim() || '', normalizedPhone || fallback)]
  }

  const [whatsAppRecipients, setWhatsAppRecipients] = useState<Array<{ id: string; name: string; phone: string }>>(buildDefaultRecipients)
  const [includeContactPersonIds, setIncludeContactPersonIds] = useState<string[]>(() =>
    contactPersonsWithPhone.map((person) => person.id)
  )

  useEffect(() => {
    setIncludeContactPersonIds(contactPersonsWithPhone.map((person) => person.id))
  }, [contactPersonsWithPhone])

  useEffect(() => {
    if (!whatsAppDialogOpen) {
      setWhatsAppRecipients(buildDefaultRecipients())
      setIncludeContactPersonIds(contactPersonsWithPhone.map((person) => person.id))
    }
  }, [whatsAppDialogOpen, contactPersonsWithPhone, customerName, customerPhone])

  const parseEmails = (value: string) =>
    value
      .split(/[,\n;]/)
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0)

  const buildEmailRecipients = () => {
    const typedTo = parseEmails(emailTo)
    const selectedEmails = contactsWithEmail
      .filter((person) => selectedContactIds.includes(person.id))
      .map((person) => person.email!.trim())
    const toSet = new Set<string>([...typedTo, ...selectedEmails])
    if (toSet.size === 0 && customerEmail && customerEmail.trim()) {
      toSet.add(customerEmail.trim())
    }
    const to = Array.from(toSet)
    const cc = Array.from(new Set(parseEmails(emailCc)))
    return { to, cc }
  }

  const handleSend = async (
    channel: "email" | "whatsapp",
    overrides?: { phone?: string; message?: string },
    options?: { silentSuccess?: boolean }
  ) => {
    if (!report.fileUrl) {
      showToast({ title: "Report file unavailable", variant: "error" })
      return
    }
    try {
      if (channel === "email") {
        setIsEmailing(true)
      } else {
        setIsMessaging(true)
      }

      const endpoint = `/api/contracts/${contractId}/reports/${report.id}/${channel}`

      const payload = channel === "email"
        ? (() => {
            const { to, cc } = buildEmailRecipients()
            if (to.length === 0) {
              throw new Error('Add at least one email recipient before sending.')
            }
            return { to, cc }
          })()
        : {
            phone: overrides?.phone,
            message: overrides?.message
          }

      if (channel === "whatsapp" && !payload.phone) {
        throw new Error('Phone number is required to send WhatsApp messages.')
      }

      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      })

      if (!response.ok) {
        const error = await response.json().catch(() => ({}))
        throw new Error(error.error || `Failed to send ${channel}`)
      }

      if (!options?.silentSuccess) {
        showToast({
          title: channel === "email" ? "Email sent" : "WhatsApp message sent",
          description: `Report ${channel === "email" ? "emailed" : "shared"} successfully.`,
          variant: "success"
        })
      }

      if (channel === "email") {
        setEmailDialogOpen(false)
      }
    } catch (error) {
      console.error(`Failed to send report via ${channel}`, error)
        showToast({
          title: `Failed to send via ${channel}`,
          description: error instanceof Error ? error.message : undefined,
          variant: "error"
        })
    } finally {
      if (channel === "email") {
        setIsEmailing(false)
      } else {
        setIsMessaging(false)
      }
    }
  }

  const versionLabel = `v${Number(report.version).toFixed(1)}`
  const defaultWhatsAppMessage = () => {
    const greeting = customerName ? `Hi ${customerName},` : "Hi there,"
    const lines = [
      greeting,
      `We've prepared your contract report (Version ${versionLabel}) for your review and records.`,
      report.fileUrl ? `Download: ${report.fileUrl}` : undefined,
      'If you have any questions or would like to discuss any details, please let us know—happy to help.',
      '— Property Stewards'
    ].filter(Boolean)
    return lines.join('\n\n')
  }

  const hasPrimaryEmail = buildEmailRecipients().to.length > 0

  const addRecipient = () => {
    setWhatsAppRecipients((prev) => [...prev, createRecipient()])
  }

  const updateRecipient = (id: string, field: 'name' | 'phone', value: string) => {
    setWhatsAppRecipients((prev) =>
      prev.map((recipient) =>
        recipient.id === id ? { ...recipient, [field]: field === 'phone' ? value : value } : recipient
      )
    )
  }

  const removeRecipient = (id: string) => {
    setWhatsAppRecipients((prev) => (prev.length <= 1 ? prev : prev.filter((recipient) => recipient.id !== id)))
  }

  const handleSendWhatsApp = async () => {
    const selectedContactRecipients = contactPersonsWithPhone
      .filter((person) => includeContactPersonIds.includes(person.id))
      .map((person) => ({
        id: person.id,
        name: person.name || '',
        phone: person.normalizedPhone,
        normalizedPhone: person.normalizedPhone,
      }))

    const manualRecipients = whatsAppRecipients
      .map((recipient) => {
        const normalizedPhone = normalizeToE164(recipient.phone)
        return normalizedPhone
          ? { ...recipient, normalizedPhone }
          : null
      })
      .filter((recipient): recipient is { id: string; name: string; phone: string; normalizedPhone: string } => recipient !== null)

    const uniqueRecipients = Array.from(
      new Map(
        [...selectedContactRecipients, ...manualRecipients].map((recipient) => [recipient.normalizedPhone, recipient])
      ).values()
    )

    if (uniqueRecipients.length === 0) {
      showToast({
        title: 'Phone numbers missing',
        description: 'Please provide at least one valid WhatsApp number.',
        variant: 'error'
      })
      return
    }

    try {
      setIsMessaging(true)
      for (const recipient of uniqueRecipients) {
        const personalizedMessage = (() => {
          const nameLine = recipient.name?.trim().length
            ? `Hi ${recipient.name.trim()},`
            : `Hi there,`
          const baseMessage = defaultWhatsAppMessage()
          const [, ...rest] = baseMessage.split('\n\n')
          return [nameLine, ...rest].join('\n\n')
        })()

        await handleSend(
          'whatsapp',
          {
            phone: recipient.normalizedPhone!,
            message: personalizedMessage
          },
          { silentSuccess: true }
        )
      }

      showToast({
        title: 'WhatsApp message sent',
        description: `${uniqueRecipients.length} recipient${uniqueRecipients.length > 1 ? 's' : ''} notified.`,
        variant: 'success'
      })

      setWhatsAppRecipients(buildDefaultRecipients())
      setIncludeContactPersonIds(contactPersonsWithPhone.map((person) => person.id))
      setWhatsAppDialogOpen(false)
    } finally {
      setIsMessaging(false)
    }
  }

  return (
    <div className="flex items-center gap-2">
      <Button asChild size="icon" variant="outline" disabled={!report.fileUrl} aria-label="Download report">
        <Link href={report.fileUrl ?? "#"} target="_blank" rel="noopener noreferrer">
          <Download className="h-4 w-4" />
        </Link>
      </Button>
      <Button
        size="icon"
        variant="outline"
        disabled={!report.fileUrl}
        onClick={() => {
          setEmailTo(customerEmail ?? "")
          setEmailCc("")
          setSelectedContactIds([])
          setEmailDialogOpen(true)
        }}
        aria-label="Send report via email"
      >
        <Mail className="h-4 w-4" />
      </Button>
      <Button
        size="icon"
        variant="outline"
        disabled={!report.fileUrl}
        onClick={() => setWhatsAppDialogOpen(true)}
        aria-label="Send report via WhatsApp"
      >
        <MessageCircle className="h-4 w-4" />
      </Button>

      <Dialog open={emailDialogOpen} onOpenChange={setEmailDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Send report via email</DialogTitle>
            <DialogDescription>Version {versionLabel}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">To</label>
              <Input
                value={emailTo}
                onChange={(event) => setEmailTo(event.target.value)}
                placeholder="customer@example.com, second@example.com"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">CC</label>
              <Input
                value={emailCc}
                onChange={(event) => setEmailCc(event.target.value)}
                placeholder="Optional comma-separated emails"
              />
            </div>
            {contactOptions.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium">Contract Contact Persons</p>
                <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                  {contactPersons.map((person) => {
                    const hasEmail = Boolean(person.email && person.email.trim())
                    const isSelected = selectedContactIds.includes(person.id)
                    return (
                      <label
                        key={person.id}
                        className={`flex items-start gap-3 rounded-md border p-3 text-sm ${hasEmail ? 'cursor-pointer hover:bg-muted/40' : 'opacity-60 cursor-not-allowed'}`}
                      >
                        <input
                          type="checkbox"
                          className="mt-1 h-4 w-4"
                          disabled={!hasEmail}
                          checked={isSelected && hasEmail}
                          onChange={(event) => {
                            const checked = event.target.checked
                            setSelectedContactIds((prev) => {
                              if (!hasEmail) return prev
                              if (checked) {
                                return prev.includes(person.id) ? prev : [...prev, person.id]
                              }
                              return prev.filter((id) => id !== person.id)
                            })
                          }}
                        />
                        <div className="space-y-1">
                          <p className="font-medium">{person.name || 'Unnamed contact'}</p>
                          <p className="text-xs text-muted-foreground">
                            {hasEmail ? person.email : 'No email available'}
                            {person.phone ? ` • ${person.phone}` : ''}
                          </p>
                        </div>
                      </label>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
          <DialogFooter className="flex gap-2 justify-end">
            <Button variant="outline" onClick={() => setEmailDialogOpen(false)} disabled={isEmailing}>Cancel</Button>
            <Button onClick={() => handleSend("email")} disabled={isEmailing || !hasPrimaryEmail}>
              {isEmailing ? <LoaderIcon /> : "Send"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={whatsAppDialogOpen} onOpenChange={setWhatsAppDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Send report via WhatsApp</DialogTitle>
            <DialogDescription>Version {versionLabel}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {contactPersonsWithPhone.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium">Contract Contact Persons</p>
                <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                  {contactPersonsWithPhone.map((person) => {
                    const checked = includeContactPersonIds.includes(person.id)
                    return (
                      <label
                        key={person.id}
                        className="flex items-start gap-3 rounded-md border p-3 text-sm cursor-pointer hover:bg-muted/40"
                      >
                        <input
                          type="checkbox"
                          className="mt-1 h-4 w-4"
                          checked={checked}
                          onChange={(event) => {
                            const value = event.target.checked
                            setIncludeContactPersonIds((prev) => {
                              if (value) {
                                return prev.includes(person.id) ? prev : [...prev, person.id]
                              }
                              return prev.filter((id) => id !== person.id)
                            })
                          }}
                        />
                        <div className="space-y-1">
                          <p className="font-medium">{person.name || 'Unnamed contact'}</p>
                          <p className="text-xs text-muted-foreground">
                            {person.normalizedPhone}
                            {person.email ? ` • ${person.email}` : ''}
                          </p>
                        </div>
                      </label>
                    )
                  })}
                </div>
              </div>
            )}
            {whatsAppRecipients.map((recipient, index) => {
              const disableRemove = whatsAppRecipients.length === 1
              return (
                <div key={recipient.id} className="border rounded-md p-3 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">Contact #{index + 1}</p>
                    <div className="flex gap-2">
                      {!disableRemove && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => removeRecipient(recipient.id)}
                          aria-label="Remove contact"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Name</label>
                    <Input
                      value={recipient.name}
                      onChange={(event) => updateRecipient(recipient.id, 'name', event.target.value)}
                      placeholder="Contact name"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Phone</label>
                    <PhoneInput
                      value={recipient.phone}
                      onChange={(value) => updateRecipient(recipient.id, 'phone', value)}
                      placeholder="Enter phone number"
                    />
                  </div>
                </div>
              )
            })}
            <Button type="button" variant="outline" onClick={addRecipient} className="w-full">
              <Plus className="h-4 w-4 mr-2" /> Add recipient
            </Button>
          </div>
          <DialogFooter className="flex gap-2 justify-end">
            <Button variant="outline" onClick={() => setWhatsAppDialogOpen(false)} disabled={isMessaging}>
              Cancel
            </Button>
            <Button onClick={handleSendWhatsApp} disabled={isMessaging}>
              {isMessaging ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" /> Sending...
                </span>
              ) : (
                'Send messages'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  )
}

function LoaderIcon() {
  return (
    <span className="h-4 w-4 animate-spin border-2 border-muted-foreground/30 border-t-muted-foreground rounded-full" />
  )
}
