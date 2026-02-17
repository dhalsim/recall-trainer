/**
 * Wait `ms` milliseconds, then call `fn()` and resolve with its result.
 * If `fn()` returns a Promise, the result is that Promise (flattened).
 */
export function delay<T>(fn: () => T | Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      try {
        const result = fn();

        if (result instanceof Promise) {
          result.then(resolve, reject);
        } else {
          resolve(result);
        }
      } catch (e) {
        reject(e);
      }
    }, ms);
  });
}
