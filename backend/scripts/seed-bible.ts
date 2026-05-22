import fs from 'fs';
import path from 'path';
import { XMLParser } from 'fast-xml-parser';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const BIBLE_XML_DIR = path.resolve(__dirname, '../../packages/assets/bible/Holy-Bible-XML-Format');

async function seedBible() {
  console.log('Seeding Bible database...');
  
  // Try to find Spanish Reina Valera 1960 or similar
  const xmlPath = path.join(BIBLE_XML_DIR, 'SpanishRVR1960Bible.xml');
  if (!fs.existsSync(xmlPath)) {
    console.warn(`File not found: ${xmlPath}. Please ensure the submodule is initialized.`);
    return;
  }

  console.log(`Parsing ${xmlPath}...`);
  
  const xmlContent = fs.readFileSync(xmlPath, 'utf8');
  
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_'
  });
  
  const parsed = parser.parse(xmlContent);
  const bibleObj = parsed.bible;
  
  if (!bibleObj) {
      console.error('No <bible> root found.');
      return;
  }
  
  const translationName = 'Reina Valera 1960';
  const abbreviation = 'RVR1960';

  console.log(`Creating translation: ${translationName}`);
  
  const translation = await prisma.bibleTranslation.upsert({
    where: { abbreviation },
    update: { name: translationName },
    create: { abbreviation, name: translationName }
  });

  const bookNames = [
      "", "Génesis", "Éxodo", "Levítico", "Números", "Deuteronomio", "Josué", "Jueces", "Rut",
      "1 Samuel", "2 Samuel", "1 Reyes", "2 Reyes", "1 Crónicas", "2 Crónicas", "Esdras", "Nehemías",
      "Ester", "Job", "Salmos", "Proverbios", "Eclesiastés", "Cantares", "Isaías", "Jeremías",
      "Lamentaciones", "Ezequiel", "Daniel", "Oseas", "Joel", "Amós", "Abdías", "Jonás", "Miqueas",
      "Nahúm", "Habacuc", "Sofonías", "Hageo", "Zacarías", "Malaquías", // AT (39)
      "Mateo", "Marcos", "Lucas", "Juan", "Hechos", "Romanos", "1 Corintios", "2 Corintios",
      "Gálatas", "Efesios", "Filipenses", "Colosenses", "1 Tesalonicenses", "2 Tesalonicenses",
      "1 Timoteo", "2 Timoteo", "Tito", "Filemón", "Hebreos", "Santiago", "1 Pedro", "2 Pedro",
      "1 Juan", "2 Juan", "3 Juan", "Judas", "Apocalipsis" // NT (27)
  ];

  const testaments = Array.isArray(bibleObj.testament) ? bibleObj.testament : [bibleObj.testament];
  
  for (const testament of testaments) {
      const isAT = testament['@_name'] === 'Old';
      const books = Array.isArray(testament.book) ? testament.book : [testament.book];
      
      for (const book of books) {
        const bookNumber = parseInt(book['@_number'], 10);
        const bookName = bookNames[bookNumber] || `Libro ${bookNumber}`;
        console.log(`- Adding Book: ${bookName}`);
        
        const dbBook = await prisma.bibleBook.upsert({
            where: {
                translationId_name: {
                    translationId: translation.id,
                    name: bookName
                }
            },
            update: {},
            create: {
                translationId: translation.id,
                name: bookName,
                abbreviation: bookName.substring(0, 3),
                testament: isAT ? 'AT' : 'NT',
                order: bookNumber
            }
        });

        const chapters = Array.isArray(book.chapter) ? book.chapter : [book.chapter];
        for (const chapter of chapters) {
            const chapterNumber = parseInt(chapter['@_number'], 10);
            
            const dbChapter = await prisma.bibleChapter.upsert({
                where: {
                    bookId_number: {
                        bookId: dbBook.id,
                        number: chapterNumber
                    }
                },
                update: {},
                create: {
                    bookId: dbBook.id,
                    number: chapterNumber
                }
            });

            const verses = Array.isArray(chapter.verse) ? chapter.verse : [chapter.verse];
            const verseInput = verses.map((v: any) => ({
                 chapterId: dbChapter.id,
                 number: parseInt(v['@_number'], 10),
                 text: typeof v === 'object' ? (v['#text'] || '').trim() : String(v).trim()
            })).filter((v: any) => !isNaN(v.number) && v.text);

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
  }

  console.log('Seeding completed successfully!');
}

seedBible().catch(e => {
  console.error(e);
  process.exit(1);
});