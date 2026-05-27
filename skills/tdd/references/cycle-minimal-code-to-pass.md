---
title: Write Only Enough Code to Pass the Test
impact: CRITICAL
impactDescription: prevents over-engineering and YAGNI violations
tags: cycle, green-phase, minimal, yagni
---

## Write Only Enough Code to Pass the Test

During the GREEN phase, implement only the minimum code required to make a failing test pass. Resist the urge to add features, optimizations, or "obvious" improvements not yet required by a test.

**Incorrect (over-engineering in GREEN phase):**

```typescript
describe('UserService', () => {
  it('retrieves user by id', async () => {
    const user = await userService.getById('123')
    expect(user.name).toBe('Alice')
  })
})

// Over-engineered: adds caching, logging, metrics — none required by test
class UserService {
  private cache = new Map()
  private logger = new Logger()

  async getById(id: string) {
    if (this.cache.has(id)) {
      this.logger.info('Cache hit', { id })
      return this.cache.get(id)
    }
    const user = await this.repository.findById(id)
    this.cache.set(id, user)
    this.logger.info('Fetched user', { id })
    return user
  }
}
```

**Correct (minimal code to pass):**

```typescript
describe('UserService', () => {
  it('retrieves user by id', async () => {
    const user = await userService.getById('123')
    expect(user.name).toBe('Alice')
  })
})

// Just enough to pass
class UserService {
  async getById(id: string) {
    return this.repository.findById(id)
  }
}
// Caching added later when a test demands it
```

**When to expand:**
- New tests demand additional behavior
- During the REFACTOR phase for structural improvements
- Never proactively add untested features

Reference: [The Cycles of TDD - Clean Coder Blog](http://blog.cleancoder.com/uncle-bob/2014/12/17/TheCyclesOfTDD.html)
