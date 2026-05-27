---
name: tdd
description: Test-Driven Development methodology with Vitest/Jest. Use when practicing TDD, writing tests first, designing tests before implementation, or reviewing test-first approaches. Triggers on "write tests first", "test before code", "red green refactor", "test driven development", "vitest", "jest".
---

# Test-Driven Development with Vitest/Jest

Comprehensive TDD guide for AI agents. 42 rules across 8 categories, prioritized by impact. All examples use **Vitest** (preferred) or Jest with `describe`/`it` syntax.

## When to Apply

- Writing new features using TDD workflow
- Implementing the red-green-refactor cycle
- Designing test structure and organization
- Creating test data and fixtures
- Reviewing or refactoring existing test suites

## TDD Workflow

1. **RED**: Write a failing test that defines desired behavior
2. **GREEN**: Write minimal code to make the test pass
3. **REFACTOR**: Clean up code while keeping tests green
4. Repeat for each new behavior

Before starting, maintain a **test list** — enumerate all behaviors to implement.

---

## Rule Categories by Priority

| Priority | Category | Impact | Prefix |
|----------|----------|--------|--------|
| 1 | Red-Green-Refactor Cycle | CRITICAL | `cycle-` |
| 2 | Test Design Principles | CRITICAL | `design-` |
| 3 | Test Isolation & Dependencies | HIGH | `isolate-` |
| 4 | Test Data Management | HIGH | `data-` |
| 5 | Assertions & Verification | MEDIUM | `assert-` |
| 6 | Test Organization & Structure | MEDIUM | `org-` |
| 7 | Test Performance & Reliability | MEDIUM | `perf-` |
| 8 | Test Pyramid & Strategy | LOW | `strat-` |

## Quick Reference

### 1. Red-Green-Refactor Cycle (CRITICAL)

- [cycle-write-test-first](references/cycle-write-test-first.md) — Write the Test Before the Implementation
- [cycle-minimal-code-to-pass](references/cycle-minimal-code-to-pass.md) — Write Only Enough Code to Pass the Test
- [cycle-verify-test-fails-first](references/cycle-verify-test-fails-first.md) — Verify the Test Fails Before Writing Code
- [cycle-refactor-after-green](references/cycle-refactor-after-green.md) — Refactor Immediately After Green
- [cycle-small-increments](references/cycle-small-increments.md) — Take Small Incremental Steps
- [cycle-maintain-test-list](references/cycle-maintain-test-list.md) — Maintain a Test List

### 2. Test Design Principles (CRITICAL)

- [design-test-behavior-not-implementation](references/design-test-behavior-not-implementation.md) — Test Behavior Not Implementation
- [design-one-assertion-per-test](references/design-one-assertion-per-test.md) — One Logical Assertion Per Test
- [design-descriptive-test-names](references/design-descriptive-test-names.md) — Use Descriptive Test Names
- [design-aaa-pattern](references/design-aaa-pattern.md) — Follow the Arrange-Act-Assert Pattern
- [design-test-edge-cases](references/design-test-edge-cases.md) — Test Edge Cases and Boundaries
- [design-avoid-logic-in-tests](references/design-avoid-logic-in-tests.md) — Avoid Logic in Tests

### 3. Test Isolation & Dependencies (HIGH)

- [isolate-mock-external-dependencies](references/isolate-mock-external-dependencies.md) — Mock External Dependencies
- [isolate-no-shared-state](references/isolate-no-shared-state.md) — Avoid Shared Mutable State Between Tests
- [isolate-deterministic-tests](references/isolate-deterministic-tests.md) — Write Deterministic Tests
- [isolate-prefer-stubs-over-mocks](references/isolate-prefer-stubs-over-mocks.md) — Prefer Stubs Over Mocks for Queries
- [isolate-use-dependency-injection](references/isolate-use-dependency-injection.md) — Use Dependency Injection for Testability

### 4. Test Data Management (HIGH)

