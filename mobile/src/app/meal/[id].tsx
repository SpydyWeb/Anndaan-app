import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { useListing } from '@/api/hooks';
import { API_URL } from '@/config';
import { ago, initials, km, time12 } from '@/lib/format';
import { usePrefs } from '@/store/prefs';
import { useSession } from '@/store/session';
import { C, F } from '@/theme';
import { Door, FoodMark, Shield } from '@/ui/icons';
import { Avatar, Bi, Btn, ErrorState, Facts, InfoRow, LinkBtn, Loading, Screen, Stars, Strip, T } from '@/ui/kit';

export default function MealDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const place = usePrefs((s) => s.place);
  const signedIn = !!useSession((s) => s.access);
  const q = useListing(id, place?.lat, place?.lng);
  const l = q.data;

  if (q.isLoading) return <Screen title={['About this food', 'इस खाने के बारे में']}><Loading /></Screen>;
  if (!l) return <Screen title={['About this food', 'इस खाने के बारे में']}><ErrorState error={q.error} onRetry={() => q.refetch()} /></Screen>;

  const available = l.status === 'available';
  const reserve = () =>
    signedIn ? router.push({ pathname: '/reserve/[id]', params: { id } }) : router.push({ pathname: '/verify', params: { next: 'reserve', id } });

  let foot;
  if (l.is_mine) foot = <Btn p={['Manage my posted food', 'मेरा पोस्ट किया खाना']} onPress={() => router.push({ pathname: '/my-food/[id]', params: { id } })} />;
  else if (l.my_reservation_id && l.status === 'reserved')
    foot = <Btn p={['Open my pick-up details', 'मेरी पिक-अप जानकारी']} onPress={() => router.push({ pathname: '/reservation/[id]', params: { id: l.my_reservation_id! } })} />;
  else if (available) foot = <Btn p={['Reserve this meal', 'यह भोजन आरक्षित करें']} onPress={reserve} />;
  else
    foot = (
      <Btn
        disabled
        p={l.status === 'reserved' ? ['Already reserved by someone', 'किसी और ने आरक्षित कर लिया'] : ['No longer available', 'अब उपलब्ध नहीं']}
      />
    );

  const doorP: [string, string] = l.pickup_method === 'door' ? ['At their door', 'उनके दरवाज़े पर'] : ['With the guard', 'गार्ड के पास'];
  return (
    <Screen title={['About this food', 'इस खाने के बारे में']} foot={foot} refreshing={q.isRefetching} onRefresh={() => q.refetch()}>
      <View style={st.hero}>
        <View style={{ marginTop: 6 }}>
          <FoodMark type={l.food_type} size={20} />
        </View>
        <Bi
          en={l.food_type === 'veg' ? 'Veg meal' : 'Non-veg meal'}
          hi={l.food_type === 'veg' ? 'शाकाहारी भोजन' : 'मांसाहारी भोजन'}
          style={{ fontFamily: F.display, fontSize: 26, lineHeight: 30, color: C.leaf }}
          hiStyle={{ fontFamily: F.medium, fontSize: 14 }}
        />
      </View>
      {l.images.length > 0 && <Image source={{ uri: API_URL + l.images[0].url }} style={st.photo} contentFit="cover" />}
      <Facts
        items={[
          { p: ['Feeds', 'कितने लोग'], value: `${l.servings} people` },
          { p: ['Good until', 'कब तक'], value: time12(l.good_until) },
          { p: ['Distance', 'दूरी'], value: km(l.distance_km) ?? '—' },
        ]}
      />
      <Strip p={[`You reserve the whole portion, for all ${l.servings} people.`, `आप पूरा खाना, सभी ${l.servings} लोगों का, एक साथ आरक्षित करेंगे।`]} />
      <InfoRow
        icon={l.pickup_method === 'door' ? <Door /> : <Shield />}
        title={doorP}
        sub={l.address ?? `${l.area} · full address shown after you reserve`}
      />
      <InfoRow
        icon={<Avatar text={initials(l.donor.display_name)} />}
        title={[l.donor.display_name, l.donor.display_name]}
        sub={
          l.donor.review_count
            ? `${l.donor.rating?.toFixed(1)} · ${l.donor.review_count} reviews · shared ${l.donor_meals_shared} meals`
            : `New on Anndaan · shared ${l.donor_meals_shared} meals`
        }
        right={<T style={{ fontSize: 24, color: C.mut }}>›</T>}
        onPress={() => router.push({ pathname: '/profile/[id]', params: { id: l.donor.id } })}
      />
      {l.latest_review && (
        <View style={st.rv}>
          <Stars value={l.latest_review.stars} />
          {l.latest_review.comment ? <T style={{ fontSize: 14 }}>“{l.latest_review.comment}”</T> : null}
          <T style={{ color: C.mut, fontSize: 12.5 }}>
            {l.latest_review.author_name} · {ago(l.latest_review.created_at)[0]}
          </T>
        </View>
      )}
      {l.note ? <T style={{ fontSize: 14 }}>{l.note}</T> : null}
      <T style={{ fontSize: 12.5, color: C.mut }}>
        Check the food when you collect it. Anndaan connects neighbours; it cannot inspect food.
      </T>
      {signedIn && !l.is_mine && (
        <LinkBtn
          p={['Report this food', 'इस खाने की शिकायत करें']}
          color={C.mut}
          onPress={() => router.push({ pathname: '/report', params: { listing: l.id } })}
        />
      )}
    </Screen>
  );
}

const st = StyleSheet.create({
  hero: { backgroundColor: C.tint, borderRadius: 18, paddingVertical: 18, paddingHorizontal: 16, flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  photo: { width: '100%', aspectRatio: 4 / 3, borderRadius: 16, backgroundColor: C.line },
  rv: { borderLeftWidth: 3, borderLeftColor: C.tur, paddingLeft: 12, paddingVertical: 2, gap: 2 },
});
