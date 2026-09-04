import type { LocalSqlDatabase } from '@/services/localSchema'

export class LocalSqlQueue {
  private tail = Promise.resolve()

  enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const running = this.tail.then(operation, operation)
    this.tail = running.then(() => undefined, () => undefined)
    return running
  }
}

export function serializeLocalSqlDatabase(
  database: LocalSqlDatabase,
  queue = new LocalSqlQueue(),
): LocalSqlDatabase {
  return {
    execute: (sql, bindValues) => queue.enqueue(() => database.execute(sql, bindValues)),
    select: <T>(sql: string, bindValues?: unknown[]) => queue.enqueue(() => database.select<T>(sql, bindValues)),
  }
}
