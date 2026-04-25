'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useKidsStore, SEVERITY_OPTIONS } from '@/store/kids';
import type { Severity } from '@/lib/recommendation';

const EMOJI_CHOICES = ['🌸', '🦖', '🦁', '🐢', '🦋', '🚀'];

export function KidProfilePicker() {
  const t = useTranslations('kids');
  const { kids, activeKidId, setActiveKid, addKid, removeKid } = useKidsStore();
  const [adding, setAdding] = useState(false);

  return (
    <section aria-labelledby="kids-title" className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 id="kids-title" className="text-sm font-semibold text-gray-700">
          {t('title')}
        </h2>
        {kids.length < 3 && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="text-xs font-medium text-gray-600 hover:text-gray-900"
          >
            + {t('add')}
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {kids.map((kid) => (
          <button
            key={kid.id}
            type="button"
            onClick={() => setActiveKid(kid.id)}
            aria-pressed={kid.id === activeKidId}
            className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition ${
              kid.id === activeKidId
                ? 'border-gray-900 bg-gray-900 text-white'
                : 'border-gray-300 bg-white text-gray-800 hover:border-gray-500'
            }`}
          >
            <span aria-hidden>{kid.emoji}</span>
            <span className="font-medium">{kid.name}</span>
            <span className="text-xs opacity-70">
              {kid.age} · {kid.severity}
            </span>
            {kids.length > 1 && (
              <span
                role="button"
                aria-label={`Remove ${kid.name}`}
                onClick={(event) => {
                  event.stopPropagation();
                  removeKid(kid.id);
                }}
                className="ml-1 rounded-full px-1 text-xs opacity-60 hover:opacity-100"
              >
                ×
              </span>
            )}
          </button>
        ))}
      </div>

      {adding && <AddKidForm onClose={() => setAdding(false)} onSave={addKid} />}
    </section>
  );
}

interface AddKidFormProps {
  onClose: () => void;
  onSave: (input: { name: string; emoji: string; age: number; severity: Severity }) => void;
}

function AddKidForm({ onClose, onSave }: AddKidFormProps) {
  const t = useTranslations('kids');
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState(EMOJI_CHOICES[0]);
  const [age, setAge] = useState(8);
  const [severity, setSeverity] = useState<Severity>('moderate');

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    onSave({ name: name.trim(), emoji, age, severity });
    onClose();
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded-lg border border-gray-200 bg-gray-50 p-3">
      <div className="grid grid-cols-2 gap-2">
        <label className="text-xs">
          <span className="block text-gray-600">{t('name')}</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
            required
            className="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-sm"
          />
        </label>
        <label className="text-xs">
          <span className="block text-gray-600">
            {t('age')}: {age}
          </span>
          <input
            type="range"
            min={3}
            max={17}
            value={age}
            onChange={(e) => setAge(Number(e.target.value))}
            className="mt-2 w-full"
          />
        </label>
      </div>
      <div className="flex flex-wrap gap-1">
        {EMOJI_CHOICES.map((choice) => (
          <button
            key={choice}
            type="button"
            onClick={() => setEmoji(choice)}
            aria-pressed={choice === emoji}
            className={`text-lg rounded px-2 py-1 ${
              choice === emoji ? 'bg-gray-900 text-white' : 'bg-white border border-gray-200'
            }`}
          >
            {choice}
          </button>
        ))}
      </div>
      <label className="block text-xs">
        <span className="block text-gray-600">{t('severity')}</span>
        <div className="mt-1 inline-flex rounded-full border border-gray-300 bg-white">
          {SEVERITY_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setSeverity(option.value)}
              aria-pressed={severity === option.value}
              className={`px-3 py-1 text-xs first:rounded-l-full last:rounded-r-full ${
                severity === option.value ? 'bg-gray-900 text-white' : 'text-gray-700'
              }`}
            >
              {t(`severity${option.value.charAt(0).toUpperCase() + option.value.slice(1)}` as 'severityMild')}
            </button>
          ))}
        </div>
      </label>
      <div className="flex justify-end gap-2 text-xs">
        <button type="button" onClick={onClose} className="px-3 py-1 text-gray-600">
          Cancel
        </button>
        <button type="submit" className="rounded bg-gray-900 px-3 py-1 font-medium text-white">
          Save
        </button>
      </div>
    </form>
  );
}
