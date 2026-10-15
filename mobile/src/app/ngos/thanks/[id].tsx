import { useQuery } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { Alert, Linking, Pressable, Share, View } from 'react-native';
import Animated, { ZoomIn } from 'react-native-reanimated';

import { api } from '@/api/client';
import { keys, useCancelPledge } from '@/api/hooks';
import type { Pledge } from '@/api/types';
import { errorPair, joinPair, MEAL } from '@/i18n';
import { clock, firstName, prettyPhone, weekdayDay } from '@/lib/format';
import { useSession } from '@/store/session';
import { C, F } from '@/theme';
import { Check, Phone } from '@/ui/icons';
import { Bar, Bi, Btn, InfoRow, LinkBtn, Loading, Screen, T } from '@/ui/kit';

/** Confirmation after giving meals: updated bar, what to do, and the NGO's number. */
export default function Thanks() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const user = useSession((s) => s.user);
  const cancel = useCancelPledge();
  const q = useQuery({
    queryKey: keys.pledge(id),
    queryFn: () => api<Pledge>(`/pledges/${id}`),
  });
  const p = q.data;
  if (!p) return <Screen back={false}><Loading /></Screen>;

  const n = p.need;
  const day = weekdayDay(p.for_date);
  const meal = MEAL[n.meal];
  const who = n.audience ?? 'people';
  const text: [string, string] =
    p.delivery === 'drop_off'
      ? [`Drop off ${meal[0].toLowerCase()} for ${p.people} ${who} on ${day[0]} by ${clock(n.meal_time)}. ${n.ngo.name} has been told you’re coming.`,
         `${day[1]} को ${clock(n.meal_time)} तक ${p.people} लोगों का भोजन पहुँचाएँ। संस्था को सूचना दे दी गई है।`]
      : [`${n.ngo.name} will collect ${meal[0].toLowerCase()} for ${p.people} on ${day[0]}. They have your number.`,
         `${day[1]} को संस्था ${p.people} लोगों का भोजन ले जाएगी। उनके पास आपका नंबर है।`];

  const share = () =>
    Share.share({
      message: `I just gave ${meal[0].toLowerCase()} for ${p.people} to ${n.ngo.name} through Anndaan. ${p.occurrence.remaining} more meals are still needed — help out!`,
    });

  const doCancel = () =>
    Alert.alert(joinPair(['Cancel these meals?', 'यह भोजन रद्द करें?']), joinPair(['The NGO will be told.', 'संस्था को बताया जाएगा।']), [
      { text: joinPair(['Keep', 'रहने दें'], undefined, ' / '), style: 'cancel' },
      {
        text: joinPair(['Cancel', 'रद्द करें'], undefined, ' / '),
        style: 'destructive',
        onPress: () => cancel.mutate(p.id, { onSuccess: () => router.replace('/home'), onError: (e) => Alert.alert(joinPair(errorPair(e))) }),
      },
    ]);

  return (
    <Screen
      back={false}
      foot={
        <>
          <Btn p={['Share with friends', 'दोस्तों को बताएँ']} onPress={share} />
          <Btn kind="sec" p={['Back to home', 'होम पर जाएँ']} onPress={() => router.replace('/home')} />
        </>
      }
    >
      <View style={{ alignItems: 'center', gap: 14, paddingTop: 20 }}>
        <Animated.View entering={ZoomIn.springify().damping(14)} style={okc}>
          <Check />
        </Animated.View>
        <Bi
          en={`Thank you, ${firstName(user?.name)}`}
          hi={`धन्यवाद, ${firstName(user?.name)} जी`}
          style={{ fontFamily: F.display, fontSize: 28, lineHeight: 32, color: C.leaf, textAlign: 'center' }}
          hiStyle={{ fontFamily: F.medium, color: C.mut, opacity: 1 }}
        />
      </View>
      <View style={barwrap}>
        <Bar big have={p.occurrence.covered} total={n.people} />
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 }}>
          <T style={{ fontSize: 13 }}>
            <T style={{ fontFamily: F.bold, color: C.leaf, fontSize: 13 }}>
              {p.occurrence.covered} of {n.people}
            </T>{' '}
            covered
          </T>
          <T style={{ fontSize: 13 }}>{p.occurrence.remaining ? `${p.occurrence.remaining} more needed` : 'Fully covered'}</T>
        </View>
      </View>
      <Bi en={text[0]} hi={text[1]} style={{ fontSize: 15 }} />
      <InfoRow
        icon={<Phone />}
        title={['NGO contact', 'संस्था का संपर्क']}
        sub={`${n.ngo.name} · ${prettyPhone(p.ngo_contact_phone)}`}
        right={
          <Pressable onPress={() => Linking.openURL(`tel:${p.ngo_contact_phone}`)} style={call} accessibilityRole="button">
            <T style={{ color: C.tur, fontFamily: F.bold }}>Call</T>
          </Pressable>
        }
      />
      <T style={{ color: C.mut, fontSize: 13 }}>{p.ngo_address}</T>
      {p.status === 'pledged' && <LinkBtn p={['I can’t make it — cancel', 'नहीं हो पाएगा — रद्द करें']} color={C.mut} onPress={doCancel} />}
    </Screen>
  );
}

const okc = { width: 84, height: 84, borderRadius: 42, backgroundColor: C.tur, alignItems: 'center' as const, justifyContent: 'center' as const };
const barwrap = { backgroundColor: C.white, borderRadius: 16, paddingVertical: 12, paddingHorizontal: 14, borderWidth: 1.5, borderColor: C.line };
const call = { backgroundColor: C.leaf, borderRadius: 999, paddingVertical: 6, paddingHorizontal: 16 };
