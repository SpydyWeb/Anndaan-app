import { Pressable, StyleSheet, View } from 'react-native';

import type { NeedCard as Need } from '@/api/types';
import { FREQ, MEAL } from '@/i18n';
import { clock, dayMonth, weekdayDay } from '@/lib/format';
import { C, F } from '@/theme';

import { Bar, Bi, T } from './kit';

export function needTitle(n: Need): [string, string] {
  const who = n.audience ? n.audience : 'people';
  const meal = MEAL[n.meal];
  const en = `${meal[0]} for ${n.people} ${who}`;
  const hiMeal = n.meal === 'lunch' ? 'दोपहर का खाना' : n.meal === 'dinner' ? 'रात का खाना' : 'नाश्ता';
  return [en, `${n.people} ${n.audience === 'children' ? 'बच्चों' : 'लोगों'} के लिए ${hiMeal}`];
}

export function needWhen(n: Need): string {
  const t = clock(n.meal_time);
  if (n.frequency === 'once') return `${weekdayDay(n.start_date)[0]} · ${t}`;
  if (n.frequency === 'weekly') return `Every ${weekdayDay(n.start_date)[0].split(' ')[0]} · ${t}`;
  if (n.frequency === 'monthly') return `Monthly from ${dayMonth(n.start_date)[0]} · ${t}`;
  return `From ${dayMonth(n.start_date)[0]} · ${t}`;
}

/** A meal need on the public list. The bar fills as donors give. */
export function NeedCard({ n, onPress }: { n: Need; onPress: () => void }) {
  const next = n.next;
  const covered = next?.covered ?? 0;
  const title = needTitle(n);
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => [st.need, pressed && { transform: [{ scale: 0.985 }] }]}>
      <View style={st.nh}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 1 }}>
          <T style={{ fontFamily: F.bold, fontSize: 13.5, flexShrink: 1 }} numberOfLines={1}>
            {n.ngo.name}
          </T>
        </View>
        <Bi en={FREQ[n.frequency][0]} hi={FREQ[n.frequency][1]} row style={{ fontSize: 13.5, color: C.amberText, fontFamily: F.semi }} />
      </View>
      <Bi en={title[0]} hi={title[1]} style={st.nt} hiStyle={{ fontFamily: F.medium, fontSize: 12 }} />
      <Bar have={covered} total={n.people} />
      <View style={st.nn}>
        <T style={{ fontSize: 13 }}>
          <T style={{ fontFamily: F.bold, color: C.leaf, fontSize: 13 }}>
            {covered} of {n.people}
          </T>{' '}
          people covered
        </T>
        <T style={{ fontSize: 13 }}>{next ? (next.remaining ? `${next.remaining} more needed` : 'Fully covered') : 'No upcoming date'}</T>
      </View>
      <T style={{ fontSize: 12.5, color: C.mut }}>
        {needWhen(n)} · {n.ngo.area}
        {n.distance_km !== null && n.distance_km !== undefined ? ` · ${n.distance_km.toFixed(1)} km` : ''}
      </T>
    </Pressable>
  );
}

const st = StyleSheet.create({
  need: { backgroundColor: C.white, borderRadius: 18, paddingVertical: 12, paddingHorizontal: 14, borderWidth: 1.5, borderColor: C.line, gap: 6 },
  nh: { flexDirection: 'row', justifyContent: 'space-between', gap: 8, alignItems: 'center' },
  nt: { fontFamily: F.display, fontSize: 18, lineHeight: 23, color: C.leaf },
  nn: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
});
