---
title: Use Builder Pattern for Complex Objects
impact: HIGH
impactDescription: reduces complex setup code by 40-60%
tags: data, builder, fluent-api, complex-objects
---

## Use Builder Pattern for Complex Objects

For objects with many optional fields or complex nested structures, implement a fluent builder that chains method calls for readable test setup.

**Incorrect (verbose inline objects):**

```typescript
describe('OrderProcessor', () => {
  it('processes gift order with express shipping', () => {
    const order = {
      id: '123',
      customerId: 'c-456',
      items: [{ productId: 'p1', price: 100, quantity: 2 }],
      shipping: { method: 'express', cost: 15, address: { street: '123 Main', city: 'NYC', zip: '10001' } },
      payment: { method: 'card', last4: '4242', chargeId: 'ch_123' },
      isGift: true,
      giftMessage: 'Happy birthday!',
      giftWrap: true,
      discount: { code: 'SAVE10', amount: 10, type: 'percentage' },
      status: 'pending',
      createdAt: new Date(),
    }

    const result = processOrder(order)
    expect(result.total).toBe(197) // hard to verify from wall of setup
  })
})
```

**Correct (fluent builder):**

```typescript
class OrderBuilder {
  private order: Partial<Order> = {}

  withCustomer(customerId: string) {
    this.order.customerId = customerId
    return this
  }

  withItems(items: OrderItem[]) {
    this.order.items = items
    return this
  }

  withExpressShipping() {
    this.order.shipping = { method: 'express', cost: 15, address: defaultAddress() }
    return this
  }

  asGift(message: string) {
    this.order.isGift = true
    this.order.giftMessage = message
    this.order.giftWrap = true
    return this
  }

  withDiscount(code: string, amount: number) {
    this.order.discount = { code, amount, type: 'percentage' }
    return this
  }

  build(): Order {
    return { ...defaultOrder(), ...this.order }
  }
}

describe('OrderProcessor', () => {
  it('processes gift order with express shipping', () => {
    const order = new OrderBuilder()
      .withItems([{ productId: 'p1', price: 100, quantity: 2 }])
      .withExpressShipping()
      .asGift('Happy birthday!')
      .withDiscount('SAVE10', 10)
      .build()

    const result = processOrder(order)

    expect(result.total).toBe(197)
  })
})
```

**When to use builders:**
- Objects with 5+ optional fields
- Complex nested structures
- Multiple valid configurations
- Tests needing different option combinations

Reference: [Test Data Builders - Nat Pryce](http://www.natpryce.com/articles/000714.html)
