import { router, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';
import Animated, { ZoomIn } from 'react-native-reanimated';

import { useListing } from '@/api/hooks';
import { time12 } from '@/lib/format';
import { C, F } from '@/theme';
import { Check, Clock, FoodMark, People } from '@/ui/icons';
import { Bi, Btn, Card, Screen, T } from '@/ui/kit';

export default function Posted() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const q = useListing(id);
  const l = q.data;
  return (
    <Screen
      back={false}
      center
      foot={
        <>
          <Btn p={['See my posted food', 'मेरा पोस्ट किया खाना']} onPress={() => router.replace({ pathname: '/my-food/[id]', params: { id } })} />
          <Btn kind="sec" p={['Back to home', 'होम पर जाएँ']} onPress={() => router.replace('/home')} />
        </>
      }
    >
      <Animated.View entering={ZoomIn.springify().damping(14)} style={okc}>
        <Check />
      </Animated.View>
      <Bi en="Your food is posted" hi="आपका खाना पोस्ट हो गया" style={{ fontFamily: F.display, fontSize: 28, lineHeight: 32, color: C.leaf, textAlign: 'center' }} hiStyle={{ fontFamily: F.medium, color: C.mut, opacity: 1 }} />
      {l && (
        <Card style={{ flexDirection: 'row', gap: 10, alignSelf: 'stretch', borderRadius: 14 }}>
          <View style={{ marginTop: 4 }}>
            <FoodMark type={l.food_type} />
          </View>
          <View style={{ flex: 1 }}>
            <Bi en={l.food_type === 'veg' ? 'Veg meal' : 'Non-veg meal'} hi={l.food_type === 'veg' ? 'शाकाहारी भोजन' : 'मांसाहारी भोजन'} style={{ fontFamily: F.bold, color: C.leaf, fontSize: 16 }} />
            <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
              <People color={C.mut} />
              <T style={{ color: C.mut, fontSize: 13 }}>{l.servings} people ·</T>
              <Clock color={C.mut} />
              <T style={{ color: C.mut, fontSize: 13 }}>Good until {time12(l.good_until)}</T>
            </View>
          </View>
        </Card>
      )}
      <Bi
        en="We’ll tell you as soon as someone reserves it. Thank you for not letting it go to waste."
        hi="कोई आरक्षित करते ही हम आपको बताएँगे। खाना बर्बाद न होने देने के लिए धन्यवाद।"
        style={{ fontSize: 15, textAlign: 'center' }}
      />
    </Screen>
  );
}

const okc = { width: 84, height: 84, borderRadius: 42, backgroundColor: C.tur, alignItems: 'center' as const, justifyContent: 'center' as const };
