import { Redirect, router } from 'expo-router';
import { Alert, Linking, Pressable, StyleSheet, View } from 'react-native';

import { useCloseNeed, useMarkReceived, useMyNeeds, useMyNgo, useNgoPledges } from '@/api/hooks';
import { errorPair, joinPair } from '@/i18n';
import { dayMonth, prettyPhone } from '@/lib/format';
import { useSession } from '@/store/session';
import { C, F } from '@/theme';
import { Bi, Btn, Card, ErrorState, LinkBtn, Loading, Note, Screen, T } from '@/ui/kit';
import { NeedCard, needTitle } from '@/ui/NeedCard';

/** The NGO's own page: verification status, its needs, and donors who are coming. */
export default function MyNgo() {
  const signedIn = !!useSession((s) => s.access);
  const q = useMyNgo();
  const ngo = q.data;
  const verified = ngo?.status === 'verified';
  const needs = useMyNeeds(verified);
  const upcoming = useNgoPledges(verified, true);
  const close = useCloseNeed();
  const received = useMarkReceived();

  if (!signedIn) return <Redirect href={{ pathname: '/verify', params: { next: 'ngo' } }} />;
  if (q.isLoading) return <Screen title={['Your NGO', 'आपकी संस्था']}><Loading /></Screen>;
  if (q.error) return <Screen title={['Your NGO', 'आपकी संस्था']}><ErrorState error={q.error} onRetry={() => q.refetch()} /></Screen>;
  if (!ngo) return <Redirect href="/ngos/register" />;

  return (
    <Screen
      title={['Your NGO', 'आपकी संस्था']}
      refreshing={q.isRefetching}
      onRefresh={() => Promise.all([q.refetch(), needs.refetch(), upcoming.refetch()])}
      foot={verified ? <Btn p={['Post a meal need', 'भोजन की ज़रूरत बताएँ']} onPress={() => router.push('/ngos/post-need')} /> : undefined}
    >
      {verified ? (
        <View style={st.vcard}>
          <View style={st.vbig}>
            <T style={{ fontSize: 26, lineHeight: 30, color: C.leaf, fontFamily: F.bold }}>✓</T>
          </View>
          <View style={{ flex: 1 }}>
            <Bi en="Registered NGO" hi="रजिस्टर्ड संस्था" style={{ fontFamily: F.display, fontSize: 22, lineHeight: 27, color: C.tur }} hiStyle={{ fontFamily: F.medium, fontSize: 13, color: C.paleYellow, opacity: 1 }} />
            <T style={{ color: C.white, fontSize: 13, opacity: 0.9, marginTop: 4 }}>
              {ngo.name} · {ngo.registration_id}
            </T>
          </View>
        </View>
      ) : (
        <>
          <Card>
            <T style={{ fontFamily: F.display, fontSize: 20, lineHeight: 25, color: C.leaf }}>{ngo.name}</T>
            <T style={{ color: C.mut, fontSize: 13 }}>{ngo.registration_id}</T>
          </Card>
          <Note
            p={[
              `Paused by Anndaan support${ngo.rejection_reason ? `: ${ngo.rejection_reason}` : ''}. Your needs are hidden until it is re-enabled.`,
              `अन्नदान सहायता ने रोका है${ngo.rejection_reason ? `: ${ngo.rejection_reason}` : ''}। दोबारा चालू होने तक आपकी ज़रूरतें नहीं दिखेंगी।`,
            ]}
          />
        </>
      )}
      <LinkBtn p={['Edit NGO details', 'संस्था की जानकारी बदलें']} onPress={() => router.push('/ngos/register')} />

      {verified && (
        <>
          <Bi en="Donors coming" hi="आने वाले दाता" style={st.h} hiStyle={st.hHi} />
          {upcoming.data?.items.filter((p) => p.status !== 'cancelled').length ? (
            upcoming.data.items
              .filter((p) => p.status !== 'cancelled')
              .map((p) => (
                <Card key={p.id}>
                  <T style={{ fontFamily: F.bold, color: C.leaf }}>
                    {p.donor_name} · {p.people} people · {dayMonth(p.for_date)[0]}
                  </T>
                  <T style={{ color: C.mut, fontSize: 13 }}>
                    {needTitle(p.need)[0]} · {p.delivery === 'drop_off' ? 'They drop it off' : 'You collect'}
                  </T>
                  <View style={{ flexDirection: 'row', gap: 16, alignItems: 'center' }}>
                    {p.donor_phone && (
                      <Pressable onPress={() => Linking.openURL(`tel:${p.donor_phone}`)} accessibilityRole="link">
                        <T style={{ color: C.leaf, fontFamily: F.bold, textDecorationLine: 'underline' }}>Call {prettyPhone(p.donor_phone)}</T>
                      </Pressable>
                    )}
                    {p.status === 'received' ? (
                      <T style={{ color: C.leaf, fontFamily: F.semi }}>Received ✓</T>
                    ) : (
                      <LinkBtn p={['Mark received', 'मिल गया']} onPress={() => received.mutate(p.id, { onError: (e) => Alert.alert(joinPair(errorPair(e))) })} />
                    )}
                  </View>
                </Card>
              ))
          ) : (
            <T style={{ color: C.mut }}>No donors have signed up for upcoming days yet.</T>
          )}

          <Bi en="Your meal needs" hi="आपकी भोजन ज़रूरतें" style={st.h} hiStyle={st.hHi} />
          {needs.data?.items.map((n) => (
            <View key={n.id} style={{ gap: 4 }}>
              <NeedCard n={n} onPress={() => router.push({ pathname: '/ngos/need/[id]', params: { id: n.id } })} />
              <LinkBtn
                p={n.status === 'open' ? ['Close this need', 'यह ज़रूरत बंद करें'] : ['Reopen this need', 'फिर से खोलें']}
                color={C.mut}
                onPress={() => close.mutate({ id: n.id, status: n.status === 'open' ? 'closed' : 'open' })}
              />
            </View>
          ))}
        </>
      )}
    </Screen>
  );
}

const st = StyleSheet.create({
  vcard: { flexDirection: 'row', gap: 14, alignItems: 'center', backgroundColor: C.leaf, borderRadius: 18, padding: 16 },
  vbig: { width: 52, height: 52, borderRadius: 26, backgroundColor: C.tur, alignItems: 'center', justifyContent: 'center' },
  h: { fontFamily: F.display, fontSize: 19, lineHeight: 24, color: C.leaf, marginTop: 10 },
  hHi: { fontFamily: F.medium, fontSize: 13, color: C.mut, opacity: 1 },
});
