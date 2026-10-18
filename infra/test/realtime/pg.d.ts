// smoke.ts'in kullandigi kadar: @types/pg bagimliligi eklememek icin.
declare module 'pg' {
  class Client {
    constructor(config: { connectionString: string })
    connect(): Promise<void>
    query(text: string, values?: unknown[]): Promise<{ rows: unknown[] }>
    end(): Promise<void>
  }
  const pg: { Client: typeof Client }
  export default pg
}
