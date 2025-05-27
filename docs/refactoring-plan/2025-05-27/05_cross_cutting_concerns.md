# Bookmeter-Refactored: Refactoring Plan - Cross-Cutting Concerns & General Principles

This section addresses overarching principles and concerns that apply across all layers of the `bookmeter-refactored` project. These include adherence to custom coding guidelines, overall project structure, testing, and the refactoring process itself.

## 1. Adherence to `.clinerules` (Custom TypeScript Practices)

-   **Goal**: Consistently apply the TypeScript coding practices defined in your `.clinerules`.
-   **Actions**:
    1.  **Type-First Thinking**:
        -   Before implementing logic, define types and function interfaces. This is already evident in the layered architecture (ports are interfaces). Reinforce this during detailed code review.
    2.  **Functional Approach (FP)**:
        -   Prioritize pure functions and immutable data structures.
        -   Clearly separate functions with side effects (common in the Infrastructure layer) from pure logic.
        -   Use `class` sparingly, primarily for stateful components (as per rules, e.g., `TimeBasedCache` example) or when DI frameworks necessitate them. Most services and use cases can be functional.
    3.  **Error Handling (`Result` vs. `try-catch`)**:
        -   Strictly follow the rule: `Result` type for "business exceptions" (domain/application logic failures that are expected parts of the flow) and `try-catch`/`Error` for "technical exceptions" (unexpected system/network issues, typically in infrastructure).
        -   Avoid algebraic data types like `Option`/`Either` as specified.
    4.  **Adapter Pattern**:
        -   Continue using the Adapter pattern for external dependencies (already in place with ports and adapters). Ensure in-memory adapters are considered for testing.
    5.  **Type System Usage**:
        -   Avoid `any`. Use `unknown` and type narrowing.
        -   Utilize TypeScript's Utility Types.
        -   Employ meaningful names for type aliases.
    6.  **Dependency Injection**:
        -   Inject dependencies (typically via constructors or factory function parameters) to promote decoupling and testability.

## 2. Overall File and Module Organization

-   **Goal**: Ensure a clean, intuitive, and maintainable project structure.
-   **Actions**:
    1.  **Layer Cohesion**:
        -   Ensure files are located within the correct layer (domain, application, infrastructure, presentation).
        -   Minimize dependencies that violate the Clean Architecture's dependency rule (e.g., domain should not know about infrastructure).
    2.  **Module Size**:
        -   Break down overly large files into smaller, more focused modules. Each module should have a single, clear responsibility.
    3.  **`index.ts` for Exports**:
        -   Use `index.ts` files judiciously within directories (e.g., `domain/models/index.ts`, `application/ports/index.ts`) to provide a clean public API for that module and simplify import paths.
        -   Example: `import { Book, ISBN } from '@/domain/models';`
    4.  **Naming Conventions**:
        -   Maintain consistent and descriptive naming for files, directories, types, functions, and variables across the project.

## 3. Asynchronous Operations and Concurrency

-   **Goal**: Manage asynchronous operations effectively, especially for I/O-bound tasks like API calls, scraping, and database access.
-   **Actions**:
    1.  **`async/await`**:
        -   Use `async/await` consistently for managing promises.
    2.  **Concurrency Control**:
        -   For operations like fetching data from multiple APIs or processing lists of items concurrently (e.g., fetching details for multiple ISBNs), use patterns like `Promise.all` or `Promise.allSettled` carefully.
        -   Be mindful of potential rate limits on external services. Implement throttling or batching if necessary (e.g., in `BiblioInfoManager` or scrapers).
    3.  **Non-Blocking I/O**:
        -   Ensure all I/O operations (file system, network, database) are asynchronous to prevent blocking the main thread.

## 4. Testing Strategy (Implied)

-   **Goal**: Ensure the codebase is testable and facilitate a TDD-like approach where applicable.
-   **Actions** (While specific test implementation is out of scope for this plan, the refactoring should enable it):
    1.  **Unit Tests**:
        -   Domain layer logic (entities, value objects, domain services) should be highly unit-testable due to its purity and lack of external dependencies.
        -   Pure functions in other layers are also good candidates for unit tests.
    2.  **Integration Tests**:
        -   Application layer use cases can be tested by mocking their port dependencies (infrastructure adapters).
        -   Infrastructure adapters can be integration-tested against real external services (sparingly, in a separate test suite) or against test doubles (e.g., an in-memory SQLite database, mock HTTP servers).
    3.  **Dependency Injection for Testability**:
        -   The DI pattern is crucial for replacing real dependencies with mocks/stubs in tests.

## 5. Refactoring Process

-   **Goal**: Execute the refactoring systematically and safely.
-   **Actions**:
    1.  **Incremental Changes**:
        -   Apply changes incrementally, focusing on one layer or module at a time.
        -   This aligns with the "start small and expand" principle.
    2.  **Version Control**:
        -   Commit changes frequently with clear messages. Use branches for significant refactoring efforts.
    3.  **Testing (Manual or Automated)**:
        -   After each significant change, test the application to ensure functionality remains intact. If automated tests exist, run them.
    4.  **Review**:
        -   If working in a team, conduct code reviews for refactored sections.

## 6. `data/` Directory

-   **Current State**: Contains `books.sqlite`.
-   **Considerations**:
    1.  This directory is appropriately placed for storing data files.
    2.  Ensure `.gitignore` excludes `books.sqlite` if it's dynamically generated and large, or if it contains sensitive data not meant for version control. If it's a seed database or small, versioning might be acceptable. The current `.gitignore` should be checked.

By focusing on these cross-cutting concerns and general principles alongside the layer-specific refactorings, the `bookmeter-refactored` project will achieve a higher level of code quality, maintainability, and adherence to the desired architectural and coding standards.
