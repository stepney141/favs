# Bookmeter-Refactored: Refactoring Plan - Infrastructure Layer

The Infrastructure Layer contains concrete implementations (adapters) of the ports defined in the Application Layer. It deals with external concerns such as databases, web APIs, file systems, and third-party libraries. Refactoring this layer will focus on robustness, efficiency, proper error handling, and adherence to the defined port contracts.

## 1. Review of Current Infrastructure Structure

The `infrastructure/` directory currently contains:
-   `adapters/`:
    -   `apis/`: Implementations for fetching data from external bibliographic APIs.
        -   `biblioInfoManager.ts`: Likely orchestrates multiple API providers.
        -   `googleBooksProvider.ts`, `isbndbProvider.ts`, `ndlProvider.ts`, `openBDProvider.ts`: Specific API client implementations.
        -   `index.ts`: Exports from the `apis` directory.
    -   `logging/`:
        -   `consoleLogger.ts`: Implements the `Logger` port.
    -   `repositories/`:
        -   `sqliteBookRepository.ts`: Implements the `BookRepository` port using SQLite.
    -   `scraping/`:
        -   `bookmeterScraper.ts`: Implements `BookScraperService` for Bookmeter.
        -   `kinokuniyaScraper.ts`: Implements `BookContentScraperService` for Kinokuniya.
    -   `storage/`:
        -   `fileStorageService.ts`: Implements `StorageService` for file system operations.
-   `utils/`:
    -   `apiUtils.ts`: Utilities for API interactions (e.g., request retries, error handling).
    -   `puppeteerUtils.ts`: Utilities for Puppeteer-based scraping.

## 2. Proposed Refactoring Points

### 2.1. API Adapters (`infrastructure/adapters/apis/`)

-   **Goal**: Ensure API adapters are resilient, configurable, and correctly implement the `BiblioInfoProvider` port.
-   **Actions**:
    1.  **Interface Adherence**:
        -   Verify that each provider (`googleBooksProvider`, `isbndbProvider`, etc.) and the `biblioInfoManager` correctly implement the `BiblioInfoProvider` port (or a more specific port if `BiblioInfoProvider` is too broad).
        -   Ensure they transform API-specific responses into the domain types or DTOs expected by the application layer.
    2.  **Error Handling**:
        -   Implement robust error handling for network issues, API rate limits, unexpected response formats, etc.
        -   Translate API-specific errors into `Result` types with appropriate error variants (e.g., `ApiError`, `NetworkError`, `BookNotFoundError`) as expected by the port. Use `try-catch` for technical exceptions (e.g., network failure) and map them to `Result.err`.
    3.  **Configuration**:
        -   Externalize API keys, base URLs, and other configurations. These should be injected into the adapters (e.g., via constructor or factory function) rather than being hardcoded.
    4.  **Resilience**:
        -   Implement retry mechanisms (e.g., exponential backoff) for transient network errors, possibly using `apiUtils.ts`.
        -   Consider a circuit breaker pattern if appropriate for certain APIs.
    5.  **`biblioInfoManager.ts` Logic**:
        -   Review its strategy for querying multiple providers (e.g., fallback, parallel). Ensure this logic is clear and efficient.
        -   This manager might implement a composite `BiblioInfoProvider` port.
    6.  **Functional Style**:
        -   Prefer function-based adapters as per `.clinerules`, especially if they are stateless. Configuration can be passed to factory functions.
            ```typescript
            // Example: infrastructure/adapters/apis/openBDProvider.ts
            import { BiblioInfoProvider, BiblioData } from '@/application/ports/output/biblioInfoProvider';
            import { ISBN } from '@/domain/models/valueObjects';
            import { Result, ok, err } from '@/domain/models/result';
            // ... other necessary imports

            type OpenBDApiError = { type: 'OpenBDApiError', message: string, statusCode?: number };

            export function createOpenBDProvider(baseUrl: string): BiblioInfoProvider {
              return {
                fetchByIsbn: async (isbn: ISBN): Promise<Result<BiblioData, OpenBDApiError>> => {
                  try {
                    const response = await fetch(`${baseUrl}/get?isbn=${isbn.value}`);
                    if (!response.ok) {
                      return err({ type: 'OpenBDApiError', message: `HTTP error: ${response.status}`, statusCode: response.status });
                    }
                    const data = await response.json();
                    if (!data || data.length === 0 || !data[0]) {
                      return err({ type: 'OpenBDApiError', message: 'Book not found or invalid response' });
                    }
                    // Transform data[0].summary to BiblioData
                    const biblioData: BiblioData = { /* ... mapping ... */ };
                    return ok(biblioData);
                  } catch (error) {
                    return err({ type: 'OpenBDApiError', message: error instanceof Error ? error.message : 'Unknown network error' });
                  }
                }
              };
            }
            ```

