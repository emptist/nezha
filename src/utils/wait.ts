export function waitForever(): Promise<void> {
  const interval = setInterval(() => {}, 1_000_000);
  interval.unref();
  return new Promise<void>(() => {});
}
