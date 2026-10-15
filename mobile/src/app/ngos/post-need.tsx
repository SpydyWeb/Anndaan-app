import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { usePostNeed } from '@/api/hooks';
import type { NeedIn } from '@/api/types';
import { errorPair, FREQ, MEAL, type Pair } from '@/i18n';
import { clock, isoDate, weekdayDay } from '@/lib/format';
import { C, F } from '@/theme';
import { FoodMark } from '@/ui/icons';
import { Btn, Chip, Chips, Field, FieldError, Lbl, Note, PickerSheet, Screen, Stepper, T } from '@/ui/kit';

const DEFAULT_TIME: Record<NeedIn['meal'], string> = { breakfast: '08:30:00', lunch: '12:30:00', dinner: '20:00:00' };

function halfHours(): { value: string; p: Pair }[] {
  const out = [];
  for (let m = 6 * 60; m <= 22 * 60; m += 30) {
    const v = `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}:00`;
    out.push({ value: v, p: [clock(v), clock(v)] as Pair });
  }
  return out;
}

const TIMES = halfHours();

/** Verified NGOs only (the server enforces it). Cooked meals only. */
export default function PostNeed() {
  const post = usePostNeed();
  const [meal, setMeal] = useState<NeedIn['meal']>('lunch');
  const [people, setPeople] = useState(30);
  const [freq, setFreq] = useState<NeedIn['frequency']>('daily');
  const [start, setStart] = useState(() => isoDate(new Date(Date.now() + 86400_000)));
  const [time, setTime] = useState(DEFAULT_TIME.lunch);
  const [pref, setPref] = useState<NeedIn['food_pref']>('veg');
  const [audience, setAudience] = useState('');
  const [pickDate, setPickDate] = useState(false);
  const [pickTime, setPickTime] = useState(false);

  const [dates] = useState(() =>
    Array.from({ length: 30 }).map((_, i) => {
      const iso = isoDate(new Date(Date.now() + i * 86400_000));
      return { value: iso, p: weekdayDay(iso) };
    }),
  );

  const submit = () =>
    post.mutate(
      { meal, people, frequency: freq, start_date: start, meal_time: time, food_pref: pref, audience: audience.trim() || null },
      { onSuccess: () => router.replace('/ngos/mine') },
    );

  const pickerField = (label: string, onPress: () => void) => (
    <Pressable onPress={onPress} style={({ pressed }) => [field, pressed && { opacity: 0.8 }]} accessibilityRole="button">
      <T style={{ fontFamily: F.semi }}>{label}</T>
    </Pressable>
  );

  return (
    <Screen
      title={['Post a meal need', 'भोजन की ज़रूरत बताएँ']}
      foot={<>{post.error && <FieldError p={errorPair(post.error)} />}<Btn p={['Post need', 'ज़रूरत पोस्ट करें']} onPress={submit} loading={post.isPending} /></>}
    >
      <Note p={['Cooked meals only. Every meal a donor gives counts towards your total.', 'सिर्फ़ पका हुआ खाना। दाता जो भी देंगे, वह आपकी ज़रूरत में जुड़ जाएगा।']} />
      <Lbl p={['Which meal?', 'कौन-सा भोजन?']} />
      <Chips>
        {(Object.keys(MEAL) as NeedIn['meal'][]).map((m) => (
          <Chip key={m} p={MEAL[m]} on={meal === m} onPress={() => (setMeal(m), setTime(DEFAULT_TIME[m]))} />
        ))}
      </Chips>
      <Lbl p={['For how many people?', 'कितने लोगों के लिए?']} />
      <Stepper value={people} onChange={setPeople} max={2000} unit={['people', 'लोग']} />
      <Field value={audience} onChangeText={setAudience} placeholder="Who are they? e.g. children, elderly (optional)" maxLength={60} />
      <Lbl p={['How often?', 'कितनी बार?']} />
      <Chips>
        {(Object.keys(FREQ) as NeedIn['frequency'][]).map((f) => (
          <Chip key={f} tight p={FREQ[f]} on={freq === f} onPress={() => setFreq(f)} />
        ))}
      </Chips>
      <Lbl p={freq === 'once' ? ['On', 'किस दिन'] : ['Starting', 'कब से']} />
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <View style={{ flex: 1 }}>{pickerField(`${freq === 'once' ? '' : 'From '}${weekdayDay(start)[0]}`, () => setPickDate(true))}</View>
        <View style={{ flex: 1 }}>{pickerField(clock(time), () => setPickTime(true))}</View>
      </View>
      <Lbl p={['Food preference', 'खाने की पसंद']} />
      <Chips>
        <Chip big p={['Veg only', 'सिर्फ़ शाकाहारी']} icon={<FoodMark type="veg" />} on={pref === 'veg'} onPress={() => setPref('veg')} />
        <Chip big p={['Any', 'कोई भी']} on={pref === 'any'} onPress={() => setPref('any')} />
      </Chips>
      <PickerSheet visible={pickDate} onClose={() => setPickDate(false)} title={['Pick a date', 'तारीख़ चुनें']} options={dates} value={start} onPick={setStart} />
      <PickerSheet visible={pickTime} onClose={() => setPickTime(false)} title={['Meal time', 'भोजन का समय']} options={TIMES} value={time} onPick={setTime} />
    </Screen>
  );
}

const field = { backgroundColor: C.white, borderRadius: 12, borderWidth: 1.5, borderColor: C.line, paddingHorizontal: 14, paddingVertical: 12, minHeight: 48 };
