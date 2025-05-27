# Bookmeter-Refactored: Refactoring Plan - Presentation Layer

The Presentation Layer is responsible for all user interactions, setting up the application (including dependency injection), and initiating use cases. In this project, it primarily involves the command-line interface (CLI) and the main entry point.

## 1. Review of Current Presentation Structure

The `presentation/` directory currently contains:
-   `index.ts`: The main entry point of the application.
-   `cli/`:
    -   `commandExecutor.ts`: Likely handles parsing CLI arguments and executing corresponding commands/use cases.
    -   `constants.ts`: Constants specific to the CLI.
-   `di/`:
    -   `container.ts`: Sets up the dependency injection container, wiring together interfaces (ports) with their concrete implementations.
    -   `types.ts`: Type definitions for the DI container (e.g., symbols for binding).

## 2. Proposed Refactoring Points

### 2.1. Main Entry Point (`presentation/index.ts`)

-   **Goal**: Ensure the entry point is lean, primarily responsible for initializing the DI container and delegating to the CLI command executor.
-   **Actions**:
    1.  **Simplicity**:
        -   `index.ts` should be as simple as possible. Its main tasks are:
            -   Setting up any global configurations (e.g., environment variables, though this is often better handled by a config loader).
            -   Initializing the DI container.
            -   Invoking the CLI command processing logic.
    2.  **Error Handling**:
        -   Implement top-level error handling to catch any unhandled exceptions from the application, log them appropriately, and exit gracefully.

### 2.2. Dependency Injection (`presentation/di/`)

-   **Goal**: Ensure a clean, maintainable, and type-safe DI setup.
-   **Actions**:
    1.  **Container Setup (`container.ts`)**:
        -   Verify that all necessary dependencies are registered in the container.
        -   Ensure that infrastructure adapters are correctly bound to their respective application ports.
        -   Configuration values (e.g., API keys, file paths) needed by infrastructure adapters should be sourced (e.g., from environment variables or a config file) and injected here.
    2.  **Type Safety (`types.ts`)**:
        -   Ensure that symbols or identifiers used for binding and resolving dependencies are type-safe and clearly defined.
    3.  **Modularity**:
        -   If the DI setup becomes very large, consider breaking it into modules (e.g., `infrastructureModule`, `applicationModule`) that can be composed. Many DI frameworks support this.
    4.  **Framework Choice (if applicable)**:
        -   The current structure suggests a manual or lightweight DI setup. If a DI framework (like InversifyJS, tsyringe) is being used or considered, ensure its best practices are followed. Your `.clinerules` prefer function-based approaches, so a lightweight functional DI approach might be suitable.
        -   Example of a simple functional DI approach (conceptual):
            ```typescript
            // presentation/di/container.ts
            import { createGetBookListUseCase, GetBookListUseCase } from '@/application/usecases/getBookListUseCase';
            import { createSqliteBookRepository, BookRepository } from '@/infrastructure/adapters/repositories/sqliteBookRepository';
            import { createConsoleLogger, Logger } from '@/infrastructure/adapters/logging/consoleLogger';
            // ... other imports

            export interface AppContainer {
              getBookListUseCase: GetBookListUseCase;
              // ... other use cases
            }

            export function createAppContainer(config: AppConfig): AppContainer {
              // Instantiate adapters with config
              const logger: Logger = createConsoleLogger(config.logLevel);
              const bookRepository: BookRepository = createSqliteBookRepository(config.dbPath, logger);
              // ... other adapters

              // Instantiate use cases with adapters
              const getBookListUseCase: GetBookListUseCase = createGetBookListUseCase(bookRepository);
              // ... other use cases

              return {
                getBookListUseCase,
                // ...
              };
            }

            export interface AppConfig {
              dbPath: string;
              logLevel: string;
              // ... other config values
            }
            ```

### 2.3. CLI Handling (`presentation/cli/`)

-   **Goal**: Ensure the CLI is user-friendly, robust, and cleanly separated from application logic.
-   **Actions**:
    1.  **Argument Parsing (`commandExecutor.ts`)**:
        -   Use a well-established CLI argument parsing library (e.g., `yargs`, `commander`) for robust parsing of commands, options, and arguments. This simplifies validation and help message generation.
        -   The `commandExecutor.ts` should parse arguments and then resolve the appropriate use case from the DI container, passing the necessary parameters.
    2.  **Command Structure**:
        -   Define a clear command structure (e.g., `app <command> [options]`).
        -   Each command should map to a specific use case.
    3.  **Output Formatting**:
        -   Format output (success messages, error messages, data displays) in a user-friendly way.
        -   Use the `Logger` for informational messages and error reporting.
    4.  **Error Handling**:
        -   Handle errors returned by use cases (from the `Result` object) and display them appropriately to the user.
        -   Distinguish between business errors (from `Result.err`) and unexpected technical errors.
    5.  **Separation of Concerns**:
        -   CLI logic should be strictly about parsing input and formatting output. It should not contain any business logic itself but delegate to application use cases.
    6.  **Constants (`constants.ts`)**:
        -   Ensure CLI-specific constants (e.g., command names, option descriptions) are well-organized here.

### 2.4. Configuration Management

-   **Goal**: Manage application configuration (API keys, database paths, etc.) securely and flexibly.
-   **Actions**:
    1.  **Source**:
        -   Prefer loading configuration from environment variables or dedicated configuration files (e.g., `.env`, JSON, YAML files) rather than hardcoding.
    2.  **Loading**:
        -   Implement a configuration loader (this could be a simple utility or part of the DI setup) that reads configuration at startup.
    3.  **Injection**:
        -   Inject configuration values into the relevant infrastructure adapters via the DI container. Domain and application layers should generally not be aware of configuration sources.

By refining the Presentation Layer, the application will have a well-defined entry point, a robust CLI, and a clean mechanism for wiring dependencies, making it easier to run, test, and maintain.
