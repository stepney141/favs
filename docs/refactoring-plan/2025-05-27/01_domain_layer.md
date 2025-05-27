# Bookmeter-Refactored: Refactoring Plan - Domain Layer

The Domain Layer is the heart of the application, containing the core business logic, entities, and value objects. Refactoring this layer will focus on strengthening its integrity, clarity, and adherence to domain-driven design (DDD) and functional programming (FP) principles.

## 1. Review of Current Domain Structure

The `domain/` directory currently contains:
-   `models/`:
    -   `book.ts`: Defines the `Book` entity and related types.
    -   `errors.ts`: Defines custom error types for the domain.
    -   `result.ts`: Implements the `Result` type for error handling.
    -   `valueObjects.ts`: Intended for value objects.
-   `services/`:
    -   `isbnService.ts`: Contains logic related to ISBN validation or manipulation.

## 2. Proposed Refactoring Points

### 2.1. `Book` Entity (`domain/models/book.ts`)

-   **Goal**: Ensure `Book` is a true entity with encapsulated logic and strong typing.
-   **Actions**:
    1.  **Review Properties**:
        -   Ensure all properties are well-typed. Consider introducing more specific value objects (see section 2.3) for properties like `title`, `authors`, `publisher`, `publicationDate`, `coverImageUrl`, etc., instead of using primitive types directly.
        -   Example: `title: string` could become `title: BookTitle` (a value object).
    2.  **Encapsulate Business Logic**:
        -   Identify any logic related to a `Book` instance that is currently outside the `Book` model and move it into the `Book` type itself, perhaps as functions that operate on `Book` data if a class-based entity is not preferred.
        -   For instance, if there are rules about how a book's status can change or how its properties relate, these should be part of the `Book`'s definition or closely associated functions.
    3.  **Immutability**:
        -   Ensure `Book` instances are treated as immutable. If modifications are needed, functions should return a new `Book` instance with the changes, aligning with FP principles.
        -   Use `readonly` for properties where appropriate.
    4.  **Factory Function**:
        -   Implement a factory function (e.g., `createBook(...)`) for constructing `Book` instances. This function can encapsulate validation logic to ensure a `Book` is always created in a valid state. It should return a `Result<Book, DomainError>` to handle creation failures gracefully.

### 2.2. `Result` Type and Error Handling (`domain/models/result.ts`, `domain/models/errors.ts`)

-   **Goal**: Standardize error handling according to `.clinerules` and improve error type clarity.
-   **Actions**:
    1.  **Consistent `Result` Usage**:
        -   Ensure all domain operations that can fail due to business rules return a `Result<T, E>`.
        -   Verify that the existing `Result` type implementation (`ok`, `err`, `isOk`, `isErr`) is robust and aligns with common patterns.
    2.  **Specific Domain Errors (`errors.ts`)**:
        -   Define more granular and descriptive error types within `errors.ts`. For example, instead of a generic `ValidationError`, have `InvalidIsbnError`, `MissingTitleError`, etc.
        -   Each error type should clearly convey its meaning and potentially carry relevant context.
        -   Ensure these errors are used within the `Result` type's error variant.
    3.  **Adherence to `.clinerules`**:
        -   Double-check that the distinction between business exceptions (using `Result`) and technical exceptions (using `try-catch` and `Error` type) is clearly maintained throughout the domain layer.

### 2.3. Value Objects (`domain/models/valueObjects.ts`)

-   **Goal**: Enhance type safety and domain expressiveness by properly implementing and utilizing value objects.
-   **Actions**:
    1.  **Identify Candidates**:
        -   Review `Book` properties and other domain concepts to identify candidates for value objects. Examples: `ISBN`, `BookTitle`, `AuthorName`, `PublicationYear`, `PageCount`.
    2.  **Implement Value Objects**:
        -   Each value object should:
            -   Be immutable (all properties `readonly`).
            -   Encapsulate validation logic within its constructor or factory function (e.g., an `ISBN` value object should validate the ISBN format upon creation).
            -   Provide methods for equality comparison (e.g., `equals(other: ISBN): boolean`).
            -   Be defined as a type or a simple class with a private constructor and a static factory method returning `Result<ValueObject, ValidationError>`.
        -   Example for `ISBN`:
            ```typescript
            // In domain/models/valueObjects.ts
            export type ISBN = Readonly<{ value: string; type: 'ISBN' }>; // Nominal typing
            export type InvalidIsbnFormatError = { type: 'InvalidIsbnFormat'; message: string };

            export function createIsbn(value: string): Result<ISBN, InvalidIsbnFormatError> {
              if (!isValidIsbnFormat(value)) { // isValidIsbnFormat would be a utility
                return err({ type: 'InvalidIsbnFormat', message: `Invalid ISBN format: ${value}` });
              }
              return ok({ value, type: 'ISBN' });
            }
            ```
    3.  **Integrate Value Objects**:
        -   Replace primitive types in entities (e.g., `Book`) and service signatures with these new value objects.

### 2.4. Domain Services (`domain/services/isbnService.ts`)

-   **Goal**: Ensure domain services contain only core domain logic and are stateless.
-   **Actions**:
    1.  **Review Responsibilities**:
        -   Analyze `isbnService.ts`. If it performs operations like fetching data from external sources or complex orchestrations involving infrastructure, this logic might belong in the application layer (use cases) or infrastructure layer (adapters).
        -   Domain services should ideally operate on domain objects and value objects, encapsulating logic that doesn't naturally fit within a single entity or value object but is still purely domain-focused (e.g., complex validation rules involving multiple domain concepts, calculations based on domain state).
    2.  **Statelessness and Purity**:
        -   Ensure functions within `isbnService.ts` are pure and stateless if possible. They should take domain objects/value objects as input and return new domain objects/value objects or `Result` types.
    3.  **Naming and Location**:
        -   Consider if `isbnService` is the best name or if its responsibilities could be broken down or merged elsewhere. For example, ISBN validation logic might be better suited within an `ISBN` value object's factory.

### 2.5. General File Structure and Organization

-   **Goal**: Improve clarity and maintainability of the domain layer's file structure.
-   **Actions**:
    1.  **Co-location**:
        -   Consider co-locating highly related types. For example, if `Book` has specific error types only relevant to it, they could be defined in `book.ts` or a `book.errors.ts` file. However, a central `errors.ts` for all domain errors is also acceptable if preferred.
    2.  **Clarity of `valueObjects.ts`**:
        -   If `valueObjects.ts` becomes too large, consider splitting it by concept (e.g., `bookValueObjects.ts`, `sharedValueObjects.ts`) or creating a subdirectory `domain/models/valueObjects/`.
    3.  **Exports**:
        -   Ensure clean and intentional exports from each module using `index.ts` files within subdirectories if necessary (e.g., `domain/models/index.ts`, `domain/services/index.ts`) to simplify imports in other layers.

By addressing these points, the domain layer will become more robust, expressive, and easier to maintain, forming a solid foundation for the rest of the application.
