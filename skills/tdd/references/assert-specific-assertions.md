---
title: Use Specific Assertions
impact: MEDIUM
impactDescription: 2-5x faster debugging from better failure messages
tags: assert, specific, matchers, clarity
---

## Use Specific Assertions

Choose the most specific assertion available. Specific assertions produce better failure messages and make expected behavior more transparent.

**Incorrect (generic assertions):**

```typescript
describe('search', () => {
  it('returns results', () => {
    const result = search('query')

    expect(result.length === 1).toBe(true)
    // Failure: Expected true, Received false (unhelpful)

    expect(result[0].id === '1').toBe(true)
    // Failure: Expected true, Received false (no context)

    expect(result.includes(item)).toBe(true)
    // No info about what was actually in the array
  })
})
```

**Correct (specific matchers):**

```typescript
describe('search', () => {
  it('returns matching results', () => {
    const result = search('query')

    expect(result).toHaveLength(1)
    // Failure: Expected length 1, Received length 0

    expect(result[0]).toMatchObject({ id: '1' })
    // Failure: shows exact diff between expected and received

    expect(result).toContainEqual(item)
    // Failure: shows full array contents
  })
})
```

**Preferred matchers:**
- `toHaveLength()` instead of length comparisons
- `toContain()` instead of includes checks
- `toMatchObject()` instead of individual property assertions
- `toThrow()` instead of try/catch blocks with booleans
- `toBeGreaterThan()` instead of comparison operators

Reference: [Vitest Expect API](https://vitest.dev/api/expect.html)
