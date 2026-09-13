/** One process-wide coordinator, shared by update middleware and reminder sends. */
export class ChatCoordinator {
  private readonly tails = new Map<string, Promise<void>>();

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
