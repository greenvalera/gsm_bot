/** One process-wide coordinator, shared by update middleware and reminder sends. */
export class ChatCoordinator {
  private readonly tails = new Map<string, Promise<void>>();
  private acceptingUpdates = true;
  private readonly updates = new Set<Promise<void>>();

  async runUpdate(
    keys: readonly string[],
    action: () => Promise<void>,
  ): Promise<void> {
    if (!this.acceptingUpdates) return;
    const work = this.run(keys, async () => {
      if (this.acceptingUpdates) await action();
    });
    this.updates.add(work);
    try {
      await work;
    } finally {
      this.updates.delete(work);
    }
  }

  stopUpdateAdmission(): void {
    this.acceptingUpdates = false;
  }

  async drainUpdates(timeoutMs = 30_000): Promise<void> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        this.updatesSettled(),
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(Error("Update drain deadline reached")),
            timeoutMs,
          );
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  async updatesSettled(): Promise<void> {
    await Promise.allSettled([...this.updates]);
  }

  async run<T>(keys: readonly string[], action: () => Promise<T>): Promise<T> {
    const unique = [...new Set(keys)].sort();
    const predecessors = unique.map(
      (key) => this.tails.get(key) ?? Promise.resolve(),
    );
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    // Register every key synchronously before awaiting any predecessor. A caller
    // never partially acquires a migration pair. Actions must not reenter run.
    const tail = Promise.all(predecessors).then(() => held);
    for (const key of unique) this.tails.set(key, tail);
    await Promise.all(predecessors);
    try {
      return await action();
    } finally {
      release();
      for (const key of unique)
        if (this.tails.get(key) === tail) this.tails.delete(key);
    }
  }
}
