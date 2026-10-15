import { create } from 'zustand';

export type UntilChoice = '2h' | '4h' | 'tonight';
export type CookedChoice = 'now' | 'recent' | 'earlier';

type Draft = {
  foodType: 'veg' | 'nonveg';
  servings: number;
  until: UntilChoice;
  cooked: CookedChoice;
  pickup: 'door' | 'guard';
  address: string;
  area: string;
  photoUri: string | null;
  set: (p: Partial<Omit<Draft, 'set' | 'reset'>>) => void;
  reset: () => void;
};

const initial = {
  foodType: 'veg' as const,
  servings: 4,
  until: '4h' as UntilChoice,
  cooked: 'now' as CookedChoice,
  pickup: 'door' as const,
  address: '',
  area: '',
  photoUri: null,
};

/** The food being posted, carried across the two share steps and number verification. */
export const useDraft = create<Draft>()((set) => ({
  ...initial,
  set: (p) => set(p),
  reset: () => set(initial),
}));

export function tonight(): Date {
  const d = new Date();
  d.setHours(22, 30, 0, 0);
  return d;
}

export function untilDate(choice: UntilChoice): Date {
  const now = Date.now();
  if (choice === '2h') return new Date(now + 2 * 3600_000);
  if (choice === '4h') return new Date(now + 4 * 3600_000);
  return tonight();
}

/** "Tonight" only makes sense while it is still at least an hour away. */
export const tonightAvailable = () => tonight().getTime() - Date.now() > 3600_000;

export function cookedDate(choice: CookedChoice): Date {
  const mins = choice === 'now' ? 0 : choice === 'recent' ? 90 : 240;
  return new Date(Date.now() - mins * 60_000);
}
