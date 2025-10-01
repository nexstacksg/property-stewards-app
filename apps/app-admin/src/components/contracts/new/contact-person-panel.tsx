"use client"

import { Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { PhoneInput } from "@/components/ui/phone-input"
import type { ContactPersonDraft } from "../types"

interface ContactPersonPanelProps {
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

export function ContactPersonPanel({
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
}: ContactPersonPanelProps) {
  return (
    <div className="space-y-4">
      {contactPersons.length === 0 && (
        <p className="text-sm text-muted-foreground">No contact persons added.</p>
      )}

      {contactPersons.map((person, index) => {
        const isEditing = contactEditIndex === index && contactDraft
        const editingAnother = contactEditIndex !== null && contactEditIndex !== index

        return (
          <div key={index} className="border rounded-lg p-4 space-y-3">
            <div className="flex items-start justify-between">
              <h4 className="font-medium">Contact #{index + 1}</h4>
              {!isEditing && !editingAnother && (
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" onClick={() => onBeginEditContact(index)}>
                    Edit
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => onRemoveContact(index)}>
                    Remove
                  </Button>
                </div>
              )}
            </div>

            {isEditing ? (
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label htmlFor={`contact-name-${index}`}>Name *</Label>
                  <Input
                    id={`contact-name-${index}`}
                    value={contactDraft?.name || ""}
                    onChange={(event) => onContactFieldChange("name", event.target.value)}
                    placeholder="Full name"
                    autoFocus
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor={`contact-relation-${index}`}>Relation</Label>
                  <Input
                    id={`contact-relation-${index}`}
                    value={contactDraft?.relation || ""}
                    onChange={(event) => onContactFieldChange("relation", event.target.value)}
                    placeholder="e.g., Owner"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor={`contact-phone-${index}`}>Phone</Label>
                  <PhoneInput
                    value={contactDraft?.phone || ""}
                    onChange={(value) => onContactFieldChange("phone", value)}
                    placeholder="Contact number"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor={`contact-email-${index}`}>Email</Label>
                  <Input
                    id={`contact-email-${index}`}
                    value={contactDraft?.email || ""}
                    onChange={(event) => onContactFieldChange("email", event.target.value)}
                    placeholder="Email address"
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={onCancelContact}>
                    Cancel
                  </Button>
                  <Button type="button" size="sm" onClick={onSaveContact}>
                    Save
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-2 text-sm">
                <div className="font-medium">{person.name}</div>
                <div className="text-muted-foreground">
                  {person.relation ? person.relation : "Relation not specified"}
                </div>
                <div>
                  {person.phone ? (
                    <p>Phone: {person.phone}</p>
                  ) : (
                    <p className="text-muted-foreground">Phone not provided</p>
                  )}
                </div>
                <div>
                  {person.email ? (
                    <p>Email: {person.email}</p>
                  ) : (
                    <p className="text-muted-foreground">Email not provided</p>
                  )}
                </div>
              </div>
            )}
          </div>
        )
      })}

      <div className="space-y-2">
        <Button
          type="button"
          variant="outline"
          className="w-full"
          onClick={onBeginAddContact}
          disabled={contactEditIndex !== null}
        >
          <Plus className="h-4 w-4 mr-2" /> Add Contact Person
        </Button>
        {contactError && <p className="text-sm text-destructive text-left">{contactError}</p>}
      </div>
    </div>
  )
}
