---
title: Avoid Logic in Tests
impact: CRITICAL
impactDescription: eliminates bugs in test code itself
tags: design, simplicity, no-logic, straightforward
---

## Avoid Logic in Tests

Tests should be straightforward sequences of setup, action, and verification. Conditionals, loops, and complex calculations in tests can contain bugs, making tests unreliable.

**Incorrect (logic in tests):**

```typescript
describe('calculateShipping', () => {
  it('calculates correct totals for all order types', () => {
    const orderTypes = ['standard', 'express', 'overnight']
    const expectedMultipliers = [1, 1.5, 2.5]

    for (let i = 0; i < orderTypes.length; i++) {
      const order = createOrder({ type: orderTypes[i], basePrice: 100 })
      const total = calculateShipping(order)

      // Bug: if expectedMultipliers array is wrong, test passes bad code
      expect(total).toBe(100 * expectedMultipliers[i])
    }
  })
})

describe('filterActiveUsers', () => {
  it('filters active users', () => {
    const users = createUsers(10)
    const activeUsers = users.filter(u => u.isActive)  // Logic in test!

    const result = filterActiveUsers(users)

    // If filter logic is wrong in both places, test passes
    expect(result).toEqual(activeUsers)
  })
})
```

**Correct (explicit, linear tests):**

```typescript
describe('calculateShipping', () => {
  it('uses base price for standard shipping', () => {
    const order = createOrder({ type: 'standard', basePrice: 100 })
    expect(calculateShipping(order)).toBe(100)
  })

  it('adds 50% surcharge for express shipping', () => {
    const order = createOrder({ type: 'express', basePrice: 100 })
    expect(calculateShipping(order)).toBe(150)
  })

  it('adds 150% surcharge for overnight shipping', () => {
    const order = createOrder({ type: 'overnight', basePrice: 100 })
    expect(calculateShipping(order)).toBe(250)
  })
})

describe('filterActiveUsers', () => {
  it('returns only active users', () => {
    const activeUser = createUser({ isActive: true })
    const inactiveUser = createUser({ isActive: false })

    const result = filterActiveUsers([activeUser, inactiveUser])

    expect(result).toEqual([activeUser])
  })
})
```

**Exceptions:**
- Parameterized tests with test framework support (e.g., `it.each`)
- Simple array literals for multiple assertions on same object

Reference: [Unit Testing Best Practices - Microsoft Learn](https://learn.microsoft.com/en-us/dotnet/core/testing/unit-testing-best-practices)
