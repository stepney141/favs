import fs from "node:fs";

import { open, type Database as SqliteDb } from "sqlite"; // Import Database type
import { Database } from "sqlite3";

import { exportFile } from "../../.libs/utils"; // mapToArray is no longer needed here

import { JOB_NAME } from "./constants";

import type { Book, BookList } from "./types"; // CsvBookList is no longer needed here

const DB_FILE = "./books.sqlite";

function sanitizeTableName(name: string): string {
  if (/^\w+$/.test(name)) {
    return name;
  } else {
    throw new Error("Invalid table name.");
  }
}

/**
 * Synchronizes a Map<string, Book> with a SQLite database table using the 'sqlite' package.
 * Inserts new books, updates existing ones, and deletes books not present in the input map.
 * @param bookList - A Map representing the desired state of the books. Keys are bookmeter_urls.
 * @param tableName - The name of the table to synchronize.
 */
export async function saveBookListToDatabase(bookList: BookList, tableName: string): Promise<void> {
  const safeTableName = sanitizeTableName(tableName);
  console.log(`Synchronizing book list with database table: ${safeTableName}`);
  const db = await open({ filename: DB_FILE, driver: Database });

  let deleteStmt = null;
  let insertStmt = null;

  try {
    // Always create the table if it doesn't exist
    const createTableQuery = `
      CREATE TABLE IF NOT EXISTS ${safeTableName} (
        bookmeter_url TEXT PRIMARY KEY,
        isbn_or_asin TEXT,
        book_title TEXT,
        author TEXT,
        publisher TEXT,
        published_date TEXT,
        sophia_opac TEXT,
        utokyo_opac TEXT,
        exist_in_sophia TEXT,
        exist_in_utokyo TEXT,
        sophia_mathlib_opac TEXT,
        description TEXT
      );
    `;
    await db.run(createTableQuery);

    // --- Synchronization Logic ---

    // 1. Get all existing bookmeter_urls and descriptions from the database table
    //    Ensure the type reflects that db.all returns an array.
    const existingRows = await db.all<{ bookmeter_url: string; description: string | null }[]>(
      `SELECT bookmeter_url, description FROM ${safeTableName}`
    );
    const existingData = new Map(existingRows.map((row) => [row.bookmeter_url, row.description]));
    const existingUrls = new Set(existingRows.map((row) => row.bookmeter_url));

    // 2. Get all bookmeter_urls from the input bookList
    const newUrls = new Set(bookList.keys());

    // 3. Determine which URLs to delete
    const urlsToDelete = new Set([...existingUrls].filter((url) => !newUrls.has(url)));

    // --- Database Operations ---

    // Begin transaction
    await db.run("BEGIN TRANSACTION");

    // 4. Delete books that are no longer in the list
    if (urlsToDelete.size > 0) {
      const deleteQuery = `DELETE FROM ${safeTableName} WHERE bookmeter_url = ?`;
      deleteStmt = await db.prepare(deleteQuery);
      console.log(`Deleting ${urlsToDelete.size} books from ${safeTableName}...`);
      for (const url of urlsToDelete) {
        await deleteStmt.run(url);
      }
      await deleteStmt.finalize(); // Finalize delete statement
      deleteStmt = null; // Reset variable
      console.log(`Deletion complete.`);
    }

    // 5. Insert or Replace books from the current list
    //    This handles both new books and updates to existing ones.
    const insertQuery = `
      INSERT OR REPLACE INTO ${safeTableName} (
        bookmeter_url,
        isbn_or_asin,
        book_title,
        author,
        publisher,
        published_date,
        sophia_opac,
        utokyo_opac,
        exist_in_sophia,
        exist_in_utokyo,
        sophia_mathlib_opac,
        description
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    insertStmt = await db.prepare(insertQuery);

    console.log(`Inserting/Updating ${bookList.size} books into ${safeTableName}...`);
    for (const book of bookList.values()) {
      const descriptionToInsert =
        book.description !== undefined && book.description !== null
          ? book.description
          : (existingData.get(book.bookmeter_url) ?? null);
      await insertStmt.run([
        book.bookmeter_url,
        book.isbn_or_asin, // Use null if undefined
        book.book_title,
        book.author,
        book.publisher,
        book.published_date,
        book.sophia_opac,
        book.utokyo_opac,
        book.exist_in_sophia,
        book.exist_in_utokyo,
        book.sophia_mathlib_opac,
        descriptionToInsert
      ]);
    }
    await insertStmt.finalize(); // Finalize insert statement
    insertStmt = null; // Reset variable
    console.log(`Insertion/Update complete.`);

    // Commit the transaction
    await db.run("COMMIT");
    console.log(`Transaction committed for ${safeTableName}.`);
  } catch (error) {
    console.error(`Error during database synchronization for table ${safeTableName}:`, error);
    // Roll back the transaction in case of an error
    await db.run("ROLLBACK");
    console.log(`Transaction rolled back for ${safeTableName}.`);
    throw error; // Re-throw the error after rollback
  } finally {
    // Ensure statements are finalized even if errors occurred before commit/rollback
    if (deleteStmt) await deleteStmt.finalize();
    if (insertStmt) await insertStmt.finalize();
    // Close the database connection
    await db.close();
    console.log(`Database connection closed for ${safeTableName}.`);
  }
}

/**
 * Reads books from the specified table in the SQLite database
 * and deserializes them into a Map<string, Book>.
 * @param tableName - The name of the table to read data from.
 * @returns A Promise that resolves to a Map<string, Book>.
 */
export async function loadBookListFromDatabase(tableName: string): Promise<BookList> {
  const dbExists = fs.existsSync(DB_FILE);
  if (!dbExists) {
    throw new Error(`Database file ${DB_FILE} does not exist.`);
  }

  const db = await open({ filename: DB_FILE, driver: Database });
  const safeTableName = sanitizeTableName(tableName);

  try {
    // Query the table to get all rows
    const rows: Book[] = await db.all(`SELECT * FROM ${safeTableName}`);

    const bookList: BookList = new Map();

    for (const row of rows) {
      const book = {
        bookmeter_url: row.bookmeter_url,
        isbn_or_asin: row.isbn_or_asin,
        book_title: row.book_title,
        author: row.author,
        publisher: row.publisher,
        published_date: row.published_date,
        sophia_opac: row.sophia_opac,
        utokyo_opac: row.utokyo_opac,
        exist_in_sophia: row.exist_in_sophia,
        exist_in_utokyo: row.exist_in_utokyo,
        sophia_mathlib_opac: row.sophia_mathlib_opac,
        description: row.description
      };

      // Add the book to the Map, using 'bookmeter_url' as the key
      bookList.set(book.bookmeter_url, book);
    }

    return bookList;
  } finally {
    await db.close();
  }
}

/**
 * Updates the 'description' field of a book in the database identified by 'isbn_or_asin'.
 * @param isbnOrAsin - The ISBN or ASIN of the book to update.
 * @param newDescription - The new description to set for the book.
 */
export async function updateDescription(tableName: string, isbnOrAsin: string, newDescription: string): Promise<void> {
  const db = await open({ filename: DB_FILE, driver: Database });

  try {
    // Prepare the update statement
    const updateQuery = `
      UPDATE ${tableName}
      SET description = ?
      WHERE isbn_or_asin = ?
    `;
    const stmt = await db.prepare(updateQuery);

    // Execute the update
    const result = await stmt.run(newDescription, isbnOrAsin);

    // Check if any row was updated
    if (result.changes === 0) {
      console.log(`No book found with isbn_or_asin: ${isbnOrAsin}`);
    } else {
      console.log(`Description updated for isbn_or_asin: ${isbnOrAsin}`);
    }

    // Finalize the statement
    await stmt.finalize();
  } catch (error) {
    console.error("Error updating description:", error);
    throw error;
  } finally {
    await db.close();
  }
}

/**
 * Exports the data from a database table to a CSV file.
 * @param tableName - The name of the table to export data from.
 * @param csvFilePath - The path where the CSV file should be saved.
 * @param columns - An array of column names to include in the CSV export.
 * @returns A Promise that resolves when the export is complete.
 */
export async function exportDatabaseTableToCsv(
  tableName: string,
  csvFilePath: string,
  columns: readonly string[] // Accept columns as a parameter
): Promise<void> {
  console.log(
    `${JOB_NAME || "SQLite"}: Exporting columns [${columns.join(", ")}] from table ${tableName} to CSV file ${csvFilePath}`
  );
  const safeTableName = sanitizeTableName(tableName);
  let db: SqliteDb | null = null; // Declare db variable outside try block

  try {
    // Check if database file exists
    if (!fs.existsSync(DB_FILE)) {
      throw new Error(`Database file ${DB_FILE} does not exist.`);
    }

    db = await open({ filename: DB_FILE, driver: Database }); // Open database connection

    // Construct the SELECT query dynamically based on the provided columns
    const selectColumns = columns.join(", ");
    const query = `SELECT ${selectColumns} FROM ${safeTableName}`;

    console.log(`${JOB_NAME || "SQLite"}: Executing query: ${query}`);

    // Fetch only the specified columns directly from the database
    // The result is already an array of objects, suitable for CSV export
    const dataToExport = await db.all(query);

    console.log(`${JOB_NAME || "SQLite"}: Fetched ${dataToExport.length} rows from ${safeTableName}.`);

    // Export the fetched data to CSV
    await exportFile({
      fileName: csvFilePath,
      payload: dataToExport, // Use the directly fetched data
      targetType: "csv",
      mode: "overwrite"
    });

    console.log(`${JOB_NAME || "SQLite"}: Successfully exported ${dataToExport.length} books to ${csvFilePath}`);
  } catch (error) {
    console.error(`${JOB_NAME || "SQLite"}: Error exporting table ${tableName} to CSV:`, error);
    throw error; // Re-throw the error
  } finally {
    // Ensure the database connection is closed
    if (db) {
      await db.close();
      console.log(`${JOB_NAME || "SQLite"}: Database connection closed.`);
    }
  }
}

/**
 * Checks if a book with the given ISBN/ASIN exists in the specified table
 * and has a description (either populated or explicitly set as empty).
 * @param tableName - The name of the table to check.
 * @param isbnOrAsin - The ISBN or ASIN of the book to check.
 * @returns A Promise that resolves to true if the book exists and has a description field that has been checked, false otherwise.
 */
export async function checkBookDescriptionExists(tableName: string, isbnOrAsin: string): Promise<boolean> {
  const db = await open({ filename: DB_FILE, driver: Database });
  const safeTableName = sanitizeTableName(tableName);

  try {
    const query = `
      SELECT description
      FROM ${safeTableName}
      WHERE isbn_or_asin = ?
    `;

    console.log(
      `${JOB_NAME || "SQLite"}: Checking if description exists for isbn_or_asin: ${isbnOrAsin} in table ${safeTableName}`
    );

    // Ensure the type reflects that db.get might return undefined if no row is found.
    const result = await db.get<{ description: string | null }>(query, isbnOrAsin);

    console.log(
      `${JOB_NAME || "SQLite"}: Query result for ${isbnOrAsin}: ${result ? (result.description === null ? "description is NULL" : `description exists (length: ${result.description.length})`) : "no row found"}`
    );

    // Check if a row was found and if the description is not null.
    // An empty string means it was checked but no description was found.
    if (result && result.description && result.description.trim().length > 0) {
      console.log(
        `${JOB_NAME || "SQLite"}: Description exists for isbn_or_asin: ${isbnOrAsin} (length: ${result.description.trim().length}). Skipping fetch.`
      );
      return true;
    } else {
      console.log(
        `${JOB_NAME || "SQLite"}: Description missing or empty for isbn_or_asin: ${isbnOrAsin} in table ${safeTableName}. Needs fetching.`
      );
      return false;
    }
  } catch (error) {
    console.error(`Error checking description for isbn_or_asin ${isbnOrAsin} in table ${safeTableName}:`, error);
    // In case of error, assume description doesn't exist to potentially allow fetching
    return false;
  } finally {
    await db.close();
  }
}

/*
// Example usages
(async () => {
  const wishList = await getPrevBookList("./csv/bookmeter_wish_books.csv");
  const stackedList = await getPrevBookList("./csv/bookmeter_stacked_books.csv");
  if (wishList === null || stackedList === null) {
    console.log("The booklist is not found.");
    process.exit(1);
  }

  try {
    await saveBookListToDatabase(wishList, "wish");
    await saveBookListToDatabase(stackedList, "stacked");
  } catch (error) {
    console.error(`Error saving book list to database:`, error);
    process.exit(1);
  }
})();
*/
