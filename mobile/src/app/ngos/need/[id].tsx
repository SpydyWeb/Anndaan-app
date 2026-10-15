import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useNeed, usePledge } from '@/api/hooks';
import { errorPair } from '@/i18n';
import { weekdayDay } from '@/lib/format';
import { useSession } from '@/store/session';
import { C, F } from '@/theme';
import { Bar, Bi, Btn, Chip, Chips, Empty, ErrorState, FieldError, Lbl, Loading, Screen, Stepper, T } from '@/ui/kit';
import { needTitle, needWhen } from '@/ui/NeedCard';

/** A donor gives meals for one date. The bar previews the new total. No accept/reject step. */
export default function GiveToNgo() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const signedIn = !!useSession((s) => s.access);
  const myNgo = useSession((s) => s.user?.ngo?.id);
  const q = useNeed(id);
  const pledge = usePledge();
  const n = q.data;
  const open = useMemo(() => n?.upcoming.filter((o) => o.remaining > 0) ?? [], [n]);
  const [day, setDay] = useState<string | null>(null);
  const [wanted, setPeople] = useState(10);
  const [how, setHow] = useState<'drop_off' | 'collect'>('drop_off');

  const occ = n?.upcoming.find((o) => o.date === day && o.remaining > 0) ?? open[0];
  const remaining = occ?.remaining ?? 0;
  const count = Math.max(1, Math.min(wanted, remaining || 1));

  if (q.isLoading) return <Screen><Loading /></Screen>;
  if (!n) return <Screen><ErrorState error={q.error} onRetry={() => q.refetch()} /></Screen>;

  const title = needTitle(n);
  const isMine = myNgo === n.ngo.id;
  const give = () => {
    if (!signedIn) return router.push({ pathname: '/verify', params: { next: 'back' } });
    if (!occ) return;
    pledge.mutate(
      { needId: id, body: { people: count, for_date: occ.date, delivery: how } },
      { onSuccess: (p) => router.replace({ pathname: '/ngos/thanks/[id]', params: { id: p.id } }), onError: () => q.refetch() },
    );
  };

  const covered = occ?.covered ?? 0;
  const after = covered + (occ ? count : 0);
  return (
    <Screen
      title={[n.ngo.name, n.ngo.name]}
      refreshing={q.isRefetching}
      onRefresh={() => q.refetch()}
      foot={
        !isMine && open.length > 0 ? (
          <>
            {pledge.error && <FieldError p={errorPair(pledge.error)} />}
            <Btn p={[`Give meals for ${count}`, `${count} लोगों का भोजन दें`]} onPress={give} loading={pledge.isPending} />
          </>
        ) : undefined
      }
    >
      <Bi en={title[0]} hi={title[1]} style={st.big} hiStyle={{ fontFamily: F.medium, fontSize: 14 }} />
      <T style={{ fontSize: 13.5 }}>
        {needWhen(n)} · {n.address}
      </T>
      <T style={{ fontSize: 13.5, color: C.mut }}>{n.food_pref === 'veg' ? 'Veg food only' : 'Veg or non-veg'}</T>
      {open.length === 0 ? (
        <Empty title={['Fully covered for now', 'अभी के लिए ज़रूरत पूरी']} body={['Every upcoming day is covered. Check back later.', 'आने वाले सभी दिनों की ज़रूरत पूरी है। बाद में देखें।']} />
      ) : (
        <>
          <View style={st.barwrap}>
            <Bar big have={covered} add={isMine ? 0 : after - covered} total={n.people} />
            <View style={st.nn}>
              <T style={{ fontSize: 13 }}>
                <T style={{ fontFamily: F.bold, color: C.leaf, fontSize: 13 }}>
                  {after} of {n.people}
                </T>{' '}
                {isMine ? 'covered' : 'covered with yours'}
              </T>
              <T style={{ fontSize: 13 }}>{n.people - after > 0 ? `${n.people - after} more needed` : 'Fully covered'}</T>
            </View>
          </View>
          {isMine ? (
            <T style={{ color: C.mut }}>This is your NGO’s need. Donors see this page.</T>
          ) : (
            <>
              <Lbl p={['How many people can you feed?', 'आप कितने लोगों को खिला सकते हैं?']} />
              <Stepper value={count} onChange={setPeople} max={Math.max(1, remaining)} unit={['people', 'लोग']} />
              <Lbl p={['Which day?', 'किस दिन?']} />
              <Chips>
                {n.upcoming.map((o) => (
                  <Chip
                    key={o.date}
                    p={weekdayDay(o.date)}
                    sub={o.remaining ? `${o.remaining} needed` : 'Covered'}
                    disabled={!o.remaining}
                    on={occ?.date === o.date}
                    onPress={() => setDay(o.date)}
                  />
                ))}
              </Chips>
              <Lbl p={['How will it reach them?', 'खाना कैसे पहुँचेगा?']} />
              <Chips>
                <Chip big p={['I’ll drop it off', 'मैं खुद पहुँचाऊँ']} on={how === 'drop_off'} onPress={() => setHow('drop_off')} />
                <Chip big p={['They collect', 'वे ले जाएँगे']} on={how === 'collect'} onPress={() => setHow('collect')} />
              </Chips>
            </>
          )}
        </>
      )}
    </Screen>
  );
}

const st = StyleSheet.create({
  big: { fontFamily: F.display, fontSize: 24, lineHeight: 29, color: C.leaf },
  barwrap: { backgroundColor: C.white, borderRadius: 16, paddingVertical: 12, paddingHorizontal: 14, borderWidth: 1.5, borderColor: C.line },
  nn: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
});
