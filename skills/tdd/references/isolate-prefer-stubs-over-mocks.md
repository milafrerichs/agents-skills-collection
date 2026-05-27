---
title: Prefer Stubs Over Mocks for Queries
impact: HIGH
impactDescription: reduces test brittleness
tags: isolate, stubs, mocks, test-doubles
---

## Prefer Stubs Over Mocks for Queries

Use stubs (return canned responses) for methods that return data. Reserve mocks (verify interactions) for methods that perform actions. Over-mocking leads to brittle tests.

**Incorrect (mocking everything):**

```typescript
describe('profile display', () => {
  it('displays user profile', async () => {
    const mockUserService = {
      getById: vi.fn().mockResolvedValue({ id: '123', name: 'Alice' }),
      getPreferences: vi.fn().mockResolvedValue({ theme: 'dark' }),
      getAvatar: vi.fn().mockResolvedValue('/avatar.png')
    }

    await renderProfile('123', mockUserService)

    // Verifying query calls creates coupling to implementation
    expect(mockUserService.getById).toHaveBeenCalledWith('123')
    expect(mockUserService.getPreferences).toHaveBeenCalledWith('123')
    expect(mockUserService.getAvatar).toHaveBeenCalledWith('123')
    // Test breaks if we batch these calls or change call order
  })
})
```

**Correct (stubs for queries, mocks for commands):**

```typescript
describe('profile display', () => {
  it('displays user profile with preferences', async () => {
    // Stub: just provide data, don't verify calls
    const userService = {
      getById: async () => ({ id: '123', name: 'Alice' }),
      getPreferences: async () => ({ theme: 'dark' }),
      getAvatar: async () => '/avatar.png'
    }

    const { getByText } = await renderProfile('123', userService)

    // Assert on observable output, not internal calls
    expect(getByText('Alice')).toBeInTheDocument()
    expect(document.body).toHaveClass('theme-dark')
  })
})

describe('preference updates', () => {
  it('saves updated preferences', async () => {
    // Mock: verify the command was called correctly
    const mockUserService = {
      getById: async () => ({ id: '123', name: 'Alice' }),
      getPreferences: async () => ({ theme: 'dark' }),
      savePreferences: vi.fn().mockResolvedValue({ success: true })
    }

    await updateTheme('123', 'light', mockUserService)

    // Commands should be verified
    expect(mockUserService.savePreferences).toHaveBeenCalledWith('123', {
      theme: 'light'
    })
  })
})
```

**Guidelines:**
- **Queries** (return data, no side effects): Use stubs
- **Commands** (perform actions, have side effects): Use mocks
- When in doubt, stub it

Reference: [Mocks Aren't Stubs - Martin Fowler](https://martinfowler.com/articles/mocksArentStubs.html)
