import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';
import { Alert, Linking, Pressable, StyleSheet, View } from 'react-native';

import { useReservation, useReservationAction } from '@/api/hooks';
import { errorPair, FOOD, joinPair } from '@/i18n';
import { firstName, prettyPhone, time12 } from '@/lib/format';
import { C, F } from '@/theme';
import { Door, Person, Shield } from '@/ui/icons';
import { Bi, Btn, Empty, ErrorState, FieldError, InfoRow, Loading, Screen, T, Timeline } from '@/ui/kit';

/** The collector's view of a reservation: pick-up code, where to go, and who to call. */
export default function ReservationScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const q = useReservation(id);
  const act = useReservationAction();
  const r = q.data;

  useEffect(() => {
    if (r?.status === 'completed' && r.role === 'collector' && !r.my_review_id) {
      router.replace({ pathname: '/done/[id]', params: { id: r.id } });
    }
  }, [r?.status, r?.role, r?.id, r?.my_review_id]);

  if (q.isLoading) return <Screen title={['Meal reserved', 'भोजन आरक्षित हो गया']}><Loading /></Screen>;
  if (!r) return <Screen title={['Meal reserved', 'भोजन आरक्षित हो गया']}><ErrorState error={q.error} onRetry={() => q.refetch()} /></Screen>;
  if (r.role === 'donor') return <Redirect href={{ pathname: '/my-food/[id]', params: { id: r.listing.id } }} />;

  const l = r.listing;
  const donor = firstName(r.donor?.name ?? l.donor.display_name);
  const guard = l.pickup_method === 'guard';

  if (r.status !== 'active' && r.status !== 'completed') {
    const why: [string, string] =
      r.status === 'cancelled_by_collector'
        ? ['You cancelled this reservation.', 'आपने यह आरक्षण रद्द किया।']
        : r.status === 'expired'
          ? ['This reservation ended because the food’s good-until time passed.', 'समय पूरा होने के कारण यह आरक्षण समाप्त हुआ।']
          : [`${donor} made this meal available to others again. Your pick-up code no longer works.`, `${donor} ने यह भोजन फिर से दूसरों के लिए उपलब्ध किया। आपका कोड अब काम नहीं करेगा।`];
    return (
      <Screen title={['Reservation ended', 'आरक्षण समाप्त']} foot={<Btn p={['Find another meal', 'दूसरा भोजन खोजें']} onPress={() => router.replace('/meals')} />}>
        <Empty title={['Not reserved for you any more', 'अब आपके लिए आरक्षित नहीं']} body={why} />
      </Screen>
    );
  }

  const cancel = () =>
    Alert.alert(joinPair(['Cancel reservation?', 'आरक्षण रद्द करें?']), joinPair(['The meal goes back on the list for others.', 'भोजन फिर से दूसरों के लिए सूची में आ जाएगा।']), [
      { text: joinPair(['Keep it', 'रहने दें'], undefined, ' / '), style: 'cancel' },
      {
        text: joinPair(['Cancel reservation', 'रद्द करें'], undefined, ' / '),
        style: 'destructive',
        onPress: () => act.cancel.mutate(r.id, { onError: (e) => Alert.alert(joinPair(errorPair(e))) }),
      },
    ]);

  const call = () => r.donor && Linking.openURL(`tel:${r.donor.phone}`);
  const where: [string, string] = guard
    ? [`Collect from the guard before ${time12(l.good_until)}`, `${time12(l.good_until)} से पहले गार्ड से लें`]
    : [`Collect at their door before ${time12(l.good_until)}`, `${time12(l.good_until)} बजे से पहले दरवाज़े से लें`];

  return (
    <Screen
      title={['Meal reserved', 'भोजन आरक्षित हो गया']}
      onBack={() => (router.canGoBack() ? router.back() : router.replace('/home'))}
      refreshing={q.isRefetching}
      onRefresh={() => q.refetch()}
      foot={
        r.status === 'active' ? (
          guard ? (
            <>
              {act.confirm.error && <FieldError p={errorPair(act.confirm.error)} />}
              <Btn p={['Yes, collected', 'हाँ, ले लिया']} loading={act.confirm.isPending} onPress={() => act.confirm.mutate(r.id)} />
              <Btn kind="sec" p={['Cancel reservation', 'आरक्षण रद्द करें']} onPress={cancel} loading={act.cancel.isPending} />
            </>
          ) : (
            <Btn kind="sec" p={['Cancel reservation', 'आरक्षण रद्द करें']} onPress={cancel} loading={act.cancel.isPending} />
          )
        ) : (
          <Btn p={['Back to home', 'होम पर जाएँ']} onPress={() => router.replace('/home')} />
        )
      }
    >
      {guard ? (
        <View style={st.codebox}>
          <Bi en="Left with the guard" hi="गार्ड के पास रखा है" style={{ color: C.tur, fontFamily: F.bold }} />
          <Bi
            en={`${joinPair(FOOD[l.food_type], 'en')} for ${l.servings}. Tell the guard it is reserved for you. Tap “Yes, collected” once you have it.`}
            hi={`${l.servings} लोगों का ${FOOD[l.food_type][1]}। गार्ड को बताएँ कि यह आपके लिए आरक्षित है। मिलने पर “हाँ, ले लिया” दबाएँ।`}
            style={{ color: C.white, fontSize: 14, textAlign: 'center' }}
          />
        </View>
      ) : (
        <View style={st.codebox} accessible accessibilityLabel={`Your pick-up code is ${r.pickup_code?.split('').join(' ')}`}>
          <Bi en="Your pick-up code" hi="आपका पिक-अप कोड" style={{ color: C.tur, fontFamily: F.bold }} />
          {r.pickup_code ? (
            <T style={st.code}>{r.pickup_code.split('').join(' ')}</T>
          ) : (
            <T style={[st.code, { fontSize: 22 }]}>{r.code_locked ? 'Code locked' : '—'}</T>
          )}
          <Bi
            en={`Tell this code to ${donor} when you collect the food.`}
            hi={`खाना लेते समय यह कोड ${donor} जी को बताएँ।`}
            style={{ color: C.white, fontSize: 14, textAlign: 'center' }}
          />
        </View>
      )}

      <InfoRow icon={guard ? <Shield /> : <Door />} title={where} sub={r.address} />
      <InfoRow
        icon={<Person />}
        title={['Donor', 'दाता']}
        sub={r.donor ? `${r.donor.name} · ${prettyPhone(r.donor.phone)}` : l.donor.display_name}
        right={
          r.donor ? (
            <Pressable onPress={call} style={st.call} accessibilityRole="button" accessibilityLabel={`Call ${donor}`}>
              <T style={{ color: C.tur, fontFamily: F.bold }}>Call</T>
            </Pressable>
          ) : null
        }
      />
      <Timeline
        steps={[
          { p: ['Reserved for you', 'आपके लिए आरक्षित'], state: 'done' },
          { p: guard ? ['Collect from the guard', 'गार्ड से लें'] : ['Collect and tell the code', 'लें और कोड बताएँ'], state: r.status === 'completed' ? 'done' : 'act' },
          { p: ['Done', 'पूरा'], state: r.status === 'completed' ? 'done' : 'todo' },
        ]}
      />
      {r.status === 'completed' && (
        <Btn kind="sec" p={['Leave a review', 'समीक्षा लिखें']} onPress={() => router.push({ pathname: '/review/[id]', params: { id: r.id } })} disabled={!r.can_review} />
      )}
    </Screen>
  );
}

const st = StyleSheet.create({
  codebox: { backgroundColor: C.leaf, borderRadius: 20, padding: 18, alignItems: 'center', gap: 4 },
  code: { fontFamily: F.display, fontSize: 52, lineHeight: 60, letterSpacing: 6, color: C.white, marginVertical: 6 },
  call: { backgroundColor: C.leaf, borderRadius: 999, paddingVertical: 6, paddingHorizontal: 16 },
});
