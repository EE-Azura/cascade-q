/**
 * @author EE_Azura <EE_Azura@outlook.com>
 */

/**
 * 创建一个Promise及其控制器函数
 * @template T Promise解析值的类型
 * @returns 包含Promise及其resolve和reject函数的对象
 */
export function withResolvers<T = unknown>(): {
  promise: Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: unknown) => void;
} {
  if (typeof Promise.withResolvers === 'function') {
    return Promise.withResolvers();
  }
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;

  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve, reject };
}
