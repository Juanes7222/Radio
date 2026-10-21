export interface CatalogVerse {
  readonly number: number;
  readonly text: string;
}

export interface CatalogChapter {
  readonly bookSlug: string;
  readonly number: number;
  readonly verses: readonly CatalogVerse[];
}

export interface CatalogBook {
  readonly slug: string;
  readonly name: string;
  readonly order: number;
  readonly testament: 'AT' | 'NT';
  readonly chapterCount: number;
}

export interface CatalogSong {
  readonly title: string;
  readonly album: string;
  readonly genre: string;
}

export interface CatalogArtist {
  readonly slug: string;
  readonly name: string;
  readonly songCount: number;
  readonly songs: readonly CatalogSong[];
}

export interface CatalogVideo {
  readonly videoId: string;
  readonly title: string;
  readonly channelTitle: string;
  readonly publishedAt: string; // ISO date
}

export interface Catalog {
  readonly generatedAt: string; // ISO date
  readonly translation: { readonly abbreviation: string; readonly name: string };
  readonly books: readonly CatalogBook[];
  readonly chapters: readonly CatalogChapter[];
  readonly artists: readonly CatalogArtist[];
  readonly videos: readonly CatalogVideo[];
}
