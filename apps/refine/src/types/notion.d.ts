/** Type stub for optional @notionhq/client dependency. */
declare module '@notionhq/client' {
  export class Client {
    constructor(opts: { auth: string });
    search(params: Record<string, unknown>): Promise<{ results: Array<Record<string, unknown>> }>;
    blocks: {
      children: {
        list(params: { block_id: string; start_cursor?: string }): Promise<{
          results: Array<Record<string, unknown>>;
          has_more: boolean;
          next_cursor: string | null;
        }>;
      };
    };
    databases: {
      query(params: Record<string, unknown>): Promise<{
        results: Array<Record<string, unknown>>;
        has_more: boolean;
        next_cursor: string | null;
      }>;
    };
    pages: {
      retrieve(params: { page_id: string }): Promise<Record<string, unknown>>;
    };
  }
}
