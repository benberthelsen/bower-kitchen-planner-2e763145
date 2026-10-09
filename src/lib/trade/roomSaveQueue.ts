/** Run room writes in order. The work callback starts only after the previous
 * write settles, so it can read the revision returned by that write. A failed
 * request must not poison later retries. */
export function createRoomSaveQueue() {
  let tail: Promise<void> = Promise.resolve();
  return function enqueue<T>(work: () => Promise<T>): Promise<T> {
    const result = tail.then(work, work);
    tail = result.then(() => undefined, () => undefined);
    return result;
  };
}
