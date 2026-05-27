---
title: Use Factories for Test Data Creation
impact: HIGH
impactDescription: reduces test setup code by 60-80%
tags: data, factories, setup, maintainability
---

## Use Factories for Test Data Creation

Factory functions generate test objects with sensible defaults, allowing developers to override only properties relevant to specific tests.

**Incorrect (inline all properties):**

```typescript
describe('applyDiscount', () => {
  it('applies discount to order', () => {
    // 20+ lines of setup to test one thing
    const order = {
      id: '123',
      customerId: 'c-456',
      items: [
        { productId: 'p1', name: 'Widget', price: 100, quantity: 2, sku: 'W-001' },
        { productId: 'p2', name: 'Gadget', price: 50, quantity: 1, sku: 'G-001' }
      ],
      subtotal: 250,
      tax: 25,
      shipping: 10,
      total: 285,
      status: 'pending',
      createdAt: new Date(),
      updatedAt: new Date()
    }

    const discounted = applyDiscount(order, 0.1)
    expect(discounted.total).toBe(256.5)
  })
})
```

**Correct (factory with defaults):**

```typescript
// test/factories.ts
function createOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: crypto.randomUUID(),
    customerId: crypto.randomUUID(),
    items: [],
    subtotal: 0,
    tax: 0,
    shipping: 0,
    total: 0,
    status: 'pending',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }
}

function createOrderItem(overrides: Partial<OrderItem> = {}): OrderItem {
  return {
    productId: crypto.randomUUID(),
    name: 'Test Product',
    price: 100,
    quantity: 1,
    sku: 'TEST-001',
    ...overrides,
  }
}

// Clean, focused test
describe('applyDiscount', () => {
  it('applies percentage discount to total', () => {
    const order = createOrder({ total: 285 })

    const discounted = applyDiscount(order, 0.1)

    expect(discounted.total).toBe(256.5)
  })
})
```

**Benefits:**
- Tests show only relevant data
- Single place to update when model changes
- Default values remain uniform across test suites
- Test intent becomes immediately apparent

Reference: [Test Factories - Radan Skoric](https://radanskoric.com/articles/test-factories)
