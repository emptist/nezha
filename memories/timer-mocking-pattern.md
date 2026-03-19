# Timer Mocking Pattern in Tests

## Problem
When testing code that uses `setTimeout`/`setInterval`, tests hang or behave unexpectedly.

## Solution Pattern
```typescript
beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers(); // CRITICAL - prevent affecting other tests
});

// To advance time:
jest.advanceTimersByTime(5000);
```

## Key Insight
Always restore real timers in `afterEach` to prevent test pollution.
