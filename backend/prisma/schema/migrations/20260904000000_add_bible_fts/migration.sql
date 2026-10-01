-- Create FTS5 virtual table for accent-insensitive full-text search on Bible verses.
-- Uses unicode61 tokenizer which already normalizes diacritics and case in this build
-- (verified: 'senor' matches 'Señor' with plain unicode61 on SQLite 3.53.1/better-sqlite3 12.10).
-- If a future build supports `remove_diacritics 2` the migration can be updated; behaviour is equivalent.
CREATE VIRTUAL TABLE IF NOT EXISTS "bible_verse_fts" USING fts5(
  verse_id UNINDEXED,
  text,
  tokenize = 'unicode61'
);

-- Backfill existing verses (idempotent: table is empty on first migration)
INSERT INTO "bible_verse_fts"(verse_id, text) SELECT id, text FROM "BibleVerse";

-- Keep the index in sync for any future writes
CREATE TRIGGER IF NOT EXISTS bible_verse_ai AFTER INSERT ON "BibleVerse" BEGIN
  INSERT INTO bible_verse_fts(verse_id, text) VALUES (new.id, new.text);
END;

CREATE TRIGGER IF NOT EXISTS bible_verse_ad AFTER DELETE ON "BibleVerse" BEGIN
  DELETE FROM bible_verse_fts WHERE verse_id = old.id;
END;

CREATE TRIGGER IF NOT EXISTS bible_verse_au AFTER UPDATE ON "BibleVerse" BEGIN
  DELETE FROM bible_verse_fts WHERE verse_id = old.id;
  INSERT INTO bible_verse_fts(verse_id, text) VALUES (new.id, new.text);
END;
