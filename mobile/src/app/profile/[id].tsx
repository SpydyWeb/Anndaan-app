import { router, useLocalSearchParams } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { useProfile } from '@/api/hooks';
import { REVIEW_TAGS } from '@/i18n';
import { ago, initials } from '@/lib/format';
import { useSession } from '@/store/session';
import { C, F } from '@/theme';
import { Avatar, Bi, Empty, ErrorState, Facts, LinkBtn, Loading, Screen, Stars, T } from '@/ui/kit';

/** Public profile: anyone can open it from a meal card. No phone number or address. */
export default function Profile() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const me = useSession((s) => s.user);
  const q = useProfile(id);
  const p = q.data;

  if (q.isLoading) return <Screen><Loading /></Screen>;
  if (!p) return <Screen><ErrorState error={q.error} onRetry={() => q.refetch()} /></Screen>;

  return (
    <Screen title={[p.display_name, p.display_name]} refreshing={q.isRefetching} onRefresh={() => q.refetch()}>
      <View style={{ flexDirection: 'row', gap: 14, alignItems: 'center' }}>
        <Avatar big text={initials(p.display_name)} />
        <View style={{ gap: 2 }}>
          <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
            <Stars value={p.rating} size={18} />
            {p.rating !== null && <T style={{ fontFamily: F.display, fontSize: 22, lineHeight: 28, color: C.leaf }}>{p.rating.toFixed(1)}</T>}
          </View>
          <Bi
            en={`${p.review_count} reviews${p.area ? ` · ${p.area}` : ''}`}
            hi={`${p.review_count} समीक्षाएँ${p.area ? ` · ${p.area}` : ''}`}
            style={{ color: C.mut, fontSize: 13 }}
          />
        </View>
      </View>
      <Facts
        items={[
          { p: ['Meals shared', 'भोजन बाँटे'], value: String(p.meals_shared) },
          { p: ['People fed', 'लोगों ने खाया'], value: String(p.people_fed) },
          { p: ['Sharing since', 'कब से'], value: String(p.since_year) },
        ]}
      />
      {p.top_tags.length > 0 && (
        <View style={st.taglist}>
          {p.top_tags.map((t) => (
            <View key={t.tag} style={st.tagItem}>
              <T style={st.tagText}>
                {REVIEW_TAGS[t.tag as keyof typeof REVIEW_TAGS]?.[0] ?? t.tag} · {t.count}
              </T>
            </View>
          ))}
        </View>
      )}
      <View style={{ marginTop: 4 }}>
        <Bi en="Reviews" hi="समीक्षाएँ" style={{ fontFamily: F.bold, fontSize: 15, color: C.leaf }} hiStyle={{ color: C.mut, opacity: 1 }} />
      </View>
      {p.reviews.length === 0 ? (
        <Empty title={['No reviews yet', 'अभी कोई समीक्षा नहीं']} body={['Reviews appear after a hand-over.', 'खाना देने-लेने के बाद समीक्षाएँ दिखती हैं।']} />
      ) : (
        p.reviews.map((r) => (
          <View key={r.id} style={st.rvi}>
            <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
              <T style={{ fontFamily: F.bold, fontSize: 14 }}>{r.author_name}</T>
              <Stars value={r.stars} />
              <T style={{ marginLeft: 'auto', color: C.mut, fontSize: 12 }}>{ago(r.created_at)[0]}</T>
            </View>
            {r.comment ? <T style={{ fontSize: 14 }}>{r.comment}</T> : null}
          </View>
        ))
      )}
      {me && me.id !== p.id && (
        <LinkBtn p={['Report this person', 'इस व्यक्ति की शिकायत करें']} color={C.mut} onPress={() => router.push({ pathname: '/report', params: { user: p.id } })} />
      )}
    </Screen>
  );
}

const st = StyleSheet.create({
  taglist: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  tagItem: { backgroundColor: C.leafTint, borderRadius: 999, paddingVertical: 3, paddingHorizontal: 10 },
  tagText: { color: C.leaf, fontSize: 12.5, fontFamily: F.semi },
  rvi: { borderBottomWidth: 1, borderBottomColor: C.line, paddingBottom: 8, gap: 2 },
});
