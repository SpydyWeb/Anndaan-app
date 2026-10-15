import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { AccessibilityInfo, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useMyListings, useMyReservations, useNearby, useUnread } from '@/api/hooks';
import { useHere } from '@/lib/location';
import { useSession } from '@/store/session';
import { C, F } from '@/theme';
import { LogoMark, Pin, People, Person, Pot } from '@/ui/icons';
import { Bi, IconBtn, Strip, T } from '@/ui/kit';

const SLOGANS = [
  ['Cooked with love. Shared with respect.', 'प्यार से पकाया, सम्मान से बाँटा।'],
  ['Homes waste over a billion meals a day. Let’s not add to it.', 'हर दिन एक अरब भोजन बर्बाद होते हैं। आइए, इसे रोकें।'],
  ['Nobody nearby should sleep hungry.', 'आसपास कोई भूखा न सोए।'],
] as const;

export default function Home() {
  const insets = useSafeAreaInsets();
  const signed = !!useSession((s) => s.access);
  const { place } = useHere();
  const nearby = useNearby(place?.lat, place?.lng);
  const unread = useUnread();
  const myOpen = useMyListings('open');
  const myRes = useMyReservations('active');
  const [slide, setSlide] = useState(0);

  useEffect(() => {
    let reduce = false;
    AccessibilityInfo.isReduceMotionEnabled().then((r) => (reduce = r));
    const t = setInterval(() => setSlide((i) => (i + 1) % SLOGANS.length), reduce ? 8000 : 4500);
    return () => clearInterval(t);
  }, []);

  const toCollect = myRes.data?.items[0];
  const reservedMine = myOpen.data?.items.find((m) => m.active_reservation);
  const count = nearby.data?.available_count;

  return (
    <View style={{ flex: 1, backgroundColor: C.rice, paddingTop: insets.top }}>
      <StatusBar style="dark" />
      <View style={st.homebar}>
        <LogoMark size={34} />
        <T style={st.wm}>Anndaan</T>
        <IconBtn onPress={() => router.push('/me')} label="My account" badge={signed && (unread.data?.unread ?? 0) > 0}>
          <Person />
        </IconBtn>
      </View>
      <ScrollView contentContainerStyle={[st.body, { paddingBottom: insets.bottom + 20 }]}>
        <View style={st.slogan} accessibilityLiveRegion="polite">
          <Animated.View key={slide} entering={FadeIn.duration(350)}>
            <Bi en={SLOGANS[slide][0]} hi={SLOGANS[slide][1]} style={st.sl} hiStyle={st.slHi} />
          </Animated.View>
          <View style={st.dots}>
            {SLOGANS.map((_, i) => (
              <View key={i} style={[st.dotI, i === slide && st.dotOn]} />
            ))}
          </View>
        </View>

        {toCollect && (
          <Strip
            p={[`You have a ${toCollect.listing.food_type === 'veg' ? 'veg' : 'non-veg'} meal to collect. Open pick-up details`, 'आपको भोजन लेना है। पिक-अप जानकारी खोलें']}
            onPress={() => router.push({ pathname: '/reservation/[id]', params: { id: toCollect.id } })}
          />
        )}
        {reservedMine && (
          <Strip
            p={[`${reservedMine.active_reservation!.collector?.name ?? 'Someone'} reserved your food. Open hand-over`, 'किसी ने आपका खाना आरक्षित किया। हैंड-ओवर खोलें']}
            onPress={() => router.push({ pathname: '/my-food/[id]', params: { id: reservedMine.listing.id } })}
          />
        )}

        <Bi en="What would you like to do?" hi="आप क्या करना चाहेंगे?" style={st.q} hiStyle={st.qHi} />

        <Choice
          kind="c1"
          title={['Share food', 'खाना बाँटें']}
          sub="Cooked too much? Post it in a minute."
          icon={<Pot color={C.leaf} />}
          onPress={() => router.push('/share')}
        />
        <Choice kind="c2" title={['Find a meal', 'भोजन पाएँ']} sub="Fresh home-cooked food, close by." icon={<Pin size={28} color={C.leaf} />} onPress={() => router.push('/meals')} />
        <Choice kind="c3" title={['Help an NGO', 'किसी संस्था की मदद करें']} sub="Give meals to shelters and homes." icon={<People size={28} color={C.leaf} />} onPress={() => router.push('/ngos')} />

        <View style={st.near}>
          <Pin size={15} color={C.mut} />
          <T style={st.nearText}>{place?.label ?? 'Location off'} · </T>
          <Pressable onPress={() => router.push('/meals')} accessibilityRole="link">
            <T style={st.nearLink}>
              {count === undefined ? 'See meals near you' : count === 1 ? '1 meal near you today' : `${count} meals near you today`}
            </T>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

function Choice({ kind, title, sub, icon, onPress }: { kind: 'c1' | 'c2' | 'c3'; title: readonly [string, string]; sub: string; icon: React.ReactNode; onPress: () => void }) {
  const dark = kind === 'c1';
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => [st.choice, dark ? st.c1 : st.c2, pressed && { transform: [{ scale: 0.985 }] }]}>
      <View style={{ flex: 1 }}>
        <Bi en={title[0]} hi={title[1]} style={[st.chTitle, { color: dark ? C.white : C.leaf }]} hiStyle={{ fontFamily: F.medium, fontSize: 13 }} />
        <T style={[st.chSub, { color: dark ? C.white : C.leaf }]}>{sub}</T>
      </View>
      <View style={[st.cic, { backgroundColor: dark ? C.tur : C.leafTint }]}>{icon}</View>
    </Pressable>
  );
}

const st = StyleSheet.create({
  homebar: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 20, paddingRight: 16, paddingTop: 4, paddingBottom: 8 },
  wm: { flex: 1, fontFamily: F.display, fontSize: 22, lineHeight: 28, color: C.leaf },
  body: { paddingHorizontal: 20, paddingTop: 4, gap: 12, flexGrow: 1 },
  slogan: { backgroundColor: C.tur, borderRadius: 22, paddingTop: 18, paddingHorizontal: 18, paddingBottom: 30, minHeight: 128 },
  sl: { fontFamily: F.display, fontSize: 20, lineHeight: 25, color: C.leaf },
  slHi: { fontFamily: F.medium, fontSize: 13.5, lineHeight: 19, marginTop: 6, opacity: 0.9 },
  dots: { flexDirection: 'row', gap: 6, position: 'absolute', left: 18, bottom: 14 },
  dotI: { width: 7, height: 7, borderRadius: 4, backgroundColor: 'rgba(11,77,44,0.3)' },
  dotOn: { width: 20, backgroundColor: C.leaf },
  q: { fontFamily: F.display, fontSize: 25, lineHeight: 30, color: C.leaf, marginTop: 6 },
  qHi: { fontFamily: F.medium, fontSize: 15, color: C.mut, opacity: 1 },
  choice: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 20, padding: 16, minHeight: 88 },
  c1: { backgroundColor: C.leaf },
  c2: { backgroundColor: C.white, borderWidth: 1.5, borderColor: C.line },
  chTitle: { fontFamily: F.display, fontSize: 21, lineHeight: 26 },
  chSub: { fontFamily: F.medium, fontSize: 13.5, marginTop: 4, opacity: 0.85 },
  cic: { width: 52, height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  near: { marginTop: 'auto', flexDirection: 'row', alignItems: 'center', gap: 4, flexWrap: 'wrap', paddingTop: 12 },
  nearText: { fontSize: 13, color: C.mut },
  nearLink: { fontSize: 13, color: C.leaf, fontFamily: F.bold, textDecorationLine: 'underline' },
});
