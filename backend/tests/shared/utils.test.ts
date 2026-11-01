import { describe, expect, it } from "vitest";
import { escapeHtml } from "../../src/shared/utils/escape-html";
import { paginate } from "../../src/shared/utils/pagination";
import { slugify, titleFromFilename } from "../../src/shared/utils/text";

describe("paginate", () => {
  it("starts at the first page", () => {
    const result = paginate({});

    expect(result.page).toBe(1);
    expect(result.skip).toBe(0);
    expect(result.limit).toBeGreaterThan(0);
  });

  it("turns page and limit into an offset", () => {
    expect(paginate({ page: "3", limit: "10" })).toEqual({
      page: 3,
      limit: 10,
      skip: 20,
    });
  });

  it("clamps a page that is not a positive number to the first one", () => {
    expect(paginate({ page: "0" }).page).toBe(1);
    expect(paginate({ page: "-7" }).page).toBe(1);
    expect(paginate({ page: "nope" }).page).toBe(1);
  });

  it("falls back to the default size for a limit that cannot be used", () => {
    const defaultLimit = paginate({}).limit;

    expect(paginate({ limit: "nope" }).limit).toBe(defaultLimit);
    expect(paginate({ limit: "0" }).limit).toBe(defaultLimit);
    expect(paginate({ limit: "-3" }).limit).toBe(1);
  });

  it("clamps the size to the maximum the endpoint accepts", () => {
    const maximum = paginate({ limit: "1000000" }).limit;

    expect(paginate({ limit: "1000001" }).limit).toBe(maximum);
    expect(paginate({ limit: String(maximum) }).limit).toBe(maximum);
  });
});

describe("escapeHtml", () => {
  it("escapes the markup a listener could type into a public form", () => {
    expect(escapeHtml("<script>alert(1)</script>")).toBe(
      "&lt;script&gt;alert(1)&lt;/script&gt;",
    );
  });

  it("escapes the ampersand before the entities it introduces", () => {
    expect(escapeHtml("A & B")).toBe("A &amp; B");
  });

  it("escapes both quote styles", () => {
    expect(escapeHtml('"doble" y \'simple\'')).toBe(
      "&quot;doble&quot; y &#039;simple&#039;",
    );
  });
});

describe("titleFromFilename", () => {
  it("builds the title the library shows for an episode", () => {
    expect(titleFromFilename("1-reyes_capitulo-4.mp3", "Sin título")).toBe(
      "1 Reyes Capitulo 4",
    );
  });

  it("drops diacritics and punctuation instead of losing the words", () => {
    expect(titleFromFilename("predicación (domingo).mp3", "Sin título")).toBe(
      "Predicacion Domingo",
    );
  });

  it("falls back when the name carries nothing usable", () => {
    expect(titleFromFilename("¡!.mp3", "Sin título")).toBe("Sin título");
  });

  it("keeps a name that has no extension", () => {
    expect(titleFromFilename("programa", "Sin título")).toBe("Programa");
  });
});

describe("slugify", () => {
  it("builds a lowercase folder name without diacritics", () => {
    expect(slugify("Programa Añejo 2026")).toBe("programa-anejo-2026");
  });

  it("collapses punctuation and trims the dashes at the edges", () => {
    expect(slugify("  ¡Hola, Mundo!  ")).toBe("hola-mundo");
  });

  it("returns an empty slug when there is nothing to keep", () => {
    expect(slugify("---")).toBe("");
  });
});
