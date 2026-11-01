import { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { useAdminApi } from '@/hooks/useAdminApi';
import SettingsSectionCard from '../settings/SettingsSectionCard';
import {
  dirtyPatchForSection,
  draftsFromSections,
  type SettingDraft,
  type SettingDrafts,
} from '../settings/shared';
import type { StationSettingsSection } from '@radio/types';

/**
 * These four decisions belong to the panel, not to the singleton row that still
 * governs the older fields: how many announcements a day, the window they are
 * spread over and how many times a blocked slot is retried. They already exist
 * in the settings catalog, so the card is the catalog's own renderer applied to
 * a filtered section instead of a second form with its own copy of the rules.
 */
const BUDGET_KEYS = new Set([
  'announcements.perDay',
  'announcements.activeFromHour',
  'announcements.activeToHour',
  'announcements.programRetries',
]);

const CARD_LABEL = 'Presupuesto y franja';
const CARD_DESCRIPTION =
  'Cuántos avisos suenan al día, entre qué horas se sortean y cuántas veces se reintenta uno bloqueado por un programa.';

/** The same catalog entries the settings page writes, without the rest of the section. */
function budgetSection(sections: StationSettingsSection[]): StationSettingsSection | null {
  const announcements = sections.find((section) => section.id === 'announcements');
  if (!announcements) return null;

  const items = announcements.items.filter((item) => BUDGET_KEYS.has(item.key));
  if (items.length === 0) return null;

  return {
    ...announcements,
    label: CARD_LABEL,
    description: CARD_DESCRIPTION,
    items,
  };
}

function failureMessage(err: unknown, fallback: string): string {
  if (axios.isAxiosError<{ error?: string }>(err)) {
    return err.response?.data?.error ?? fallback;
  }
  return fallback;
}

export default function AnnouncementBudget() {
  const { getSettings, updateSettings, resetSettings } = useAdminApi();

  const [section, setSection] = useState<StationSettingsSection | null>(null);
  const [drafts, setDrafts] = useState<SettingDrafts>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(() => {
    getSettings().then(
      (response) => {
        const next = budgetSection(response.sections);
        setSection(next);
        setDrafts(next ? draftsFromSections([next]) : {});
        setError(null);
      },
      (err) => setError(failureMessage(err, 'No se pudo cargar el presupuesto de avisos.'))
    );
  }, [getSettings]);

  useEffect(() => {
    load();
  }, [load]);

  const handleDraftChange = useCallback((key: string, draft: SettingDraft) => {
    setDrafts((current) => ({ ...current, [key]: draft }));
  }, []);

  const handleSave = useCallback(() => {
    if (!section) return;

    const patch = dirtyPatchForSection(section, drafts);
    if (Object.keys(patch).length === 0) return;

    setSaving(true);
    setError(null);
    setNotice(null);

    updateSettings(patch)
      .then((response) => {
        const next = budgetSection(response.sections);
        setSection(next);
        setDrafts(next ? draftsFromSections([next]) : {});
        setNotice('Guardaste el presupuesto. El planificador lo usa en el próximo replan.');
      })
      .catch((err) => setError(failureMessage(err, 'No se pudo guardar el presupuesto.')))
      .finally(() => setSaving(false));
  }, [section, drafts, updateSettings]);

  const handleReset = useCallback(() => {
    if (!section) return;

    setSaving(true);
    setError(null);
    setNotice(null);

    resetSettings(section.items.map((item) => item.key))
      .then((response) => {
        const next = budgetSection(response.sections);
        setSection(next);
        setDrafts(next ? draftsFromSections([next]) : {});
        setNotice('Presupuesto restablecido al valor del entorno o al de por defecto.');
      })
      .catch((err) => setError(failureMessage(err, 'No se pudo restablecer el presupuesto.')))
      .finally(() => setSaving(false));
  }, [section, resetSettings]);

  // A backend without these catalog keys simply has nothing to show here.
  if (!section) return null;

  return (
    <div className='space-y-3'>
      <p aria-live='polite' className='text-sm text-success'>
        {notice ?? ''}
      </p>
      <SettingsSectionCard
        section={section}
        drafts={drafts}
        saving={saving}
        canSave={Object.keys(dirtyPatchForSection(section, drafts)).length > 0}
        error={error}
        onDraftChange={handleDraftChange}
        onSave={handleSave}
        onReset={handleReset}
      />
    </div>
  );
}
