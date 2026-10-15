import * as Crypto from 'expo-crypto';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { ApiError } from '@/api/client';
import { useListing, useReserve } from '@/api/hooks';
import type { ForWhom } from '@/api/types';
import { errorPair } from '@/i18n';
import { prettyPhone, time12 } from '@/lib/format';
import { useSession } from '@/store/session';
import { C, F } from '@/theme';
import { Heart, Home, Paw, Person } from '@/ui/icons';
import { Btn, Chip, Chips, ErrorState, FieldError, Lbl, LinkBtn, Loading, Opt, Screen, T, useNow } from '@/ui/kit';

const WHO: { v: ForWhom; p: [string, string]; sub?: [string, string]; icon: React.ReactNode }[] = [
  { v: 'me', p: ['For me', 'मेरे लिए'], icon: <Person size={24} /> },
  { v: 'family', p: ['For my family', 'मेरे परिवार के लिए'], icon: <Home size={24} /> },
  { v: 'needy', p: ['For people in need', 'ज़रूरतमंदों के लिए'], icon: <Heart size={24} /> },
  { v: 'animals', p: ['For bezubaan friends', 'बेज़ुबान साथियों के लिए'], sub: ['Street dogs, cows, birds', 'गली के कुत्ते, गाय, पक्षी'], icon: <Paw size={24} /> },
];

export default function Reserve() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const user = useSession((s) => s.user);
  const q = useListing(id);
  const reserve = useReserve();
  const [who, setWho] = useState<ForWhom>('me');
  const [eta, setEta] = useState<number | null>(30);
  // One key per screen visit: a double tap or a retry after a timeout can't reserve twice.
  const [key] = useState(() => Crypto.randomUUID().replace(/-/g, ''));
  const now = useNow(30_000);

  if (q.isLoading) return <Screen title={['Reserve a meal', 'भोजन आरक्षित करें']}><Loading /></Screen>;
  if (!q.data) return <Screen title={['Reserve a meal', 'भोजन आरक्षित करें']}><ErrorState error={q.error} onRetry={() => q.refetch()} /></Screen>;
  const l = q.data;
  const minsLeft = (new Date(l.good_until).getTime() - now) / 60000;

  const submit = () =>
    reserve.mutate(
      { listingId: id, body: { for_whom: who, eta_minutes: eta, idempotency_key: key } },
      {
        onSuccess: (res) => {
          router.dismissAll();
          router.push('/meals');
          router.push({ pathname: '/reservation/[id]', params: { id: res.id } });
        },
        onError: (e) => {
          if (e instanceof ApiError && e.status === 409) q.refetch();
        },
      },
    );

  return (
    <Screen
      title={['Reserve a meal', 'भोजन आरक्षित करें']}
      foot={
        <>
          {reserve.error && <FieldError p={errorPair(reserve.error)} />}
          <Btn p={['Reserve', 'आरक्षित करें']} onPress={submit} loading={reserve.isPending} disabled={l.status !== 'available'} />
        </>
      }
    >
      <Lbl p={['Who is it for?', 'यह किसके लिए है?']} />
      <View style={{ gap: 8 }}>
        {WHO.map((w) => (
          <Opt key={w.v} p={w.p} sub={w.sub} icon={w.icon} on={who === w.v} onPress={() => setWho(w.v)} />
        ))}
      </View>
      <T style={{ fontSize: 12.5, color: C.mut }}>The donor sees this, so they know where their food is going.</T>

      <Lbl p={['When will you come?', 'आप कब आएँगे?']} />
      <Chips>
        <Chip p={['In 30 min', '30 मिनट में']} on={eta === 30} disabled={minsLeft < 30} onPress={() => setEta(30)} />
        <Chip p={['In 1 hour', '1 घंटे में']} on={eta === 60} disabled={minsLeft < 60} onPress={() => setEta(60)} />
        <Chip p={[`Before ${time12(l.good_until)}`, `${time12(l.good_until)} से पहले`]} on={eta === null} onPress={() => setEta(null)} />
      </Chips>

      <Lbl p={['Your name and number', 'आपका नाम और नंबर']} />
      <View style={field}>
        <T style={{ fontFamily: F.semi }}>
          {user?.name} · {user ? prettyPhone(user.phone) : ''}
        </T>
      </View>
      <LinkBtn p={['Change my name', 'मेरा नाम बदलें']} onPress={() => router.push('/me')} />
    </Screen>
  );
}

const field = { backgroundColor: C.white, borderRadius: 12, borderWidth: 1.5, borderColor: C.line, paddingHorizontal: 14, paddingVertical: 12, minHeight: 48 };
