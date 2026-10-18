import { describe, expect, it } from 'vitest';
import type {
  SettingFieldType,
  StationSettingValue,
  StationSettingsSection,
} from '@radio/types';
import {
  draftFromValue,
  draftsAfterSectionWrite,
  draftsFromSections,
  dirtyPatchForSection,
  patchValueFromDraft,
} from '../../src/pages/admin/settings/shared';

/**
 * The settings form is the one place in the web app where a value typed by hand
 * becomes a typed value the backend accepts, and both directions are load
 * bearing: a boolean that goes out as `1` is a live 400, and a draft that is
 * re-seeded from a save it was not part of silently deletes what the operator
 * was typing.
 *
 * A runtime test, in the shape `artwork-switch.test.ts` already uses: import the
 * module through a relative path and call it. The `settings/` wiring tests next
 * door read source text, which proves the wiring is present but never executes a
 * line of the panel.
 */
const BASE = {
  label: 'Ajuste',
  description: 'Descripción del ajuste.',
  source: 'default',
  unit: null,
  min: null,
  max: null,
  requiresRestart: false,
  updatedAt: null,
  updatedBy: null,
} satisfies Omit<StationSettingValue, 'key' | 'type' | 'value'>;

function item(
  key: string,
  type: SettingFieldType,
  value: StationSettingValue['value'],
  extra: Partial<StationSettingValue> = {}
): StationSettingValue {
  return { ...BASE, key, type, value, ...extra };
}

function section(id: string, items: StationSettingValue[]): StationSettingsSection {
  return { id, label: id, description: '', items };
}

describe('the value a draft puts on the wire', () => {
  it('sends a boolean as a boolean, never as 1', () => {
    // `settings.validation.ts` rejects a numeric 1 at the type gate, before the
    // catalog parser that would have accepted "1" ever runs. If this branch ever
    // went through `Number`, the assertion below would see 1 instead of true.
    const emailEnabled = item('health.emailEnabled', 'boolean', false);

    expect(patchValueFromDraft(emailEnabled, true)).toBe(true);
    expect(patchValueFromDraft(emailEnabled, false)).toBe(false);
  });

  it('reads a boolean back into the checkbox as a boolean', () => {
    const pushEnabled = item('health.pushEnabled', 'boolean', true);

    expect(draftFromValue(pushEnabled)).toBe(true);
  });

  it('turns a cleared number field into 0 rather than NaN', () => {
    // An empty numeric input reports "". `Number("")` is 0, which the backend
    // then rejects against the declared range; a NaN would serialize to null and
    // fail with a type message that says nothing about the field.
    const diskFree = item('health.diskMinFreePercent', 'number', 15, { min: 1, max: 99 });

    const cleared = patchValueFromDraft(diskFree, '');

    expect(cleared).toBe(0);
    expect(Number.isNaN(cleared)).toBe(false);
  });

  it('splits and trims an emailList draft into addresses', () => {
    const tokens = item('health.pushTokens', 'emailList', []);

    expect(patchValueFromDraft(tokens, 'uno@radio.co, dos@radio.co ,,')).toEqual([
      'uno@radio.co',
      'dos@radio.co',
    ]);
  });

  it('sends only the keys the operator touched', () => {
    const health = section('health', [
      item('health.diskMinFreePercent', 'number', 15),
      item('health.backupMaxAgeHours', 'number', 26),
    ]);

    expect(
      dirtyPatchForSection(health, { 'health.diskMinFreePercent': '20', 'health.backupMaxAgeHours': '26' })
    ).toEqual({ 'health.diskMinFreePercent': 20 });
  });
});

describe('a write in one section does not discard another section\'s pending edits', () => {
  const pending: Record<string, string> = {
    'health.diskMinFreePercent': '020',
    'voice.rate': '1.1',
  };
  const stored: StationSettingsSection[] = [
    section('health', [item('health.diskMinFreePercent', 'number', 20)]),
    section('voice', [item('voice.rate', 'number', 1)]),
  ];

  it('re-seeds the section the save covered', () => {
    // The server answered with 20, so the field shows 20 and stops looking dirty.
    expect(draftsAfterSectionWrite(pending, stored, 'health')['health.diskMinFreePercent']).toBe('20');
  });

  it('leaves the drafts of the sections the save did not cover alone', () => {
    // The save only carried health.diskMinFreePercent. Re-seeding the whole page
    // would take "1.1" back from the operator and replace it with the stored 1,
    // with no message and no way to know the edit is gone.
    expect(draftsAfterSectionWrite(pending, stored, 'health')['voice.rate']).toBe('1.1');
  });

  it('still seeds every section from scratch when the whole page loads', () => {
    expect(draftsFromSections(stored)).toEqual({
      'health.diskMinFreePercent': '20',
      'voice.rate': '1',
    });
  });
});