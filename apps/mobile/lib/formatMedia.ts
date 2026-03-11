
const PREDICA_PATTERN = /^(\d+)_(.+?)_(.+?)_(\d{2}-\d{2}-\d{4})$/;

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

function parsePreachingFilename(filename: string): ParsedMedia | null {
  const clean = filename.replace(/\.(mp3|wav|ogg|aac)$/i, '');
  const match = clean.match(PREDICA_PATTERN);
  if (!match) return null;

  const [, number, topic, preacher, ] = match;
  return {
    title: `${toTitleCase(topic.replaceAll('-', ' '))} #${number}`,
    artist: toTitleCase(preacher.replaceAll('-', ' ')),
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