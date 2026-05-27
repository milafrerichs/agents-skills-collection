---
title: Avoid Arbitrary Sleep Calls
impact: MEDIUM
impactDescription: eliminates 54% of async-related flakiness
tags: perf, async, sleep, waiting
---

## Avoid Arbitrary Sleep Calls

Never use fixed delays to wait for async operations. Use explicit waits for specific conditions instead - they're faster and more reliable.

**Incorrect (arbitrary sleep):**

```typescript
describe('UserProfile', () => {
  it('updates UI after data loads', async () => {
    render(<UserProfile userId="123" />)

    // Wait "long enough" for data to load
    await sleep(2000)

    expect(screen.getByText('Alice')).toBeInTheDocument()
  })
})
// Slow (always waits 2s) and flaky (might not be enough)

describe('background jobs', () => {
  it('processes background job', async () => {
    await jobQueue.enqueue({ type: 'send-email', to: 'user@test.com' })

    // Hope the job completes in 5 seconds
    await sleep(5000)

    expect(await getEmailCount('user@test.com')).toBe(1)
  })
})
// Wastes 5s even if job completes in 100ms
```

**Correct (explicit conditions):**

```typescript
describe('UserProfile', () => {
  it('updates UI after data loads', async () => {
    render(<UserProfile userId="123" />)

    // Wait for specific element to appear
    await waitFor(() => {
      expect(screen.getByText('Alice')).toBeInTheDocument()
    })
  })
})
// Fast: returns as soon as condition is met

describe('background jobs', () => {
  it('processes background job', async () => {
    await jobQueue.enqueue({ type: 'send-email', to: 'user@test.com' })

    // Poll for completion with timeout
    await waitFor(
      async () => {
        const count = await getEmailCount('user@test.com')
        expect(count).toBe(1)
      },
      { timeout: 5000, interval: 100 }
    )
  })
})
// Returns immediately when done, fails fast if broken

// For event-based systems
describe('pub/sub', () => {
  it('receives message after publish', async () => {
    const messagePromise = new Promise(resolve => {
      subscriber.once('message', resolve)
    })

    publisher.publish({ data: 'test' })

    const message = await messagePromise
    expect(message.data).toBe('test')
  })
})
```

**Async waiting strategies:**
- `waitFor()` with condition check
- Promise-based event listeners
- Polling with exponential backoff
- `vi.useFakeTimers()` for timer-based code

Reference: [Testing Library - Async Utilities](https://testing-library.com/docs/dom-testing-library/api-async/)
