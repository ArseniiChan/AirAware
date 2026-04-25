'use client';

import { forwardRef, useEffect, useRef, useState } from 'react';
import { useLocale } from 'next-intl';
import {
  MAPBOX_TOKEN,
  NYC_BBOX,
  BRONX_PROXIMITY,
} from '@/lib/mapbox';
import { locateMe, GeolocateError } from '@/lib/geolocate';
import { isVoiceInputAvailable, listen, type ListenHandle } from '@/lib/voiceInput';

// Mapbox Search Box API session token. The same UUID across suggest+retrieve
// calls gets billed as one session (free tier: 1000 sessions / month). We
// generate one per page load and rotate it whenever the dropdown closes for
// long enough that the user is "starting a new search."
function newSessionToken(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  // RFC4122 v4 fallback for older browsers.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export interface AddressPick {
  name: string;     // human-readable, e.g. "1290 Spofford Ave, Bronx, New York"
  lon: number;
  lat: number;
  zcta?: string;    // 5-digit NYC ZIP from feature.context (BlockContextCard uses this)
}

// Unified suggestion shape across Search Box (POI-rich) and v5 Geocoding
// (POI-thin but always returns SOMETHING). Search Box suggestions have a
// `mapbox_id` we retrieve later for coordinates; v5 suggestions arrive with
// coordinates inline.
interface Suggestion {
  id: string;
  text: string;        // short label (business / street name)
  place_name: string;  // full readable address line
  source: 'searchbox' | 'v5';
  // Only one of these will be set. Search Box → mapbox_id, retrieved later.
  // v5 → centerLon/centerLat, zcta inline.
  mapbox_id?: string;
  centerLon?: number;
  centerLat?: number;
  zcta?: string;
  feature_type?: string;
}

interface V5Feature {
  id: string;
  place_name: string;
  text: string;
  center: [number, number];
  context?: { id: string; text: string }[];
  properties?: { postcode?: string };
}

function zctaFromV5(f: V5Feature): string | undefined {
  const ctxZip = f.context?.find((c) => c.id?.startsWith('postcode'))?.text;
  return ctxZip ?? f.properties?.postcode;
}

interface SearchBoxSuggestion {
  name: string;
  mapbox_id: string;
  feature_type?: string;
  place_formatted?: string;
  full_address?: string;
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
  /** Values that should suppress the dropdown (e.g. preset chip values). When
   *  the input value exactly equals any of these, no suggestions fetch — the
   *  user obviously meant the preset, not a search. Demo-critical: without
   *  this, the dropdown intercepts the submit button click. */
  presetValues?: readonly string[];
  /** When true, surfaces a "Use current location" row at the top of the
   *  dropdown when the input is empty / short. On click, runs locateMe()
   *  (browser geolocation + reverse-geocode) and fires onPick. */
  showCurrentLocation?: boolean;
}

const DEBOUNCE_MS = 220;
const MIN_QUERY = 3;