### 2.2. Logging Adapter (`infrastructure/adapters/logging/consoleLogger.ts`)

-   **Goal**: Ensure the logging adapter is simple and effective.
-   **Actions**:
    1.  **Interface Adherence**: Verify it correctly implements the `Logger` port from `application/ports/output/logger.ts`.
    2.  **Configurability**: Consider if log levels or output formats need to be configurable (though for `consoleLogger`, simplicity is often key).
    3.  **Asynchronous Logging**: If logging involves I/O that could block, ensure it's handled asynchronously without impacting application performance. For console logging, this is less of a concern.

### 2.3. Repository Adapter (`infrastructure/adapters/repositories/sqliteBookRepository.ts`)

-   **Goal**: Ensure the repository is robust, handles database interactions correctly, and maps data to/from domain entities.
-   **Actions**:
    1.  **Interface Adherence**: Verify it correctly implements the `BookRepository` port.
    2.  **Query Efficiency**: Review SQL queries for correctness and efficiency.
    3.  **Data Mapping**: Ensure proper mapping between SQLite table rows and the `Book` domain entity (including any value objects). This mapping logic should be encapsulated within the repository.
    4.  **Error Handling**:
        -   Handle database errors (connection issues, query failures) gracefully.
        -   Return `Result` types for operations that might fail due to business constraints (e.g., `findBookById` returning `Result<Book | undefined, DbError>`).
    5.  **Transaction Management**: If the `BookRepository` port defines methods requiring transactional consistency (e.g., `saveAll`), ensure `sqliteBookRepository.ts` implements this correctly using SQLite transaction mechanisms. This might be coordinated by a `UnitOfWork` adapter if such a port exists.
    6.  **Connection Management**: Ensure database connections are managed properly (opened, closed, pooled if necessary).

### 2.4. Scraping Adapters (`infrastructure/adapters/scraping/`)

-   **Goal**: Ensure scrapers are resilient to website changes, handle errors gracefully, and correctly implement their respective ports.
-   **Actions**:
    1.  **Interface Adherence**:
        -   `bookmeterScraper.ts` should implement `BookScraperService`.
        -   `kinokuniyaScraper.ts` should implement `BookContentScraperService`.
    2.  **Robustness**:
        -   Scraping logic is often brittle. Use robust selectors and error handling.
        -   Log extensively during scraping to aid debugging.
    3.  **Error Handling**:
        -   Handle common scraping issues: page not found, structure changes, CAPTCHAs (though handling these automatically is complex and may be out of scope).
        -   Return `Result` types with appropriate error variants (e.g., `ScrapingError`, `ContentNotFoundError`).
    4.  **Puppeteer Usage (`puppeteerUtils.ts`)**:
        -   Ensure `puppeteerUtils.ts` provides helpful abstractions for common Puppeteer tasks (launching browser, navigating, waiting for elements, safe data extraction).
        -   Manage browser instances carefully (e.g., ensure they are closed).
    5.  **Data Extraction and Transformation**:
        -   Ensure extracted data is correctly transformed into the domain types or DTOs expected by the application layer.

### 2.5. Storage Adapter (`infrastructure/adapters/storage/fileStorageService.ts`)

-   **Goal**: Ensure file operations are safe and reliable.
-   **Actions**:
    1.  **Interface Adherence**: Verify it correctly implements the `StorageService` port.
    2.  **Error Handling**: Handle file system errors (permissions, file not found, disk full) and return `Result` types.
    3.  **Path Management**: Ensure file paths are handled safely and correctly, considering cross-platform compatibility if necessary.
    4.  **Asynchronous Operations**: Use asynchronous file operations for non-blocking I/O.

### 2.6. Utilities (`infrastructure/utils/`)

-   **Goal**: Ensure utilities are well-defined, reusable, and specific to infrastructure concerns.
-   **Actions**:
    1.  **`apiUtils.ts`**:
        -   Consolidate common API interaction patterns like request formatting, response parsing, retry logic.
        -   Ensure functions are generic enough to be used by multiple API adapters if applicable.
    2.  **`puppeteerUtils.ts`**:
        -   Provide robust helper functions for Puppeteer to reduce boilerplate in scraper implementations.
        -   Examples: safe navigation, element text extraction with fallbacks, screenshot capture for debugging.
    3.  **Scope**: Ensure these utilities do not contain business logic or depend on application/domain layers. They should be pure infrastructure concerns.

By systematically addressing these points, the Infrastructure Layer will become a more reliable and maintainable set of adapters, effectively bridging the application's core logic with external systems and services.
