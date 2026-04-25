'use client';

import { forwardRef, useEffect, useRef, useState } from 'react';
import {
  MAPBOX_TOKEN,
  NYC_BBOX,
  BRONX_PROXIMITY,
} from '@/lib/mapbox';

export interface AddressPick {
  name: string;     // human-readable, e.g. "1290 Spofford Ave, Bronx, New York"
  lon: number;
  lat: number;
}

interface Feature {
  id: string;
  place_name: string;
  text: string;
  center: [number, number];
}

interface Props {
  value: string;
  onChange: (next: string) => void;
  onPick: (pick: AddressPick) => void;
  placeholder?: string;
  className?: string;
  /** Set when the parent has already locked a coordinate (e.g. via preset).
   *  Suppresses the suggestion dropdown until the user types again. */
  locked?: boolean;
}

const DEBOUNCE_MS = 220;
const MIN_QUERY = 3;

export const AddressAutocomplete = forwardRef<HTMLInputElement, Props>(function AddressAutocomplete(
  { value, onChange, onPick, placeholder, className, locked = false },
  ref,
) {
  const [features, setFeatures] = useState<Feature[]>([]);
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const [loading, setLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Debounced fetch.
  useEffect(() => {
    if (locked) return;
    const q = value.trim();
    if (q.length < MIN_QUERY) {
      setFeatures([]);
      setOpen(false);
      return;
    }
    if (!MAPBOX_TOKEN) return;
    const handle = setTimeout(async () => {
      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;
      setLoading(true);
      try {
        const url =
          `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(q)}.json` +
          `?bbox=${NYC_BBOX.join(',')}&proximity=${BRONX_PROXIMITY.join(',')}&limit=5&autocomplete=true` +
          `&types=address,poi,place,postcode,neighborhood&access_token=${MAPBOX_TOKEN}`;
        const res = await fetch(url, { signal: ac.signal });
        if (!res.ok) throw new Error(`geocoder ${res.status}`);
        const json = (await res.json()) as { features: Feature[] };
        setFeatures(json.features ?? []);
        setOpen((json.features ?? []).length > 0);
        setActiveIdx(0);
      } catch (err) {
        if ((err as { name?: string }).name === 'AbortError') return;
        // Silent: a flaky geocoder shouldn't break the form. The free-text
        // submit path still works.
      } finally {
        setLoading(false);
      }
    }, DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [value, locked]);

  // Click-outside closes the dropdown.
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  function pick(f: Feature) {
    onChange(f.place_name);
    onPick({ name: f.place_name, lon: f.center[0], lat: f.center[1] });
    setOpen(false);
  }

  function handleKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || features.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx((i) => (i + 1) % features.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx((i) => (i - 1 + features.length) % features.length);
    } else if (e.key === 'Enter') {
      // Enter inside the input picks the active suggestion. The form will not
      // submit because we preventDefault here.
      e.preventDefault();
      pick(features[activeIdx]);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  }

  return (
    <div ref={wrapRef} className="relative">
      <input
        ref={ref}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => { if (features.length > 0) setOpen(true); }}
        onKeyDown={handleKey}
        placeholder={placeholder}
        autoComplete="off"
        className={className}
        aria-autocomplete="list"
        aria-expanded={open}
      />
      {loading && (
        <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-xs text-slate-400">
          …
        </span>
      )}
      {open && features.length > 0 && (
        <ul
          role="listbox"
          className="absolute z-20 mt-2 max-h-64 w-full overflow-auto rounded-xl border border-slate-200 bg-white shadow-xl"
        >
          {features.map((f, i) => (
            <li
              key={f.id}
              role="option"
              aria-selected={i === activeIdx}
              onMouseDown={(e) => { e.preventDefault(); pick(f); }}
              onMouseEnter={() => setActiveIdx(i)}
              className={`cursor-pointer px-4 py-2 text-left text-sm ${
                i === activeIdx ? 'bg-emerald-50 text-emerald-900' : 'text-slate-700'
              }`}
            >
              <div className="font-medium">{f.text}</div>
              <div className="text-xs text-slate-500">{f.place_name}</div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
});
