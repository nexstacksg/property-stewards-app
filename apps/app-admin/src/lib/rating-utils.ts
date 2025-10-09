import { InspectorContractRatingValue } from '@prisma/client'

const RATING_SCORE: Record<InspectorContractRatingValue, number> = {
  GOOD: 5,
  FAIR: 3,
  BAD: 1,
}

type RatingLike = {
  rating: InspectorContractRatingValue | null | undefined
}

export function scoreFromRating(value: InspectorContractRatingValue | null | undefined): number | null {
  if (!value) return null
  return RATING_SCORE[value]
}

export function summarizeRatings<T extends RatingLike>(ratings: T[]) {
  if (!Array.isArray(ratings) || ratings.length === 0) {
    return { average: null, count: 0, total: 0 }
  }

  const scores = ratings
    .map((entry) => scoreFromRating(entry.rating))
    .filter((score): score is number => typeof score === 'number')

  const count = scores.length
  if (count === 0) {
    return { average: null, count: 0, total: 0 }
  }

  const total = scores.reduce((sum, score) => sum + score, 0)
  const average = Number((total / count).toFixed(1))
  return { average, count, total }
}
