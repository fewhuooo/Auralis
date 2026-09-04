export class LocalDatabaseRuntime<TDatabase> {
  private database: TDatabase | null = null
  private initialization: Promise<TDatabase> | null = null
  private readonly scopedValues = new Map<string, unknown>()

  async initialize(load: () => Promise<TDatabase>): Promise<TDatabase> {
    if (this.database !== null) return this.database
    if (!this.initialization) {
      this.initialization = load().then(
        (database) => {
          this.database = database
          return database
        },
        (error) => {
          this.initialization = null
          throw error
        },
      )
    }
    return this.initialization
  }

  getOrCreate<T>(scope: string, create: () => T): T {
    const existing = this.scopedValues.get(scope)
    if (existing) return existing as T
    const value = create()
    this.scopedValues.set(scope, value)
    return value
  }
}
