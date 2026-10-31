import { describe, expect, it } from "vitest";
import type { ParsedBible } from "../../src/modules/bible/bibleTranslations";
import { countVerses, isAlreadySeeded } from "../../src/modules/bible/seedPlan";

const BIBLE: ParsedBible = {
  books: [
    {
      number: 1,
      name: "Génesis",
      testament: "AT",
      chapters: [
        {
          number: 1,
          verses: [
            { number: 1, text: "En el principio creó Dios el cielo y la tierra." },
            { number: 2, text: "Y la tierra estaba desordenada y vacía." },
          ],
        },
        { number: 2, verses: [] },
      ],
    },
  ],
};

describe("countVerses", () => {
  it("counts the verses the file declares", () => {
    expect(countVerses(BIBLE)).toBe(2);
  });

  it("counts nothing in an empty Bible", () => {
    expect(countVerses({ books: [] })).toBe(0);
  });
});

describe("isAlreadySeeded", () => {
  it("is true only when the database holds the verses the file declares", () => {
    expect(isAlreadySeeded(31102, 31102)).toBe(true);
    expect(isAlreadySeeded(31102, 31101)).toBe(false);
    expect(isAlreadySeeded(31102, 0)).toBe(false);
  });
});
