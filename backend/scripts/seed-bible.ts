import fs from 'fs';
import path from 'path';
import { PrismaClient } from '@prisma/client';
import { PUBLISHED_TRANSLATION, parseBibleXml } from '../src/modules/bible/bibleTranslations';

const BIBLE_XML_DIR = path.resolve(__dirname, '../../packages/assets/bible/Holy-Bible-XML-Format');

/** The translation the station already had; the published one is opt-in. */
const DEFAULT_TRANSLATION = {
  abbreviation: 'RVR1960',
  name: 'Reina Valera 1960',
  file: 'SpanishRVR1960Bible.xml'
} as const;

interface SeedTarget {
  readonly file: string;
  readonly abbreviation: string;
  readonly name: string;
}

function usage(): string {
  return [
    'Usage: ts-node scripts/seed-bible.ts [--published] [file.xml]',
    '',
    '  --published   seed the free-to-redistribute translation:',
    `                ${PUBLISHED_TRANSLATION.abbreviation} (${PUBLISHED_TRANSLATION.name}) from ${PUBLISHED_TRANSLATION.file}`,
    '  --help        print this usage and exit',
    '  file.xml      another XML file of the submodule',
    '',
    `Without --published it seeds ${DEFAULT_TRANSLATION.file} as ${DEFAULT_TRANSLATION.abbreviation} (${DEFAULT_TRANSLATION.name}).`
  ].join('\n');
}

/**
 * Resolves the translation to seed.
 *
 * The first argument that is not a flag names the XML file to read; the
 * translation itself is the published one only when it is asked for.
 */
function resolveTarget(argv: string[]): SeedTarget {
  const source = argv.includes('--published') ? PUBLISHED_TRANSLATION : DEFAULT_TRANSLATION;
  const file = argv.find((arg) => !arg.startsWith('--'));
  return {
    file: file ?? source.file,
    abbreviation: source.abbreviation,
    name: source.name
  };
}

async function seedBible(target: SeedTarget) {
  const prisma = new PrismaClient();

  try {
    console.log('Seeding Bible database...');

    const xmlPath = path.join(BIBLE_XML_DIR, target.file);
    if (!fs.existsSync(xmlPath)) {
      console.warn(`File not found: ${xmlPath}. Please ensure the submodule is initialized.`);
      return;
    }

    console.log(`Parsing ${xmlPath}...`);

    const parsed = parseBibleXml(fs.readFileSync(xmlPath, 'utf8'));
    if (parsed.books.length === 0) {
      console.error('No <bible> root found.');
      return;
    }

    console.log(`Creating translation: ${target.name}`);

    const translation = await prisma.bibleTranslation.upsert({
      where: { abbreviation: target.abbreviation },
      update: { name: target.name },
      create: { abbreviation: target.abbreviation, name: target.name }
    });

    for (const book of parsed.books) {
      console.log(`- Adding Book: ${book.name}`);

      const dbBook = await prisma.bibleBook.upsert({
        where: {
          translationId_name: {
            translationId: translation.id,
            name: book.name
          }
        },
        update: {},
        create: {
          translationId: translation.id,
          name: book.name,
          abbreviation: book.name.substring(0, 3),
          testament: book.testament,
          order: book.number
        }
      });

      for (const chapter of book.chapters) {
        const dbChapter = await prisma.bibleChapter.upsert({
          where: {
            bookId_number: {
              bookId: dbBook.id,
              number: chapter.number
            }
          },
          update: {},
          create: {
            bookId: dbBook.id,
            number: chapter.number
          }
        });

        const verseInput = chapter.verses.map((verse) => ({
          chapterId: dbChapter.id,
          number: verse.number,
          text: verse.text
        }));

        if (verseInput.length > 0) {
          await prisma.bibleVerse.deleteMany({
            where: { chapterId: dbChapter.id }
          });
          await prisma.bibleVerse.createMany({
            data: verseInput
          });
        }
      }
    }

    console.log('Seeding completed successfully!');

    await rebuildBibleFts(prisma);
  } finally {
    await prisma.$disconnect();
  }
}

async function rebuildBibleFts(prisma: PrismaClient): Promise<void> {
  try {
    await prisma.$executeRawUnsafe('CREATE VIRTUAL TABLE IF NOT EXISTS "bible_verse_fts" USING fts5(verse_id UNINDEXED, text, tokenize = \'unicode61\')');
    await prisma.$executeRaw`DELETE FROM bible_verse_fts`;
    await prisma.$executeRaw`INSERT INTO bible_verse_fts(verse_id, text) SELECT id, text FROM "BibleVerse"`;
    console.log('FTS index rebuilt');
  } catch (e) {
    console.warn('Could not rebuild FTS index (table may not exist, run migrations):', e instanceof Error ? e.message : e);
  }
}

const argv = process.argv.slice(2);

if (argv.includes('--help')) {
  console.log(usage());
  process.exit(0);
}

seedBible(resolveTarget(argv)).catch(e => {
  console.error(e);
  process.exit(1);
});
