# Bookmeter-Refactored: Refactoring Plan - Application Layer

The Application Layer orchestrates the application's use cases. It directs the domain layer and coordinates with the infrastructure layer through ports (interfaces). Refactoring this layer will focus on ensuring clear, well-defined use cases and robust port definitions, further strengthening the separation of concerns.

## 1. Review of Current Application Structure

The `application/` directory currently contains:
-   `ports/output/`: Defines output ports (interfaces) for services provided by the infrastructure layer.
    -   `biblioInfoProvider.ts`
    -   `bookContentScraperService.ts`
    -   `bookRepository.ts`
    -   `bookScraperService.ts`
    -   `logger.ts`
    -   `storageService.ts`
-   `usecases/`: Implements the application-specific use cases.
    -   `crawlBookDescriptionUseCase.ts`
    -   `fetchBiblioInfoUseCase.ts`
    -   `getBookListUseCase.ts`
    -   `saveBookListUseCase.ts`

## 2. Proposed Refactoring Points

### 2.1. Output Ports (`application/ports/output/`)

-   **Goal**: Ensure ports are well-defined, granular, and effectively abstract infrastructure concerns.
-   **Actions**:
    1.  **Review Port Granularity (Interface Segregation Principle)**:
        -   Examine each port (e.g., `BookRepository`, `BiblioInfoProvider`) to ensure it's not a "fat" interface. If a port defines too many unrelated methods, consider splitting it into smaller, more focused interfaces.
        -   For example, if `BookRepository` handles both `Book` entities and perhaps other unrelated data, it might need segregation.
    2.  **Method Signatures**:
        -   Ensure method signatures within ports use domain types (from `domain/models/`) or primitive types for input and output where appropriate. Avoid leaking infrastructure-specific details or types through port definitions.
        -   All methods that can result in a business-related failure should return `Promise<Result<T, E>>`, where `E` is a domain error type or a more generic application-level error type if necessary.
    3.  **Naming Conventions**:
        -   Verify that port names clearly reflect the abstraction they provide (e.g., `BookRepository` is good; `DataProvider` might be too generic).
        -   Method names should be intention-revealing.
    4.  **Completeness**:
        -   Ensure all necessary interactions with the infrastructure layer are covered by well-defined ports.

### 2.2. Use Cases (`application/usecases/`)

-   **Goal**: Ensure use cases are focused, orchestrate domain logic and infrastructure via ports, and adhere to functional principles.
-   **Actions**:
    1.  **Single Responsibility**:
        -   Each use case file/function/class should represent a single, specific user interaction or system operation (e.g., `SaveBookListUseCase` should only handle saving a book list).
    2.  **Orchestration, Not Logic**:
        -   Use cases should primarily orchestrate calls to domain services/entities and infrastructure services (via ports). Complex business logic should reside in the domain layer.
        -   Avoid embedding significant business rules directly within use case implementations.
    3.  **Dependency Inversion**:
        -   Use cases must depend only on abstractions (ports defined in `application/ports/`) and domain types, never on concrete infrastructure implementations. Dependencies (port implementations) will be injected at runtime (typically in the `presentation` layer).
    4.  **Input/Output**:
        -   Define clear input parameters (possibly as simple DTOs or specific domain types/value objects) for each use case.
        -   Use cases should return `Promise<Result<T, E>>` to clearly communicate success or business-related failure. `T` could be a simple success indicator, a domain entity, or a DTO.
    5.  **Statelessness**:
        -   Use cases should ideally be stateless. Any required state should be passed in as arguments or retrieved via repositories.
    6.  **Functional Approach**:
        -   As per `.clinerules`, prefer functions for use cases if they don't manage internal state. If a class is used, it should be simple and primarily serve to group related operations or manage injected dependencies.
        -   Example of a functional use case:
            ```typescript
            // In application/usecases/getBookListUseCase.ts
            import { Book } from '@/domain/models/book';
            import { BookRepository } from '@/application/ports/output/bookRepository';
            import { Result } from '@/domain/models/result';
            import { DomainError } from '@/domain/models/errors';

            export type GetBookListUseCase = (userId: string) => Promise<Result<Book[], DomainError>>;

            export function createGetBookListUseCase(bookRepository: BookRepository): GetBookListUseCase {
              return async (userId: string) => {
                // Logging, authorization, etc. can happen here
                return bookRepository.findByUser(userId); // Assuming findByUser returns Promise<Result<Book[], DomainError>>
              };
            }
            ```
    7.  **Transaction Management**:
        -   If use cases involve multiple operations that need to be atomic (e.g., multiple repository calls), consider how transactions are managed. This might involve a `UnitOfWork` pattern, potentially defined as another port.

### 2.3. Data Transfer Objects (DTOs)

-   **Goal**: Ensure clear data contracts for use case inputs and outputs, especially if they differ from domain entities.
-   **Actions**:
    1.  **Identify Need**:
        -   If use case inputs require data not directly mapping to a domain entity (e.g., data from a web form), define specific input DTOs.
        -   Similarly, if use case outputs need to be shaped differently from domain entities for the presentation layer, define output DTOs.
    2.  **Location**:
        -   DTOs specific to a use case can be defined within the use case file or in a shared `application/dtos/` directory if they are reused.
    3.  **Simplicity**:
        -   DTOs should be simple data structures with no behavior.

### 2.4. File Organization

-   **Goal**: Maintain a clear and logical structure within the `application/` directory.
-   **Actions**:
    1.  **Port Grouping**:
        -   The current `ports/output/` structure is good. Consider `ports/input/` if you adopt a command/query pattern where use cases themselves are defined by input port interfaces.
    2.  **Use Case Grouping**:
        -   If the number of use cases grows significantly, consider subdirectories within `usecases/` based on domain aggregate or feature.

By refining the Application Layer as described, the project will have a clearer separation between application-specific orchestration and core domain logic, leading to improved testability and maintainability.
