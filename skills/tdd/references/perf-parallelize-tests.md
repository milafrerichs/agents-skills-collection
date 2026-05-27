---
title: Parallelize Independent Tests
impact: MEDIUM
impactDescription: reduces suite time by 50-80%
tags: perf, parallel, concurrency, ci
---

## Parallelize Independent Tests

Run independent tests in parallel to reduce total suite execution time. Design tests to be isolation-safe for parallel execution.

**Incorrect (sequential, coupled tests):**

```typescript
// vitest.config.ts
export default defineConfig({
  test: {
    threads: false  // Forces sequential execution
  }
})

// Tests share database state
describe('UserService', () => {
  beforeAll(async () => {
    await db.users.deleteMany({})  // Clears ALL users
  })

  it('creates user', async () => {
    await userService.create({ id: 'user-1', name: 'Alice' })
    const count = await db.users.count()
    expect(count).toBe(1)  // Assumes no other tests created users
  })
})
```

**Correct (parallel-safe tests):**

```typescript
// vitest.config.ts
export default defineConfig({
  test: {
    threads: true  // Default: parallel execution
  }
})

// Tests use unique identifiers
describe('UserService', () => {
  it('creates user', async () => {
    const userId = `user-${Date.now()}-${Math.random()}`

    await userService.create({ id: userId, name: 'Alice' })

    const user = await db.users.findById(userId)
    expect(user).toBeDefined()
  })
})

// Each test is independent
describe('OrderService', () => {
  it('associates order with user', async () => {
    // Creates its own test data
    const user = await createTestUser()
    const order = await orderService.create({ userId: user.id })

    expect(order.userId).toBe(user.id)
  })
})
```

**Parallel-safety checklist:**
- No shared mutable state between tests
- Unique IDs for all test entities
- No assumptions about test execution order
- Database transactions or isolated test databases
- Mock external services per-test

**Configuration:**
- Vitest: `threads` option (default: true)
- Jest: `maxWorkers` in config

Reference: [Vitest Configuration - threads](https://vitest.dev/config/#threads)
