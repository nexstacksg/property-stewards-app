import type { Status } from "@prisma/client"

export type UserSummary = {
  id: string
  username: string
  email: string
  confirmed: boolean
}

export type PropertySummary = {
  id: string
  code: string
  name: string
  status: Status
  sizes: Array<{
    id: string
    code: string
    name: string
    status: Status
  }>
}

export type MasterSettingsSectionKey =
  | "user-settings"
  | "data-settings"
  | "property-size"
  | "documentation"

export type MasterSettingsPanelProps = {
  sections: MasterSettingsSectionKey[]
  currentUser: UserSummary | null
  properties: PropertySummary[]
}
