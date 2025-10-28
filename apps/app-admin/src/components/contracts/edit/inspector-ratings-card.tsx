"use client"

import { Star } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Loader2 } from "lucide-react"
import { ratingFromStars, starsFromRating, type InspectorRatingValue, type RatingSelectValue } from "@/components/contracts/edit/ratings-utils"

type Inspector = {
  id: string
  name: string
  mobilePhone?: string | null
}

type Props = {
  contractInspectors: Inspector[]
  inspectorRatingsState: Record<string, InspectorRatingValue | null>
  ratingSavingState: Record<string, boolean>
  ratingError: string | null
  saving: boolean
  onChange: (inspectorId: string, value: RatingSelectValue) => void
}

export function InspectorRatingsCard({ contractInspectors, inspectorRatingsState, ratingSavingState, ratingError, saving, onChange }: Props) {
  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle>Inspector Ratings</CardTitle>
        <CardDescription>Track internal feedback per inspector.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {ratingError ? (
          <p className="text-sm text-destructive">{ratingError}</p>
        ) : null}
        {contractInspectors.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Ratings become available once inspectors are assigned to the contract's work orders.
          </p>
        ) : (
          <div className="space-y-3">
            {contractInspectors.map((inspector) => {
              const currentRating = inspectorRatingsState[inspector.id] ?? null
              return (
                <div key={inspector.id} className="flex items-center justify-between gap-3 rounded-md border p-3">
                  <div>
                    <p className="font-medium">{inspector.name}</p>
                    {inspector.mobilePhone ? (
                      <p className="text-xs text-muted-foreground">{inspector.mobilePhone}</p>
                    ) : null}
                    {currentRating ? (
                      <div className="flex items-center gap-1 mt-2 text-yellow-400">
                        {Array.from({ length: 5 }).map((_, idx) => (
                          <Star key={idx} className={`h-4 w-4 ${idx < starsFromRating(currentRating) ? 'fill-yellow-400 text-yellow-400' : 'text-muted-foreground'}`} />
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground mt-2">Not rated</p>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center">
                      {Array.from({ length: 5 }).map((_, idx) => {
                        const starIndex = idx + 1
                        const selected = starIndex <= starsFromRating(currentRating)
                        const disabled = Boolean(ratingSavingState[inspector.id] || saving)
                        return (
                          <button
                            key={starIndex}
                            type="button"
                            aria-label={`Rate ${starIndex} star${starIndex > 1 ? 's' : ''}`}
                            className={`p-1 ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                            onClick={() => {
                              if (disabled) return
                              const mapped = ratingFromStars(starIndex)
                              onChange(inspector.id, mapped)
                            }}
                          >
                            <Star className={`h-5 w-5 ${selected ? 'fill-yellow-400 text-yellow-400' : 'text-muted-foreground'}`} />
                          </button>
                        )
                      })}
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      type="button"
                      onClick={() => onChange(inspector.id, 'NONE')}
                      disabled={Boolean(ratingSavingState[inspector.id] || saving)}
                    >
                      Clear
                    </Button>
                    {ratingSavingState[inspector.id] ? (
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    ) : null}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

