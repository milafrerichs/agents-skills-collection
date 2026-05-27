---
title: Use Descriptive Test Names
impact: CRITICAL
impactDescription: 2-3x faster failure diagnosis
tags: design, naming, readability, documentation
---

## Use Descriptive Test Names

Test names should describe the scenario and expected outcome so clearly that you understand what broke without reading the test code.

**Incorrect (vague or technical names):**

```typescript
describe('Calculator', () => {
  it('test1', () => { /* ... */ })
  it('calculator', () => { /* ... */ })
  it('divide', () => { /* ... */ })
  it('should work correctly', () => { /* ... */ })
})
```

**Correct (scenario and outcome in name):**

```typescript
describe('divide', () => {
  it('returns quotient for positive numbers', () => {
    expect(divide(10, 2)).toBe(5)
  })

  it('throws DivisionError when dividing by zero', () => {
    expect(() => divide(10, 0)).toThrow(DivisionError)
  })
})

describe('filterUsers', () => {
  it('returns empty array when no users match filter', () => {
    const result = filterUsers(users, { role: 'nonexistent' })
    expect(result).toEqual([])
  })
})

describe('ShoppingCart', () => {
  describe('addItem', () => {
    it('increases total by item price', () => { /* ... */ })
    it('increments item count', () => { /* ... */ })
    it('throws when item is out of stock', () => { /* ... */ })
  })
})
```

**Good test names answer:**
- What is being tested?
- Under what conditions?
- What is the expected result?

**Benefits:**
- Failed tests are immediately understandable
- Test suite serves as living documentation
- Easy to identify missing test cases

Reference: [Unit Test Naming Conventions - TheCodeBuzz](https://thecodebuzz.com/tdd-unit-testing-naming-conventions-and-standards/)
