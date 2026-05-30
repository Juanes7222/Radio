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
  _count?: {
    chapters: number;
  };
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

export interface BibleSearchResult {
  id: string;
  text: string;
  number: number;
  chapter: {
    number: number;
    book: {
      name: string;
    };
  };
}
