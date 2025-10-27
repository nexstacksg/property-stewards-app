"use client"

export type InspectorRatingValue = 1 | 2 | 3 | 4 | 5
export type RatingSelectValue = InspectorRatingValue | 'NONE'

export function ratingFromStars(stars: number): RatingSelectValue {
  if (stars <= 0) return 'NONE'
  const n = Math.max(1, Math.min(5, Math.round(stars))) as InspectorRatingValue
  return n
}

export function starsFromRating(r: InspectorRatingValue | string | null | undefined): number {
  if (!r) return 0
  if (typeof r === 'number') return r
  const v = r.trim().toUpperCase()
  if (v === 'GOOD') return 5
  if (v === 'FAIR') return 3
  if (v === 'BAD') return 1
  const n = Number(v)
  return Number.isNaN(n) ? 0 : Math.max(1, Math.min(5, Math.round(n)))
}

