type StarRating = 1 | 2 | 3 | 4 | 5

type RatingLike = {
  rating: StarRating | string | null | undefined
}

export function scoreFromRating(value: StarRating | string | null | undefined): number | null {
  if (typeof value === 'number') {
    if (value < 1 || value > 5) return null
    return value
  }
  if (typeof value === 'string') {
    const v = value.trim().toUpperCase()
    if (v === 'GOOD') return 5
    if (v === 'FAIR') return 3
    if (v === 'BAD') return 1
    const n = Number(v)
    if (!Number.isNaN(n) && n >= 1 && n <= 5) return Math.round(n)
    return null
  }
  return null
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
