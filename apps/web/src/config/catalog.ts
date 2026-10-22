/**
 * Where the build writes the map of the published books.
 *
 * The artifact owns the slugs: the web build reads them and writes this map
 * next to the pages it generates, so the runtime links a chapter to the page
 * the build published instead of deriving a slug of its own. A book that is
 * not in the map has no published page, so its chapters are rendered without
 * a link.
 *
 * The module declares no imports on purpose: the plugin that writes the map
 * and the application that reads it share it.
 */
export const BOOK_SLUGS_PATH = "/biblia/books.json";

/** The slug of every published book, by name. */
export type BookSlugs = Readonly<Record<string, string>>;
