// Persistent offline write queue — survives page refreshes.
// Stored in localStorage as: wcw_syncqueue_{userId}

export interface SyncOp {
  id: string;
  table: string;
  action: "insert" | "update" | "delete";
  payload: Record<string, unknown>;
  recordId: string; // client UUID of the affected row
  timestamp: number; // Date.now() — drives last-write-wins
  retries: number; // max 5
  upsertConflict?: string; // e.g. "user_id,log_date" for fight_week_logs
}

const QUEUE_KEY_PREFIX = "wcw_syncqueue_";
const MAX_RETRIES = 5;

// Per-userId in-memory concurrency guard (JS is single-threaded, boolean suffices)
const processing: Record<string, boolean> = {};

class SyncQueue {
  private queueKey(userId: string): string {
    return `${QUEUE_KEY_PREFIX}${userId}`;
  }

  private readOps(userId: string): SyncOp[] {
    try {
      const raw = localStorage.getItem(this.queueKey(userId));
      return raw ? (JSON.parse(raw) as SyncOp[]) : [];
    } catch {
      return [];
    }
  }

  private writeOps(userId: string, ops: SyncOp[]): void {
    try {
      localStorage.setItem(this.queueKey(userId), JSON.stringify(ops));
    } catch {
      // Quota error — silently ignore, we'll try again later
    }
  }

  enqueue(userId: string, op: Omit<SyncOp, "id" | "retries">): void {
    const ops = this.readOps(userId);
    const newOp: SyncOp = { ...op, id: crypto.randomUUID(), retries: 0 };
    ops.push(newOp);
    this.writeOps(userId, ops);
  }

  dequeue(userId: string, opId: string): void {
    const ops = this.readOps(userId).filter((o) => o.id !== opId);
    this.writeOps(userId, ops);
  }

  peek(userId: string): SyncOp[] {
    return this.readOps(userId);
  }

  clear(userId: string): void {
    localStorage.removeItem(this.queueKey(userId));
  }

  size(userId: string): number {
    return this.readOps(userId).length;
  }

  async process(userId: string): Promise<number> {
    if (processing[userId]) return 0;
    processing[userId] = true;

    let flushed = 0;

    try {
      // Dynamic import avoids circular deps (same pattern as backgroundSync.ts)
      const { supabase } = await import("@/integrations/supabase/client");
      const { withSupabaseTimeout } = await import("@/lib/timeoutWrapper");

      // Sort by timestamp ascending (oldest first = first-in-first-out)
      const ops = this.readOps(userId).sort((a, b) => a.timestamp - b.timestamp);

      for (const op of ops) {
        try {
          if (op.action === "insert") {
            const { error } = await withSupabaseTimeout(
              supabase.from(op.table).insert(op.payload as any),
              10000,
              `SyncQueue insert ${op.table}`
            );

            if (error) {
              // Duplicate primary key → treat as already synced (idempotent)
              const isDuplicate =
                error.code === "23505" ||
                (error.message && error.message.includes("duplicate key"));
              if (isDuplicate) {
                this.dequeue(userId, op.id);
                flushed++;
              } else {
                this._incrementRetry(userId, op);
              }
            } else {
              this.dequeue(userId, op.id);
              flushed++;
            }
          } else if (op.action === "update") {
            // Last-write-wins: check if DB row is newer
            const { data: existing, error: fetchError } = await withSupabaseTimeout(
              supabase.from(op.table).select("updated_at").eq("id", op.recordId).maybeSingle(),
              10000,
              `SyncQueue fetch-for-update ${op.table}`
            );

            if (!fetchError && existing) {
              const dbTime = existing.updated_at
                ? new Date(existing.updated_at).getTime()
                : 0;
              if (dbTime > op.timestamp) {
                // Server is newer — discard our stale op
                this.dequeue(userId, op.id);
                continue;
              }
            }

            const { error } = await withSupabaseTimeout(
              supabase.from(op.table).update(op.payload as any).eq("id", op.recordId),
              10000,
              `SyncQueue update ${op.table}`
            );

            if (error) {
              this._incrementRetry(userId, op);
            } else {
              this.dequeue(userId, op.id);
              flushed++;
            }
          } else if (op.action === "delete") {
            const { error } = await withSupabaseTimeout(
              supabase.from(op.table).delete().eq("id", op.recordId),
              10000,
              `SyncQueue delete ${op.table}`
            );

            if (error) {
              // Row not found is fine — already deleted
              const notFound =
                error.code === "PGRST116" ||
                (error.message && error.message.includes("not found"));
              if (notFound) {
                this.dequeue(userId, op.id);
                flushed++;
              } else {
                this._incrementRetry(userId, op);
              }
            } else {
              this.dequeue(userId, op.id);
              flushed++;
            }
          }
        } catch (err) {
          console.warn(`SyncQueue: op ${op.id} threw`, err);
          this._incrementRetry(userId, op);
        }
      }
    } finally {
      processing[userId] = false;
    }

    return flushed;
  }

  private _incrementRetry(userId: string, op: SyncOp): void {
    const ops = this.readOps(userId);
    const idx = ops.findIndex((o) => o.id === op.id);
    if (idx === -1) return;

    ops[idx].retries++;
    if (ops[idx].retries >= MAX_RETRIES) {
      console.warn(`SyncQueue: discarding op ${op.id} after ${MAX_RETRIES} retries`, op);
      ops.splice(idx, 1);
    }
    this.writeOps(userId, ops);
  }
}

export const syncQueue = new SyncQueue();
