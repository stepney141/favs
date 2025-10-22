# Bookmeter Refactored (scaffold)

This directory hosts the refactored architecture skeleton for the Bookmeter project, following the plan created on 2025-10-22.

## Structure
- `src/interfaces` — entry points (CLI, future adapters).
- `src/application` — use cases and orchestration services operating on domain abstractions.
- `src/domain` — entities, repository ports, and pure services.
- `src/infrastructure` — concrete adapters for scraping, HTTP APIs, persistence, export, and messaging.
- `src/shared` — cross-cutting concerns such as configuration, logging, concurrency helpers, and clocks.

Each file currently contains TypeScript interfaces and TODO blocks to guide implementation.
