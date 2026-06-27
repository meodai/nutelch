export interface RangeSpec {
  key: string;
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  format?: (v: number) => string;
}

export interface SelectSpec {
  key: string;
  label: string;
  options: string[];
  value: string;
}

export interface ControlValues {
  values: Record<string, number>;
  choices: Record<string, string>;
}

// A live handle so callers can reshape a range after build — used to switch the
// lightness slider between a model's native L scale (0..1 vs 0..100) on the fly.
export interface ControlsHandle {
  values(): ControlValues;
  setRange(key: string, patch: Partial<Pick<RangeSpec, 'min' | 'max' | 'step' | 'value'>>): void;
}

export function buildControls(
  host: HTMLElement,
  ranges: RangeSpec[],
  selects: SelectSpec[],
  onChange: (v: ControlValues, changedKey: string) => void,
): ControlsHandle {
  host.innerHTML = '';
  const state: Record<string, number> = {};
  const choices: Record<string, string> = {};
  const inputs = new Map<string, HTMLInputElement>();
  const outs = new Map<string, HTMLElement>();
  const wraps = new Map<string, HTMLElement>();
  const formats = new Map<string, (v: number) => string>();

  for (const r of ranges) {
    state[r.key] = r.value;
    if (r.format) formats.set(r.key, r.format);
  }
  for (const s of selects) choices[s.key] = s.value;

  const snapshot = (): ControlValues => ({ values: { ...state }, choices: { ...choices } });
  const emit = (key: string) => onChange(snapshot(), key);
  const fmt = (key: string, v: number) => (formats.get(key) ?? ((n: number) => String(n)))(v);
  const rel = (v: number, min: number, max: number) => (max > min ? (v - min) / (max - min) : 0);

  for (const r of ranges) {
    const wrap = document.createElement('label');
    wrap.className = 'ctrl ctrl--range';

    const head = document.createElement('span');
    head.className = 'ctrl__head';
    const name = document.createElement('span');
    name.className = 'ctrl__name';
    name.textContent = r.label;
    const out = document.createElement('output');
    out.className = 'ctrl__val';
    out.textContent = fmt(r.key, r.value);
    head.append(name, out);

    const input = document.createElement('input');
    input.type = 'range';
    input.min = String(r.min);
    input.max = String(r.max);
    input.step = String(r.step);
    input.value = String(r.value);
    wrap.style.setProperty('--rel', String(rel(r.value, r.min, r.max)));

    input.addEventListener('input', () => {
      const v = Number(input.value);
      state[r.key] = v;
      out.textContent = fmt(r.key, v);
      wrap.style.setProperty('--rel', String(rel(v, Number(input.min), Number(input.max))));
      emit(r.key);
    });

    wrap.append(head, input);
    host.appendChild(wrap);
    inputs.set(r.key, input);
    outs.set(r.key, out);
    wraps.set(r.key, wrap);
  }

  for (const s of selects) {
    const wrap = document.createElement('label');
    wrap.className = 'ctrl ctrl--select';
    const name = document.createElement('span');
    name.className = 'ctrl__name';
    name.textContent = s.label;
    const sel = document.createElement('select');
    for (const o of s.options) {
      const opt = document.createElement('option');
      opt.value = o;
      opt.textContent = o;
      if (o === s.value) opt.selected = true;
      sel.appendChild(opt);
    }
    sel.addEventListener('change', () => {
      choices[s.key] = sel.value;
      emit(s.key);
    });
    wrap.append(name, sel);
    host.appendChild(wrap);
  }

  emit('init');

  return {
    values: snapshot,
    setRange(key, patch) {
      const input = inputs.get(key);
      const wrap = wraps.get(key);
      const out = outs.get(key);
      if (!input || !wrap || !out) return;
      if (patch.min !== undefined) input.min = String(patch.min);
      if (patch.max !== undefined) input.max = String(patch.max);
      if (patch.step !== undefined) input.step = String(patch.step);
      if (patch.value !== undefined) {
        input.value = String(patch.value);
        state[key] = patch.value;
      }
      const v = Number(input.value);
      out.textContent = fmt(key, v);
      wrap.style.setProperty('--rel', String(rel(v, Number(input.min), Number(input.max))));
    },
  };
}
