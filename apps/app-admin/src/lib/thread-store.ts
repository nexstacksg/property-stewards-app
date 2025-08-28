// Shared thread store for session management
// In production, this should be replaced with Redis or a database

class ThreadStore {
  private store: Map<string, string>

  constructor() {
    this.store = new Map()
  }

  set(sessionId: string, threadId: string) {
    this.store.set(sessionId, threadId)
  }

  get(sessionId: string): string | undefined {
    return this.store.get(sessionId)
  }

  delete(sessionId: string) {
    this.store.delete(sessionId)
  }

  has(sessionId: string): boolean {
    return this.store.has(sessionId)
  }
}

// Export singleton instance
export const threadStore = new ThreadStore()