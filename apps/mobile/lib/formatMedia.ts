
// Matches both "256_tema_predicador_01-02-2026" and "256 tema predicador 01-02-2026"
const PREDICA_START = /^(\d+)[_ ]+/;
const PREDICA_END = /[_ ](\d{2}-\d{2}-\d{4})$/;
const PREACHER_TITLE_KEYWORD = /\b(rev\.?|pastor\.?|hno\.?|hermano\.?|hermana\.?|dr\.?|lic\.?)\b/i;

interface ParsedMedia {
  title: string;
  artist: string;
  isPreaching: boolean;
}

function toTitleCase(str: string): string {
  return str
    .toLowerCase()
    .replace(/(?:^|\s)\S/g, (char) => char.toUpperCase());
}

function normalizeSegment(segment: string): string {
  return segment.replace(/[-_]/g, ' ').trim();
}

function extractBasename(filePath: string): string {
  return filePath
    .replace(/\.(mp3|wav|ogg|aac|m4a|flac|opus|wma)$/i, '')
    .split(/[/\\]/)
    .pop() ?? '';
}

function parsePreachingFilename(filename: string): ParsedMedia | null {
  const name = extractBasename(filename);

  const startMatch = name.match(PREDICA_START);
  if (!startMatch) return null;

  const endMatch = name.match(PREDICA_END);
  if (!endMatch) return null;

  const number = startMatch[1];
  const middle = name.slice(startMatch[0].length, name.length - endMatch[0].length);

  let topic: string;
  let preacher: string;

  const lastUnderscoreIdx = middle.lastIndexOf('_');
  if (lastUnderscoreIdx > 0) {
    // Original format: underscores are still present as segment separators
    topic = middle.slice(0, lastUnderscoreIdx);
    preacher = middle.slice(lastUnderscoreIdx + 1);
  } else {
    // AzuraCast pre-formats the title replacing underscores with spaces.
    // Split at first occurrence of a clerical title keyword (rev, pastor, etc.)
    const keywordMatch = middle.match(PREACHER_TITLE_KEYWORD);
    if (keywordMatch && keywordMatch.index !== undefined && keywordMatch.index > 0) {
      topic = middle.slice(0, keywordMatch.index);
      preacher = middle.slice(keywordMatch.index);
    } else {
      topic = middle;
      preacher = '';
    }
  }

  return {
    title: `${toTitleCase(normalizeSegment(topic))} #${number}`,
    artist: toTitleCase(normalizeSegment(preacher)),
    isPreaching: true,
  };
}

export function formatMediaTitle(title: string, artist?: string): ParsedMedia {
  if (!title || title === 'Unknown') {
    return { title: 'Sin información', artist: '', isPreaching: false };
  }

  const predica = parsePreachingFilename(title);
  if (predica) return predica;

  return {
    title: toTitleCase(title),
    artist: artist ? toTitleCase(artist) : '',
    isPreaching: false,
  };
}