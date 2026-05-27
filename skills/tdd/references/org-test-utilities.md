---
title: Extract Reusable Test Utilities
impact: MEDIUM
impactDescription: reduces duplication by 40-60%
tags: org, utilities, helpers, reusability
---

## Extract Reusable Test Utilities

Create shared test utilities for common operations. Keep them in a dedicated location so all tests can use consistent patterns.

**Incorrect (duplicated test code):**

```typescript
// user.test.ts
describe('user creation', () => {
  it('creates user', async () => {
    const response = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${await getTestToken()}`)
      .set('Content-Type', 'application/json')
      .send({ email: 'test@example.com', name: 'Test' })

    expect(response.status).toBe(201)
  })
})

// order.test.ts
describe('order creation', () => {
  it('creates order', async () => {
    // Same boilerplate repeated
    const response = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${await getTestToken()}`)
      .set('Content-Type', 'application/json')
      .send({ items: [{ productId: '123', quantity: 1 }] })

    expect(response.status).toBe(201)
  })
})
```

**Correct (extracted utilities):**

```typescript
// test-utils/api.ts
export function createApiClient(token?: string) {
  const client = {
    async post<T>(path: string, body: unknown): Promise<ApiResponse<T>> {
      const req = request(app)
        .post(path)
        .set('Content-Type', 'application/json')

      if (token) {
        req.set('Authorization', `Bearer ${token}`)
      }

      return req.send(body)
    },
    // get, put, delete...
  }
  return client
}

export async function authenticatedClient() {
  const token = await getTestToken()
  return createApiClient(token)
}

// user.test.ts
describe('user creation', () => {
  it('creates user', async () => {
    const api = await authenticatedClient()

    const response = await api.post('/api/users', {
      email: 'test@example.com',
      name: 'Test'
    })

    expect(response.status).toBe(201)
  })
})

// order.test.ts
describe('order creation', () => {
  it('creates order', async () => {
    const api = await authenticatedClient()

    const response = await api.post('/api/orders', {
      items: [{ productId: '123', quantity: 1 }]
    })

    expect(response.status).toBe(201)
  })
})
```

**Common test utilities:**
- API client wrappers
- Authentication helpers
- Database seeding functions
- Factory functions
- Custom matchers
- Wait/polling utilities

Reference: [Vitest Setup Files](https://vitest.dev/config/#setupfiles)
