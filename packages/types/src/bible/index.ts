export interface BibleTranslation {
  id: string;
  abbreviation: string;
  name: string;
}

export interface BibleBook {
  id: string;
  translationId: string;
  name: string;
  abbreviation: string;
  testament: string;
  order: number;
}

export interface BibleChapter {
  id: string;
  bookId: string;
  number: number;
}

export interface BibleVerse {
  id: string;
  chapterId: string;
  number: number;
  text: string;
}

export interface BibleQueryResponse {
  translation: BibleTranslation;
  book: BibleBook;
  chapter: number;
  verses: BibleVerse[];
}