- [data-use-factories](references/data-use-factories.md) — Use Factories for Test Data Creation
- [data-minimal-setup](references/data-minimal-setup.md) — Keep Test Setup Minimal
- [data-avoid-mystery-guests](references/data-avoid-mystery-guests.md) — Avoid Mystery Guests
- [data-unique-identifiers](references/data-unique-identifiers.md) — Use Unique Identifiers Per Test
- [data-builder-pattern](references/data-builder-pattern.md) — Use Builder Pattern for Complex Objects

### 5. Assertions & Verification (MEDIUM)

- [assert-specific-assertions](references/assert-specific-assertions.md) — Use Specific Assertions
- [assert-error-messages](references/assert-error-messages.md) — Assert on Error Messages and Types
- [assert-no-assertions-antipattern](references/assert-no-assertions-antipattern.md) — Every Test Must Have Assertions
- [assert-custom-matchers](references/assert-custom-matchers.md) — Create Custom Matchers for Domain Assertions
- [assert-snapshot-testing](references/assert-snapshot-testing.md) — Use Snapshot Testing Judiciously

### 6. Test Organization & Structure (MEDIUM)

- [org-group-by-behavior](references/org-group-by-behavior.md) — Group Tests by Behavior Not Method
- [org-file-structure](references/org-file-structure.md) — Follow Consistent Test File Structure
- [org-setup-teardown](references/org-setup-teardown.md) — Use Setup and Teardown Hooks Appropriately
- [org-test-utilities](references/org-test-utilities.md) — Extract Reusable Test Utilities
- [org-parameterized-tests](references/org-parameterized-tests.md) — Use Parameterized Tests for Variations

### 7. Test Performance & Reliability (MEDIUM)

- [perf-fast-unit-tests](references/perf-fast-unit-tests.md) — Keep Unit Tests Under 100ms
- [perf-avoid-network-calls](references/perf-avoid-network-calls.md) — Eliminate Network Calls in Unit Tests
- [perf-fix-flaky-tests](references/perf-fix-flaky-tests.md) — Fix Flaky Tests Immediately
- [perf-parallelize-tests](references/perf-parallelize-tests.md) — Parallelize Independent Tests
- [perf-avoid-sleep](references/perf-avoid-sleep.md) — Avoid Arbitrary Sleep Calls

### 8. Test Pyramid & Strategy (LOW)

- [strat-test-pyramid](references/strat-test-pyramid.md) — Follow the Test Pyramid
- [strat-e2e-critical-paths](references/strat-e2e-critical-paths.md) — Limit E2E Tests to Critical User Paths
- [strat-coverage-targets](references/strat-coverage-targets.md) — Set Meaningful Coverage Targets
- [strat-integration-boundaries](references/strat-integration-boundaries.md) — Test Integration at Service Boundaries
- [strat-mutation-testing](references/strat-mutation-testing.md) — Use Mutation Testing to Validate Test Quality

## How to Use

Read individual reference files for detailed explanations, wrong vs. correct code examples, and self-check questions. Each file follows the format:

```
---
title: Rule Name
impact: CRITICAL | HIGH | MEDIUM | LOW
impactDescription: measurable benefit
tags: category, keywords
---

## Rule Name
Explanation, incorrect example, correct example, guidelines, reference.
```

## References

- Kent Beck — Test-Driven Development: By Example
- Martin Fowler — [TestDrivenDevelopment](https://martinfowler.com/bliki/TestDrivenDevelopment.html)
- Martin Fowler — [Practical Test Pyramid](https://martinfowler.com/articles/practical-test-pyramid.html)
- Robert C. Martin — [The Cycles of TDD](http://blog.cleancoder.com/uncle-bob/2014/12/17/TheCyclesOfTDD.html)
- Google Testing Blog — [Code Coverage Best Practices](https://testing.googleblog.com/2020/08/code-coverage-best-practices.html)
