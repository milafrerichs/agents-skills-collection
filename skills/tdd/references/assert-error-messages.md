---
title: Assert on Error Messages and Types
impact: MEDIUM
impactDescription: prevents false positives from wrong errors
tags: assert, errors, exceptions, specificity
---

## Assert on Error Messages and Types

When testing error conditions, verify both the error type and message. Catching any error isn't enough - the right error must be thrown.

**Incorrect (any error passes):**

```typescript
describe('createUser', () => {
  it('throws on invalid email', () => {
    // Passes if ANY error is thrown, even unrelated ones
    expect(() => createUser({ email: 'invalid' })).toThrow()
  })
})

describe('saveUser', () => {
  it('throws on missing required field', async () => {
    // Catches network errors, type errors, anything
    await expect(saveUser({})).rejects.toBeDefined()
  })
})
```

**Correct (specific error assertions):**

```typescript
describe('createUser', () => {
  it('throws ValidationError for invalid email', () => {
    expect(() => createUser({ email: 'invalid' }))
      .toThrow(ValidationError)
  })

  it('includes field name in error message', () => {
    expect(() => createUser({ email: 'invalid' }))
      .toThrow('Invalid email format')
  })

  it('includes error details', () => {
    expect(() => createUser({ email: 'invalid' }))
      .toThrow(expect.objectContaining({
        code: 'VALIDATION_ERROR',
        field: 'email'
      }))
  })
})

describe('getUser', () => {
  it('throws NotFoundError for unknown user', async () => {
    await expect(getUser('nonexistent'))
      .rejects.toThrow(NotFoundError)
  })

  it('includes resource identifier in error', async () => {
    await expect(getUser('user-999'))
      .rejects.toThrow(/user-999/)
  })
})
```

**What to assert:**
- Error class/type when using custom errors
- Error message content (exact or partial match)
- Error code or status when applicable
- Associated data (field name, invalid value)

Reference: [Unit Testing Best Practices - Microsoft Learn](https://learn.microsoft.com/en-us/dotnet/core/testing/unit-testing-best-practices)
