import { router, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';
import Animated, { ZoomIn } from 'react-native-reanimated';

import { useProfile, useReservation } from '@/api/hooks';
import { firstName } from '@/lib/format';
import { C, F } from '@/theme';
import { Check } from '@/ui/icons';
import { Bi, Btn, Loading, Screen, T } from '@/ui/kit';

/** Shown to both sides after the hand-over. */
export default function Done() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const q = useReservation(id, false);
  const r = q.data;
  const donorId = r?.listing.donor.id ?? '';
  const prof = useProfile(donorId);

  if (!r) return <Screen back={false}><Loading /></Screen>;
  const donor = firstName(r.role === 'donor' ? 'you' : r.donor?.name ?? r.listing.donor.display_name);
  const n = prof.data?.meals_shared;

  return (
    <Screen
      back={false}
      center
      foot={
        <>
          {r.can_review && <Btn p={['Leave a review', 'समीक्षा लिखें']} onPress={() => router.replace({ pathname: '/review/[id]', params: { id } })} />}
          <Btn kind="sec" p={['Back to home', 'होम पर जाएँ']} onPress={() => router.replace('/home')} />
        </>
      }
    >
      <Animated.View entering={ZoomIn.springify().damping(14)} style={okc}>
        <Check />
      </Animated.View>
      <Bi en="Food handed over" hi="खाना पहुँच गया" style={{ fontFamily: F.display, fontSize: 28, lineHeight: 32, color: C.leaf, textAlign: 'center' }} hiStyle={{ fontFamily: F.medium, color: C.mut, opacity: 1 }} />
      <Bi
        en={`${r.listing.servings} people will eat well. This meal has been removed from the list.`}
        hi={`${r.listing.servings} लोग अच्छा खाएँगे। यह भोजन सूची से हटा दिया गया है।`}
        style={{ fontSize: 15, textAlign: 'center' }}
      />
      {n !== undefined && (
        <View style={count}>
          {r.role === 'donor' ? (
            <Bi en={`You have shared ${n} meal${n === 1 ? '' : 's'} so far`} hi={`आप अब तक ${n} भोजन बाँट चुके हैं`} style={{ color: C.leaf }} />
          ) : (
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6, flexWrap: 'wrap' }}>
              <T style={{ fontFamily: F.display, fontSize: 20, color: C.leaf }}>{n}</T>
              <Bi en={`meals shared by ${donor} so far`} hi={`भोजन ${donor} जी अब तक बाँट चुके हैं`} style={{ color: C.leaf }} />
            </View>
          )}
        </View>
      )}
    </Screen>
  );
}

const okc = { width: 84, height: 84, borderRadius: 42, backgroundColor: C.tur, alignItems: 'center' as const, justifyContent: 'center' as const };
const count = { backgroundColor: C.tint, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 14, alignSelf: 'stretch' as const };
