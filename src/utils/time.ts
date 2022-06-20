export function timestamp(): number {
  return Math.floor(Date.now() / 1000);
}

export function days(num: number): number {
  return num * 24 * 3600;
}

export const SECONDS = 1000;

export interface TimeoutPromise<T> extends Promise<T> {
  reject?: () => void;
}

export function sleep(ms: number): TimeoutPromise<void> {
  let timeout: NodeJS.Timeout | undefined;
  let promiseReject: () => void | undefined;
  const promise: TimeoutPromise<void> = new Promise<void>((resolve, reject) => {
    promiseReject = reject;
    timeout = setTimeout(() => {
      promise.reject = undefined;
      resolve();
    }, ms);
  });
  promise.reject = () => {
    if (promise.reject) {
      clearTimeout(timeout);
      promiseReject();
    }
  };
  return promise;
}

export function sleep_then_execute<T>(
  seconds: number,
  func: () => Promise<T>,
  log = false,
): TimeoutPromise<T> {
  const miliseconds = seconds * SECONDS;
  if (seconds === 0) {
    return func();
  } else {
    if (log) {
      console.log(`executing in ${miliseconds / 1000}s...`);
    }
    return sleep(miliseconds).then(func);
  }
}
