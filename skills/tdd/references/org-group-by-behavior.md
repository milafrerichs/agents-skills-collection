---
title: Group Tests by Behavior Not Method
impact: MEDIUM
impactDescription: 2-3x faster test navigation and discovery
tags: org, grouping, behavior, describe-blocks
---

## Group Tests by Behavior Not Method

Organize tests around features and behaviors that users care about, not around implementation methods. This makes tests serve as documentation.

**Incorrect (grouped by method):**

```typescript
describe('UserService', () => {
  describe('create', () => {
    it('test 1', () => { /* ... */ })
    it('test 2', () => { /* ... */ })
    it('test 3', () => { /* ... */ })
  })

  describe('update', () => {
    it('test 1', () => { /* ... */ })
    it('test 2', () => { /* ... */ })
  })

  describe('delete', () => {
    it('test 1', () => { /* ... */ })
  })
})
// Reader doesn't know what behaviors are being tested
```

**Correct (grouped by behavior):**

```typescript
describe('UserService', () => {
  describe('user registration', () => {
    it('creates user with provided email and name', () => { /* ... */ })
    it('generates unique user ID', () => { /* ... */ })
    it('sends welcome email to new user', () => { /* ... */ })
    it('rejects duplicate email addresses', () => { /* ... */ })
    it('validates email format', () => { /* ... */ })
  })

  describe('profile updates', () => {
    it('updates user name', () => { /* ... */ })
    it('validates new email before update', () => { /* ... */ })
    it('sends verification email when email changes', () => { /* ... */ })
    it('preserves unchanged fields', () => { /* ... */ })
  })

  describe('account deletion', () => {
    it('removes user data', () => { /* ... */ })
    it('cancels active subscriptions', () => { /* ... */ })
    it('sends confirmation email', () => { /* ... */ })
  })
})
// Tests read like feature documentation
```

**Benefits:**
- Tests document features, not implementation
- Easy to find tests for specific behaviors
- Missing behaviors become obvious
- Refactoring methods doesn't require reorganizing tests

Reference: [BDD and the Given-When-Then pattern](https://martinfowler.com/bliki/GivenWhenThen.html)
