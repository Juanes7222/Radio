export type Severity = "error" | "warning";

export type RuleId =
  | "design/raw-color"
  | "design/emoji"
  | "design/img-alt"
  | "design/slate-utilities"
  | "design/transition-all";

export interface Rule {
  readonly id: RuleId;
  readonly severity: Severity;
  readonly title: string;
  readonly fix: string;
  readonly appliesTo: (path: string) => boolean;
  readonly matches: (line: string) => boolean;
}

export interface AddedLine {
  readonly line: number;
  readonly text: string;
}

export interface Finding {
  readonly rule: RuleId;
  readonly severity: Severity;
  readonly file: string;
  readonly line: number;
  readonly excerpt: string;
  readonly message: string;
  readonly fix: string;
}

const DESIGN_SOURCE = /\.(tsx|ts|css)$/;
const TOKEN_FILES: readonly RegExp[] = [
  /(^|\/)index\.css$/,
  /(^|\/)tailwind\.config\.(js|ts|mjs|cjs)$/,
  /(^|\/)constants\/theme\.ts$/,
  /(^|\/)theme\.ts$/,
  /\.(json|svg|md|mdx)$/,
];

export function isTokenFile(path: string): boolean {
  return TOKEN_FILES.some((pattern) => pattern.test(path));
}

function isWebUi(path: string): boolean {
  return path.startsWith("apps/web/src/") && DESIGN_SOURCE.test(path);
}

function isMobileUi(path: string): boolean {
  return path.startsWith("apps/mobile/") && DESIGN_SOURCE.test(path) && !path.includes("/tests/");
}

function isAdminUi(path: string): boolean {
  return /^apps\/web\/src\/(pages|components)\/admin\//.test(path);
}

function isComment(line: string): boolean {
  const trimmed = line.trim();
  return (
    trimmed.startsWith("//") ||
    trimmed.startsWith("/*") ||
    trimmed.startsWith("*") ||
    trimmed.startsWith("{/*")
  );
}

const RAW_COLOR =
  /#[0-9a-fA-F]{3,8}\b|\b(?:rgb|rgba|hsl|hsla)\(\s*\d/;
const EMOJI = /\p{Extended_Pictographic}/u;
const SLATE_UTILITY =
  /\b(?:bg|text|border|ring|from|via|to|divide|placeholder|fill|stroke|shadow)-slate-\d{2,3}\b/;

export const LINE_RULES: readonly Rule[] = [
  {
    id: "design/raw-color",
    severity: "error",
    title: "Color literal fuera de los tokens",
    fix: "Usa un token semántico: bg-primary, text-faint, border-border o hsl(var(--tally)/0.3). Los literales viven solo en index.css, tailwind.config.js y constants/theme.ts.",
    appliesTo: (path) => (isWebUi(path) || isMobileUi(path)) && !isTokenFile(path),
    matches: (line) => !isComment(line) && RAW_COLOR.test(line),
  },
  {
    id: "design/emoji",
    severity: "error",
    title: "Emoji en código de interfaz",
    fix: "El proyecto no usa emojis. Reemplázalo por texto, un icono de lucide-react o un glifo del sistema.",
    appliesTo: (path) => isWebUi(path) || isMobileUi(path),
    matches: (line) => !isComment(line) && EMOJI.test(line),
  },
  {
    id: "design/slate-utilities",
    severity: "warning",
    title: "Utilidad slate literal en el panel",
    fix: "El panel migra de a poco a tokens (sunken, faint, success, warning, info, tally). Usa el token equivalente en vez de sumar una página nueva con slate.",
    appliesTo: (path) => isAdminUi(path),
    matches: (line) => !isComment(line) && SLATE_UTILITY.test(line),
  },
  {
    id: "design/transition-all",
    severity: "warning",
    title: "transition-all anima propiedades que no cambian",
    fix: "Declara las propiedades: transition-colors, transition-opacity, transition-[transform,background-color]. transition-all también anima layout y cuesta más de lo que aparenta.",
    appliesTo: (path) => (isWebUi(path) || isMobileUi(path)) && !isTokenFile(path),
    matches: (line) => !isComment(line) && /\btransition-all\b/.test(line),
  },
];

export const RULE_TITLES: Readonly<Record<RuleId, string>> = Object.fromEntries(
  LINE_RULES.map((rule) => [rule.id, rule.title]),
) as Record<RuleId, string>;

function excerptOf(text: string): string {
  return text.trim().replace(/\s+/g, " ").slice(0, 140);
}

export function evaluateAddedLines(path: string, lines: readonly AddedLine[]): Finding[] {
  const findings: Finding[] = [];
  for (const line of lines) {
    for (const rule of LINE_RULES) {
      if (!rule.appliesTo(path) || !rule.matches(line.text)) continue;
      findings.push({
        rule: rule.id,
        severity: rule.severity,
        file: path,
        line: line.line,
        excerpt: excerptOf(line.text),
        message: rule.title,
        fix: rule.fix,
      });
    }
  }
  return findings;
}

const IMG_TAG = /<img\b[\s\S]{0,1200}?>/g;
const ALT_ATTRIBUTE = /\balt\s*=/;

function lineNumberAt(content: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index; i += 1) {
    if (content.charCodeAt(i) === 10) line += 1;
  }
  return line;
}

export function canContainImages(path: string): boolean {
  return (isWebUi(path) || isMobileUi(path)) && path.endsWith(".tsx");
}

/**
 * Flags an `<img>` without `alt` only when the tag sits on a line the change
 * added. Existing markup is left alone so the rule can be adopted without a
 * cleanup pass.
 */
export function evaluateImages(
  path: string,
  content: string,
  addedLines: ReadonlySet<number>,
): Finding[] {
  if (!canContainImages(path)) return [];
  const findings: Finding[] = [];
  IMG_TAG.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = IMG_TAG.exec(content)) !== null) {
    const tag = match[0];
    if (ALT_ATTRIBUTE.test(tag)) continue;
    const line = lineNumberAt(content, match.index);
    if (!addedLines.has(line)) continue;
    findings.push({
      rule: "design/img-alt",
      severity: "error",
      file: path,
      line,
      excerpt: excerptOf(tag),
      message: "Imagen sin alt",
      fix: "Añade alt con la descripción de la imagen, o alt=\"\" si es decorativa y el texto de al lado ya dice lo mismo.",
    });
  }
  return findings;
}
