import { Image } from 'expo-image';
import { Pressable, StyleSheet, View } from 'react-native';

import type { ListingCard } from '@/api/types';
import { API_URL } from '@/config';
import { km, time12 } from '@/lib/format';
import { C, F } from '@/theme';

import { Clock, FoodMark, People, Pin } from './icons';
import { Bi, Stars, T, Tag } from './kit';

/** One meal in "Meals near you". Reserved meals stay visible, greyed and not tappable. */
export function MealCard({ item, onPress }: { item: ListingCard; onPress: () => void }) {
  const reserved = item.status !== 'available';
  const ink = reserved ? C.reservedText : C.ink;
  const name: [string, string] = item.food_type === 'veg' ? ['Veg meal', 'शाकाहारी भोजन'] : ['Non-veg meal', 'मांसाहारी भोजन'];
  const where: [string, string] =
    item.pickup_method === 'door' ? [`At their door · ${item.area}`, `दरवाज़े पर · ${item.area}`] : [`With the guard · ${item.area}`, `गार्ड के पास · ${item.area}`];
  return (
    <Pressable
      onPress={reserved ? undefined : onPress}
      disabled={reserved}
      accessibilityRole="button"
      accessibilityState={{ disabled: reserved }}
      style={({ pressed }) => [st.meal, reserved && st.isres, pressed && !reserved && { transform: [{ scale: 0.985 }] }]}
    >
      <View style={st.mt}>
        <View style={[{ marginTop: 4 }, reserved && { opacity: 0.6 }]}>
          <FoodMark type={item.food_type} />
        </View>
        <View style={{ flex: 1 }}>
          <Bi en={name[0]} hi={name[1]} style={[st.mn, reserved && { color: C.reservedText }]} hiStyle={{ fontFamily: F.medium, fontSize: 12 }} />
        </View>
        {item.image && !reserved ? (
          <Image source={{ uri: API_URL + item.image.url }} style={st.thumb} contentFit="cover" accessibilityIgnoresInvertColors />
        ) : null}
        <Tag p={reserved ? ['Reserved', 'आरक्षित'] : ['Available', 'उपलब्ध']} kind={reserved ? 'res' : 'ok'} />
      </View>
      <View style={st.mby}>
        <T style={[st.mbyText, { color: ink }]}>{item.donor.display_name}</T>
        {item.donor.review_count > 0 && (
          <>
            <View style={reserved && { opacity: 0.5 }}>
              <Stars value={item.donor.rating} />
            </View>
            <T style={[st.mbyText, { fontFamily: F.bold, color: ink }]}>{item.donor.rating?.toFixed(1)}</T>
            <T style={[st.mbyText, { color: C.mut }]}>({item.donor.review_count})</T>
          </>
        )}
      </View>
      <View style={st.mmeta}>
        <Meta icon={<People color={ink} />} text={`${item.servings} people`} color={ink} />
        {item.distance_km !== null && <Meta icon={<Pin color={ink} />} text={km(item.distance_km)!} color={ink} />}
        <Meta icon={<Clock color={ink} />} text={`till ${time12(item.good_until)}`} color={ink} />
      </View>
      <Bi en={where[0]} hi={where[1]} row style={st.mwhere} hiStyle={{ fontSize: 11 }} />
    </Pressable>
  );
}

function Meta({ icon, text, color }: { icon: React.ReactNode; text: string; color: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
      {icon}
      <T style={{ fontSize: 13, color }}>{text}</T>
    </View>
  );
}

const st = StyleSheet.create({
  meal: { backgroundColor: C.white, borderRadius: 18, paddingVertical: 12, paddingHorizontal: 14, borderWidth: 1.5, borderColor: C.line, gap: 5 },
  isres: { backgroundColor: C.reservedBg, borderColor: C.reservedBg },
  mt: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  mn: { fontFamily: F.display, fontSize: 18, lineHeight: 22, color: C.leaf },
  thumb: { width: 40, height: 40, borderRadius: 10, marginTop: -2 },
  mby: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  mbyText: { fontSize: 13 },
  mmeta: { flexDirection: 'row', gap: 12, flexWrap: 'wrap' },
  mwhere: { fontSize: 12.5, color: C.mut },
});
