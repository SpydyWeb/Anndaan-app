import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { usePrefs } from '@/store/prefs';
import { C, F } from '@/theme';
import { LogoMark } from '@/ui/icons';
import { Bi, Btn, T } from '@/ui/kit';

const FACTS = [
  ['55 kg', 'of food thrown away by each person in Indian homes, every year', 'भारत के घरों में हर व्यक्ति, हर साल इतना खाना फेंक देता है'],
  ['783 million', 'people around the world went hungry in 2022', 'लोग 2022 में दुनिया भर में भूखे रहे'],
] as const;

/** First-run screen. Shown once; "Get started" or "Skip" never show it again. */
export default function Welcome() {
  const insets = useSafeAreaInsets();
  const done = () => {
    usePrefs.getState().setWelcomeSeen();
    router.replace('/home');
  };
  const rise = (i: number) => FadeInDown.delay(80 + i * 110).duration(420);
  return (
    <View style={{ flex: 1, backgroundColor: C.tur, paddingTop: insets.top }}>
      <StatusBar style="dark" />
      <ScrollView contentContainerStyle={[st.wel, { paddingBottom: Math.max(insets.bottom, 12) + 14 }]}>
        <View style={st.top}>
          <LogoMark size={64} />
          <View>
            <T style={st.brand}>Anndaan</T>
            <T style={st.brandHi}>अन्नदान</T>
          </View>
        </View>
        <Animated.View entering={rise(0)}>
          <Bi
            en="Every day, homes waste over a billion meals."
            hi="हर दिन घरों में एक अरब से ज़्यादा भोजन बर्बाद होते हैं।"
            style={st.h}
            hiStyle={st.hHi}
          />
        </Animated.View>
        <View style={{ gap: 12 }}>
          {FACTS.map(([n, en, hi], i) => (
            <Animated.View key={n} entering={rise(i + 1)} style={st.fact}>
              <T style={st.factNum}>{n}</T>
              <Bi en={en} hi={hi} style={st.factText} hiStyle={{ fontFamily: F.medium }} />
            </Animated.View>
          ))}
        </View>
        <Animated.View entering={rise(3)} style={{ marginTop: 'auto', gap: 16 }}>
          <Bi en="Your extra can be someone’s full meal." hi="आपका ज़्यादा बना खाना, किसी का पूरा भोजन।" style={st.line} hiStyle={{ fontFamily: F.medium }} />
          <Btn p={['Get started', 'शुरू करें']} big onPress={done} />
          <T style={st.src}>Source: UNEP Food Waste Index Report 2024</T>
        </Animated.View>
      </ScrollView>
      <Pressable onPress={done} style={[st.skip, { top: insets.top + 8 }]} accessibilityRole="button" hitSlop={8}>
        <T style={{ fontFamily: F.bold, color: C.leaf }}>Skip</T>
      </Pressable>
    </View>
  );
}

const st = StyleSheet.create({
  wel: { flexGrow: 1, paddingHorizontal: 26, paddingTop: 12, gap: 16 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  brand: { fontFamily: F.display, fontSize: 22, lineHeight: 26, color: C.leaf },
  brandHi: { fontFamily: F.medium, fontSize: 14, lineHeight: 20, color: C.chilli },
  h: { fontFamily: F.display, fontSize: 40, lineHeight: 44, color: C.leaf, letterSpacing: -0.5, marginTop: 18 },
  hHi: { fontFamily: F.medium, fontSize: 17, lineHeight: 24, marginTop: 10, opacity: 0.85 },
  fact: { borderTopWidth: 2, borderTopColor: 'rgba(11,77,44,0.25)', paddingTop: 10 },
  factNum: { fontFamily: F.display, fontSize: 32, lineHeight: 36, color: C.chilli },
  factText: { fontSize: 14.5, lineHeight: 20, fontFamily: F.semi, color: C.leaf },
  line: { fontFamily: F.display, fontSize: 21, lineHeight: 26, color: C.leaf },
  src: { fontSize: 11.5, color: 'rgba(11,77,44,0.75)', textAlign: 'center' },
  skip: { position: 'absolute', right: 22, padding: 8 },
});
