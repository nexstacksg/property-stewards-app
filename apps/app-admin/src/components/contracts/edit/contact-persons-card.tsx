"use client"

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { ContactPersonPanel } from "@/components/contracts/new/contact-person-panel"
import type { ContactPersonDraft } from "@/components/contracts/types"

interface ContactPersonsCardProps {
  contactPersons: ContactPersonDraft[]
  contactEditIndex: number | null
  contactDraft: ContactPersonDraft | null
  contactError: string
  onBeginAddContact: () => void
  onBeginEditContact: (index: number) => void
  onContactFieldChange: (field: keyof ContactPersonDraft, value: string) => void
  onCancelContact: () => void
  onSaveContact: () => void
  onRemoveContact: (index: number) => void
}

export function ContactPersonsCard({
  contactPersons,
  contactEditIndex,
  contactDraft,
  contactError,
  onBeginAddContact,
  onBeginEditContact,
  onContactFieldChange,
  onCancelContact,
  onSaveContact,
  onRemoveContact,
}: ContactPersonsCardProps) {
  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle className="text-sm">Contact Persons</CardTitle>
        <CardDescription>Update stakeholders linked to this contract.</CardDescription>
      </CardHeader>
      <CardContent>
        <ContactPersonPanel
          contactPersons={contactPersons}
          contactEditIndex={contactEditIndex}
          contactDraft={contactDraft}
          contactError={contactError}
          onBeginAddContact={onBeginAddContact}
          onBeginEditContact={onBeginEditContact}
          onContactFieldChange={onContactFieldChange}
          onCancelContact={onCancelContact}
          onSaveContact={onSaveContact}
          onRemoveContact={onRemoveContact}
        />
      </CardContent>
    </Card>
  )
}
