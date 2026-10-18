import type { StationSettingValue, StationSettingsSection } from '@radio/types';

/**
 * What a field holds while the operator is editing it.
 *
 * A boolean stays a boolean all the way into the patch: the backend rejects a
 * numeric `1` at the type gate, before the parser that would have accepted the
 * text ever runs. The other three types are edited as text and converted on the
 * way out, because that is the only shape an `Input` can hold.
 */
export type SettingDraft = string | boolean;

/** Every editable value of the page, by setting key. */
export type SettingDrafts = Record<string, SettingDraft>;

/** What the page hands to `PUT /admin-api/settings`. */
export type SettingsPatch = Record<string, string | number | boolean | string[]>;

/** Seeds the editable state from the response, so the form follows the catalog. */
export function draftsFromSections(sections: StationSettingsSection[]): SettingDrafts {
  return Object.fromEntries(
    sections.flatMap((section) => section.items.map((item) => [item.key, draftFromValue(item)]))
  );
}

/**
 * The drafts after a write that only covered one section.
 *
 * Re-seeding every draft from the response would throw away what the operator
 * has typed in the sections beside it: their keys were not in the patch, so the
 * server answers with the value it already had and it lands on top of a pending
 * edit. Nothing announces that, and the field simply snaps back — which is
 * invisible while there is only one section and is the whole reason sections
 * carry their own save.
 */
export function draftsAfterSectionWrite(
  current: SettingDrafts,
  sections: StationSettingsSection[],
  sectionId: string
): SettingDrafts {
  return {
    ...current,
    ...draftsFromSections(sections.filter((section) => section.id === sectionId)),
  };
}

/** The single value an item shows inside its field. */
export function draftFromValue(item: StationSettingValue): SettingDraft {
  if (typeof item.value === 'boolean') return item.value;
  if (Array.isArray(item.value)) return item.value.join(', ');
  return item.value === null ? '' : String(item.value);
}

/**
 * The typed value the backend expects for one draft. Each branch is the inverse
 * of what `draftFromValue` produced, so a field left untouched round-trips to
 * the value the catalog already had.
 */
export function patchValueFromDraft(
  item: StationSettingValue,
  draft: SettingDraft
): string | number | boolean | string[] {
  const text = typeof draft === 'boolean' ? String(draft) : draft;

  switch (item.type) {
    case 'number':
      return Number(text);
    case 'boolean':
      return typeof draft === 'boolean' ? draft : text === 'true';
    case 'emailList':
      return text
        .split(',')
        .map((part) => part.trim())
        .filter((part) => part.length > 0);
    case 'text':
      return text;
  }
}

/**
 * Only the fields the operator actually touched. Sending the whole section
 * would let a value the environment supplies out of range reject a save about a
 * different field, and would make `applied` report keys nobody edited.
 */
export function dirtyPatchForSection(
  section: StationSettingsSection,
  drafts: SettingDrafts
): SettingsPatch {
  const patch: SettingsPatch = {};

  for (const item of section.items) {
    const draft = drafts[item.key];
    if (draft === undefined || draft === draftFromValue(item)) continue;
    patch[item.key] = patchValueFromDraft(item, draft);
  }

  return patch;
}