export const AddressAutocomplete = forwardRef<HTMLInputElement, Props>(function AddressAutocomplete(
  { value, onChange, onPick, placeholder, className, locked = false, presetValues, showCurrentLocation = false },
  ref,
) {
  const locale = useLocale();
  const [features, setFeatures] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const [loading, setLoading] = useState(false);
  const [locating, setLocating] = useState(false);
  const [locateError, setLocateError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  // Voice-input session for the inline mic button. Null when idle.
  const [listening, setListening] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const listenHandleRef = useRef<ListenHandle | null>(null);
  const voiceAvailable = isVoiceInputAvailable();

  function startVoice() {
    setVoiceError(null);
    setListening(true);
    listenHandleRef.current = listen({
      locale,
      onResult: (transcript) => {
        // Drop the transcript straight into the input. The existing debounced
        // suggestion fetch picks it up — same path as a typed query.
        onChange(transcript);
      },
      onError: (code) => {
        if (code === 'not-allowed') setVoiceError('Mic access denied.');
        else if (code === 'no-speech') setVoiceError('Didn\'t catch that.');
        else if (code === 'not-supported') setVoiceError('Voice not supported in this browser.');
        else setVoiceError('Voice input failed.');
      },
      onEnd: () => {
        setListening(false);
        listenHandleRef.current = null;
      },
    });
    if (!listenHandleRef.current) setListening(false);
  }
  function stopVoice() {
    listenHandleRef.current?.stop();
    listenHandleRef.current = null;
    setListening(false);
  }
  // Stop any in-flight recognition on unmount.
  useEffect(() => () => { listenHandleRef.current?.stop(); }, []);
  // One Search Box session per dropdown lifecycle. Suggest+Retrieve pair share
  // it so we burn one session, not many. Rotated when the dropdown closes
  // for >30s — that's effectively a new search.
  const sessionRef = useRef<string>(newSessionToken());

  // Show the "Use current location" pseudo-row while the user hasn't typed
  // anything substantial yet. Once they start typing real characters, the
  // search results take over.
  const showLocateRow = showCurrentLocation && value.trim().length < MIN_QUERY && !locked;

  async function pickCurrentLocation() {
    setLocating(true);
    setLocateError(null);
    try {
      const me = await locateMe();
      onChange(me.name);
      onPick(me);
      setOpen(false);
    } catch (err) {
      if (err instanceof GeolocateError) {
        if (err.code === 'denied') setLocateError('Location permission denied. Type your address.');
        else if (err.code === 'outside_nyc') setLocateError('You appear to be outside NYC.');
        else setLocateError('Could not get your location.');
      } else {
        setLocateError('Could not get your location.');
      }
    } finally {
      setLocating(false);
    }
  }

  // Debounced fetch.
  useEffect(() => {
    if (locked) {
      // Hide and forget any prior suggestions so a focus event can't reopen
      // a stale list. Without this, the results-screen autocompletes flashed
      // dropdowns over the map on first paint.
      setFeatures([]);
      setOpen(false);
      return;
    }
    const q = value.trim();
    if (q.length < MIN_QUERY) {
      setFeatures([]);
      setOpen(false);
      return;
    }
    // Preset chip was clicked — don't second-guess the user with suggestions.
    if (presetValues && presetValues.includes(value)) {
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
        // Two queries in parallel:
        //   1. Search Box Suggest — POI-rich (Joe's Pizza, Whole Foods,
        //      bodegas, parks). Returns name + mapbox_id; we Retrieve coords
        //      only if the user picks one. Free tier: 1000 sessions/mo;
        //      same session_token shared with the Retrieve call = 1 session.
        //   2. Geocoding v5 — addresses, streets, neighborhoods. Returns
        //      coords inline so picking is one request.
        // Merge: Search Box first (POIs are what the user usually wants),
        // then v5 for any address-y things Search Box didn't surface.
        const session = sessionRef.current;
        const searchBoxUrl =
          `https://api.mapbox.com/search/searchbox/v1/suggest` +
          `?q=${encodeURIComponent(q)}` +
          `&session_token=${session}` +
          `&proximity=${BRONX_PROXIMITY.join(',')}` +
          `&bbox=${NYC_BBOX.join(',')}` +
          `&limit=6&language=en` +
          `&access_token=${MAPBOX_TOKEN}`;
        const v5Url =
          `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(q)}.json` +
          `?bbox=${NYC_BBOX.join(',')}&proximity=${BRONX_PROXIMITY.join(',')}` +
          `&limit=4&autocomplete=true&fuzzyMatch=true` +
          `&types=address,place,locality,neighborhood,postcode` +
          `&access_token=${MAPBOX_TOKEN}`;

        const [sbRes, v5Res] = await Promise.allSettled([
          fetch(searchBoxUrl, { signal: ac.signal }).then((r) => (r.ok ? r.json() : null)),
          fetch(v5Url, { signal: ac.signal }).then((r) => (r.ok ? r.json() : null)),
        ]);

        const merged: Suggestion[] = [];

        if (sbRes.status === 'fulfilled' && sbRes.value) {
          const json = sbRes.value as { suggestions?: SearchBoxSuggestion[] };
          for (const s of json.suggestions ?? []) {
            merged.push({
              id: `sb:${s.mapbox_id}`,
              text: s.name,
              place_name: s.full_address ?? `${s.name}${s.place_formatted ? `, ${s.place_formatted}` : ''}`,
              source: 'searchbox',
              mapbox_id: s.mapbox_id,
              feature_type: s.feature_type,
            });
          }
        }

        if (v5Res.status === 'fulfilled' && v5Res.value) {
          const json = v5Res.value as { features?: V5Feature[] };
          for (const f of json.features ?? []) {
            // Skip if we already have something from Search Box with the same
            // visible label — avoids duplicate "Park Avenue" entries.
            if (merged.some((m) => m.text === f.text)) continue;
            merged.push({
              id: `v5:${f.id}`,
              text: f.text,
              place_name: f.place_name,
              source: 'v5',
              centerLon: f.center[0],
              centerLat: f.center[1],
              zcta: zctaFromV5(f),
            });
          }
        }

        setFeatures(merged);
        setOpen(merged.length > 0);
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

  async function pick(s: Suggestion) {
    setOpen(false);
    onChange(s.place_name);
    if (s.source === 'v5' && s.centerLon != null && s.centerLat != null) {
      onPick({ name: s.place_name, lon: s.centerLon, lat: s.centerLat, zcta: s.zcta });
      // Rotate the Search Box session for the next "search" — picking a v5
      // result still ends the current dropdown lifecycle.
      sessionRef.current = newSessionToken();
      return;
    }
    if (s.source === 'searchbox' && s.mapbox_id) {
      // Retrieve the actual coordinates. This is the second half of the
      // Search Box session — sharing the session_token = 1 billable session.
      try {
        const url =
          `https://api.mapbox.com/search/searchbox/v1/retrieve/${encodeURIComponent(s.mapbox_id)}` +
          `?session_token=${sessionRef.current}` +
          `&access_token=${MAPBOX_TOKEN}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`retrieve ${res.status}`);
        const json = (await res.json()) as {
          features?: Array<{
            geometry: { coordinates: [number, number] };
            properties: {
              full_address?: string;
              name?: string;
              context?: Record<string, { name?: string }>;
            };
          }>;
        };
        const f = json.features?.[0];
        if (!f) throw new Error('no feature');
        const lon = f.geometry.coordinates[0];
        const lat = f.geometry.coordinates[1];
        const zcta = f.properties.context?.postcode?.name;
        const name = f.properties.full_address ?? s.place_name;
        onChange(name);
        onPick({ name, lon, lat, zcta });
      } catch {
        // Retrieve failed — fall back to passing the place_name through and
        // letting /api/route geocode it server-side. Better than blocking.
        // No coordinate set → the page's onChange-without-onPick path
        // forwards the string to /api/route which geocodes via v5.
      } finally {
        sessionRef.current = newSessionToken();
      }
    }
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
        onFocus={() => {
          // Open the dropdown on focus if we have suggestions OR if we can
          // surface the "Use current location" row. `locked` (parent already
          // has a coordinate for this exact value) suppresses both — we don't
          // want the dropdown flashing over the map on results-screen render.
          if (locked) return;
          if (features.length > 0 || showLocateRow) setOpen(true);
        }}
        onKeyDown={handleKey}
        placeholder={placeholder}
        autoComplete="off"
        className={className}
        aria-autocomplete="list"
        aria-expanded={open}
      />
      {loading && (
        <span className={`pointer-events-none absolute ${voiceAvailable ? 'right-12' : 'right-4'} top-1/2 -translate-y-1/2 text-xs text-slate-400`}>
          …
        </span>
      )}
      {voiceAvailable && (
        <button
          type="button"
          onClick={listening ? stopVoice : startVoice}
          aria-pressed={listening}
          aria-label={listening ? 'Stop voice input' : 'Speak address'}
          title={voiceError ?? (listening ? 'Listening… tap to cancel' : 'Speak address')}
          className={`absolute right-2 top-1/2 -translate-y-1/2 inline-flex h-7 w-7 items-center justify-center rounded-full transition ${
            listening
              ? 'bg-rose-600 text-white shadow ring-2 ring-rose-300 animate-pulse'
              : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
          }`}
        >
          <MicIcon size={14} />
        </button>
      )}
      {open && (showLocateRow || features.length > 0) && (
        <ul
          role="listbox"
          className="absolute z-20 mt-2 max-h-64 w-full overflow-auto rounded-xl border border-slate-200 bg-white shadow-xl"
        >
          {showLocateRow && (
            <li
              role="option"
              aria-selected={false}
              onMouseDown={(e) => { e.preventDefault(); pickCurrentLocation(); }}
              className="flex cursor-pointer items-center gap-2 border-b border-slate-100 px-4 py-2 text-left text-sm text-emerald-800 hover:bg-emerald-50"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
                <circle cx="8" cy="8" r="3" stroke="currentColor" strokeWidth="1.4" />
                <circle cx="8" cy="8" r="1" fill="currentColor" />
                <path d="M8 1v2 M8 13v2 M1 8h2 M13 8h2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              </svg>
              <div className="flex-1">
                <div className="font-medium">{locating ? 'Locating…' : 'Use current location'}</div>
                {locateError && <div className="text-xs text-amber-700">{locateError}</div>}
              </div>
            </li>
          )}
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

function MicIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="9" y="2" width="6" height="12" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0" />
      <path d="M12 18v3" />
    </svg>
  );
}
