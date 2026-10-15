import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Linking, Pressable, StyleSheet, View } from 'react-native';

import { ApiError } from '@/api/client';
import { useListing, useListingAction, useReservation, useReservationAction } from '@/api/hooks';
import { errorPair, FOR_WHOM, joinPair, type Pair } from '@/i18n';
import { firstName, minutesUntil, prettyPhone, time12 } from '@/lib/format';
import { C, F } from '@/theme';
import { Camera, Person } from '@/ui/icons';
import {
  Bi,
  Btn,
  Card,
  Chip,
  Chips,
  CodeInput,
  Empty,
  ErrorState,
  FieldError,
  FoodTitle,
  InfoRow,
  Lbl,
  LinkBtn,
  Loading,
  Note,
  Screen,
  Sheet,
  T,
  Tag,
} from '@/ui/kit';

/** The donor's view of one post: waiting, reserved (hand over), or closed. */
export default function MyFood() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const q = useListing(id, undefined, undefined, 10_000);
  const l = q.data;
  const resId = l?.current_reservation_id ?? '';
  const rq = useReservation(resId);
  const r = resId ? rq.data : undefined;
  const la = useListingAction();
  const ra = useReservationAction();
  const [code, setCode] = useState('');
  const [codeErr, setCodeErr] = useState<Pair | null>(null);
  const [sheet, setSheet] = useState(false);
  const [shorten, setShorten] = useState<number | null>(null);

  // Keep the listing in step with the polled reservation (e.g. collector said "Yes, collected").
  useEffect(() => {
    if (rq.data?.status && l && rq.data.status !== 'active' && l.status === 'reserved') void q.refetch();
  }, [rq.data?.status, l, q]);

  useEffect(() => {
    if (r?.status === 'completed' && !r.my_review_id) router.replace({ pathname: '/done/[id]', params: { id: r.id } });
  }, [r?.status, r?.id, r?.my_review_id]);

  const title: Pair = ['My posted food', 'मेरा पोस्ट किया खाना'];
  if (q.isLoading || (resId && rq.isLoading)) return <Screen title={title}><Loading /></Screen>;
  if (!l) return <Screen title={title}><ErrorState error={q.error} onRetry={() => q.refetch()} /></Screen>;
  if (!l.is_mine) return <Screen title={title}><Empty title={['This is not your post', 'यह आपकी पोस्ट नहीं है']} /></Screen>;

  const confirmCancel = () =>
    Alert.alert(
      joinPair(['Cancel this post?', 'यह पोस्ट रद्द करें?']),
      joinPair(
        l.status === 'reserved'
          ? ['The person who reserved it will be told not to come.', 'जिन्होंने आरक्षित किया है, उन्हें न आने के लिए बताया जाएगा।']
          : ['It will be removed from the list.', 'इसे सूची से हटा दिया जाएगा।'],
      ),
      [
        { text: joinPair(['Keep it', 'रहने दें'], undefined, ' / '), style: 'cancel' },
        {
          text: joinPair(['Cancel post', 'पोस्ट रद्द करें'], undefined, ' / '),
          style: 'destructive',
          onPress: () => la.cancel.mutate(l.id, { onError: (e) => Alert.alert(joinPair(errorPair(e))) }),
        },
      ],
    );

  const addPhoto = async () => {
    const pick = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7, allowsEditing: true, aspect: [4, 3] });
    if (!pick.canceled) la.photo.mutate({ id: l.id, uri: pick.assets[0].uri }, { onError: (e) => Alert.alert(joinPair(errorPair(e))) });
  };

  const verify = () => {
    setCodeErr(null);
    ra.verifyCode.mutate(
      { id: resId, code },
      {
        onError: (e) => {
          setCode('');
          const left = e instanceof ApiError ? (e.details as { attempts_left?: number } | undefined)?.attempts_left : undefined;
          const base = errorPair(e);
          setCodeErr(left !== undefined ? [`${base[0]} ${left} tries left.`, `${base[1]} ${left} कोशिश बाकी।`] : base);
          void rq.refetch();
        },
      },
    );
  };

  const reactivate = () => {
    const good_until = shorten ? new Date(Date.now() + shorten * 60_000).toISOString() : undefined;
    la.reactivate.mutate(
      { id: l.id, good_until },
      { onSuccess: () => setSheet(false), onError: (e) => Alert.alert(joinPair(errorPair(e))) },
    );
  };

  // ----- closed states -----
  if (!['available', 'reserved'].includes(l.status)) {
    const msg: Record<string, Pair> = {
      collected: ['Handed over. Thank you for sharing.', 'खाना पहुँच गया। बाँटने के लिए धन्यवाद।'],
      cancelled: ['You cancelled this post.', 'आपने यह पोस्ट रद्द की।'],
      expired: ['This post ended at its good-until time.', 'समय पूरा होने पर यह पोस्ट समाप्त हुई।'],
      removed: ['The Anndaan team removed this post after a report.', 'शिकायत के बाद अन्नदान टीम ने यह पोस्ट हटा दी।'],
    };
    return (
      <Screen title={title} foot={<Btn p={['Share food again', 'फिर से खाना बाँटें']} onPress={() => router.replace('/share')} />}>
        <Card>
          <FoodTitle type={l.food_type} servings={l.servings} />
        </Card>
        <Note p={msg[l.status] ?? msg.expired} />
        {r?.status === 'completed' && r.can_review && (
          <Btn kind="sec" p={['Review the person who collected', 'लेने वाले की समीक्षा लिखें']} onPress={() => router.push({ pathname: '/review/[id]', params: { id: r.id } })} />
        )}
      </Screen>
    );
  }

  // ----- waiting for someone -----
  if (l.status === 'available' || !r || r.status !== 'active') {
    return (
      <Screen
        title={title}
        refreshing={q.isRefetching}
        onRefresh={() => q.refetch()}
        foot={
          <>
            <Btn kind="sec" p={['Edit details', 'जानकारी बदलें']} onPress={() => router.push({ pathname: '/edit-food/[id]', params: { id: l.id } })} disabled={!l.can_edit} />
            <Btn kind="danger" p={['Cancel post', 'पोस्ट रद्द करें']} onPress={confirmCancel} loading={la.cancel.isPending} />
          </>
        }
      >
        <Card>
          <FoodTitle type={l.food_type} servings={l.servings} />
          <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
            <Tag p={l.status === 'reserved' ? ['Reserved', 'आरक्षित'] : ['Available', 'उपलब्ध']} kind={l.status === 'reserved' ? 'res' : 'ok'} />
            <T style={{ color: C.mut, fontSize: 13 }}>Good until {time12(l.good_until)}</T>
          </View>
          <T style={{ color: C.mut, fontSize: 13 }}>{l.address}</T>
        </Card>
        <Note p={['Waiting for someone nearby to reserve it. We’ll notify you.', 'पास में किसी के आरक्षित करने का इंतज़ार है। हम आपको बताएँगे।']} />
        {l.images.length < 3 && (
          <Pressable onPress={addPhoto} style={({ pressed }) => [st.upload, pressed && { opacity: 0.8 }]} accessibilityRole="button">
            <Camera />
            <Bi en={l.images.length ? 'Add another photo' : 'Add a photo of the food'} hi="खाने की फ़ोटो जोड़ें" style={{ fontFamily: F.bold, color: C.leaf }} />
          </Pressable>
        )}
      </Screen>
    );
  }

  // ----- reserved: hand over -----
  const who = r.collector?.name ?? 'Someone';
  const fn = firstName(who);
  const mins = minutesUntil(r.expected_at);
  const eta = mins > 0 ? `arriving in ${mins} min` : `was due ${-mins} min ago`;
  const guard = l.pickup_method === 'guard';
  const reactivateLink = (
    <LinkBtn p={['They didn’t come? Make it available again', 'वे नहीं आए? फिर से उपलब्ध करें']} onPress={() => setSheet(true)} />
  );

  return (
    <Screen
      title={guard ? [`${l.food_type === 'veg' ? 'Veg' : 'Non-veg'} meal · ${l.servings} people`, `${l.food_type === 'veg' ? 'शाकाहारी' : 'मांसाहारी'} भोजन · ${l.servings} लोग`] : title}
      refreshing={rq.isRefetching}
      onRefresh={() => rq.refetch()}
      foot={
        guard ? (
          <>
            {ra.confirm.error && <FieldError p={errorPair(ra.confirm.error)} />}
            <Btn p={['Yes, collected', 'हाँ, ले लिया']} onPress={() => ra.confirm.mutate(resId)} loading={ra.confirm.isPending} />
            <Btn kind="sec" p={['Not yet', 'अभी नहीं']} onPress={() => router.back()} />
          </>
        ) : (
          <>
            <FieldError p={codeErr} />
            <Btn p={['Verify and hand over', 'पुष्टि करें, खाना दें']} onPress={verify} loading={ra.verifyCode.isPending} disabled={code.length !== 4 || r.code_locked} />
          </>
        )
      }
    >
      <View style={st.mealrow}>
        <FoodTitle type={l.food_type} servings={l.servings} size={16} />
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: -6 }}>
        <Tag p={['Reserved', 'आरक्षित']} kind="res" />
        <T style={{ color: C.mut, fontSize: 13 }}>
          by {fn} · {eta}
        </T>
      </View>
      <View style={st.for}>
        <Bi en={FOR_WHOM[r.for_whom][0]} hi={FOR_WHOM[r.for_whom][1]} row style={{ color: C.amberText, fontFamily: F.bold, fontSize: 13 }} />
      </View>
      {r.collector && (
        <InfoRow
          icon={<Person />}
          title={[who, who]}
          sub={prettyPhone(r.collector.phone)}
          right={
            <Pressable onPress={() => Linking.openURL(`tel:${r.collector!.phone}`)} style={st.call} accessibilityRole="button" accessibilityLabel={`Call ${fn}`}>
              <T style={{ color: C.tur, fontFamily: F.bold }}>Call</T>
            </Pressable>
          }
        />
      )}

      {guard ? (
        <>
          <Bi en="Was the food collected?" hi="क्या खाना ले लिया गया?" style={st.q} hiStyle={{ fontFamily: F.medium, fontSize: 15, color: C.mut, opacity: 1 }} />
          <View style={st.both}>
            <View style={st.bothItem}>
              <Bi en="Donor: not answered" hi="दाता: जवाब नहीं" style={{ fontSize: 13, fontFamily: F.semi }} />
            </View>
            <View style={st.bothItem}>
              <Bi
                en={r.collector_confirmed_at ? 'Person collecting: yes' : 'Person collecting: not answered'}
                hi={r.collector_confirmed_at ? 'लेने वाले: हाँ' : 'लेने वाले: जवाब नहीं'}
                style={{ fontSize: 13, fontFamily: F.semi }}
              />
            </View>
          </View>
          <Bi
            en="This question goes to both of you. The first “Yes” from either side marks the meal as collected."
            hi="यह सवाल आप दोनों से पूछा जाता है। किसी एक का “हाँ” काफ़ी है।"
            style={{ color: C.mut, fontSize: 13.5 }}
          />
          {reactivateLink}
        </>
      ) : (
        <>
          <Lbl p={[`Enter the pick-up code ${fn} tells you`, `${fn} जो कोड बताएँ, वह डालें`]} />
          <CodeInput length={4} value={code} onChange={setCode} />
          {r.code_locked ? (
            <FieldError p={['Too many wrong codes. Make the meal available again, or contact Anndaan support.', 'बहुत बार गलत कोड। भोजन फिर से उपलब्ध करें या सहायता से संपर्क करें।']} />
          ) : (
            <Bi en="Only enter it once the food is in their hands." hi="खाना देने के बाद ही कोड डालें।" style={{ color: C.mut, fontSize: 13.5 }} />
          )}
          {reactivateLink}
        </>
      )}

      <Sheet visible={sheet} onClose={() => setSheet(false)}>
        <Bi en="Make it available again?" hi="फिर से उपलब्ध करें?" style={st.sheetH} hiStyle={{ fontFamily: F.medium, fontSize: 14 }} />
        <Bi
          en={`${fn}’s reservation will be cancelled and the meal goes back on the list for others nearby.`}
          hi={`${fn} का आरक्षण रद्द होगा और खाना फिर से दूसरों के लिए सूची में आ जाएगा।`}
          style={{ fontSize: 15 }}
        />
        <Note p={[`Good until ${time12(l.good_until)}. Change it if the food won’t last that long.`, `${time12(l.good_until)} बजे तक ठीक रहेगा। ज़रूरत हो तो समय बदलें।`]} />
        <Chips>
          <Chip tight p={['Keep time', 'समय वही']} on={shorten === null} onPress={() => setShorten(null)} />
          {[60, 120].filter((m) => minutesUntil(l.good_until) > m + 15).map((m) => (
            <Chip key={m} tight p={[`${m / 60} hour${m > 60 ? 's' : ''} from now`, `अब से ${m / 60} घंटे`]} on={shorten === m} onPress={() => setShorten(m)} />
          ))}
        </Chips>
        <Btn p={['Make available again', 'फिर से उपलब्ध करें']} onPress={reactivate} loading={la.reactivate.isPending} />
        <Btn kind="sec" p={['Keep waiting', 'इंतज़ार करें']} onPress={() => setSheet(false)} />
      </Sheet>
    </Screen>
  );
}

const st = StyleSheet.create({
  mealrow: { backgroundColor: C.white, borderRadius: 14, padding: 12, borderWidth: 1.5, borderColor: C.line },
  for: { alignSelf: 'flex-start', backgroundColor: C.tint, borderRadius: 999, paddingVertical: 3, paddingHorizontal: 12 },
  call: { backgroundColor: C.leaf, borderRadius: 999, paddingVertical: 6, paddingHorizontal: 16 },
  q: { fontFamily: F.display, fontSize: 25, lineHeight: 30, color: C.leaf, marginTop: 6 },
  both: { flexDirection: 'row', gap: 8 },
  bothItem: { flex: 1, backgroundColor: C.white, borderRadius: 12, padding: 10, borderWidth: 1.5, borderColor: C.line },
  sheetH: { fontFamily: F.display, fontSize: 24, lineHeight: 30, color: C.leaf },
  upload: { flexDirection: 'row', gap: 12, alignItems: 'center', backgroundColor: C.white, borderRadius: 14, padding: 12, borderWidth: 1.5, borderColor: C.line },
});
