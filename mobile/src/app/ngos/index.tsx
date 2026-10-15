import { router } from 'expo-router';

import { useMe, useNeeds } from '@/api/hooks';
import { usePrefs } from '@/store/prefs';
import { useSession } from '@/store/session';
import { C } from '@/theme';
import { Bi, Empty, ErrorState, IconBtn, LinkBtn, Loading, Screen, T } from '@/ui/kit';
import { NeedCard } from '@/ui/NeedCard';

export default function Ngos() {
  const place = usePrefs((s) => s.place);
  const q = useNeeds(place?.lat, place?.lng);
  const signedIn = !!useSession((s) => s.access);
  const me = useMe();
  const hasNgo = !!(me.data?.ngo ?? useSession.getState().user?.ngo);
  const toNgo = () => router.push(hasNgo ? '/ngos/mine' : signedIn ? '/ngos/register' : { pathname: '/verify', params: { next: 'ngo' } });

  return (
    <Screen
      title={['Meals NGOs need', 'संस्थाओं को भोजन चाहिए']}
      right={
        <IconBtn onPress={toNgo} label={hasNgo ? 'My NGO' : 'Register your NGO'}>
          <T style={{ fontSize: 24, lineHeight: 28, color: C.leaf }}>+</T>
        </IconBtn>
      }
      refreshing={q.isRefetching}
      onRefresh={() => q.refetch()}
    >
      <Bi
        en="Cooked meals for shelters, children’s homes and night shelters near you."
        hi="आपके पास के आश्रय, बाल गृह और रैन बसेरों के लिए पका हुआ खाना।"
        style={{ fontSize: 15 }}
      />
      {q.isLoading ? (
        <Loading />
      ) : q.error ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : !q.data?.items.length ? (
        <Empty title={['No meal needs nearby yet', 'अभी पास में कोई ज़रूरत नहीं']} body={['Verified NGOs post their needs here.', 'सत्यापित संस्थाएँ अपनी ज़रूरतें यहाँ बताती हैं।']} />
      ) : (
        q.data.items.map((n) => <NeedCard key={n.id} n={n} onPress={() => router.push({ pathname: '/ngos/need/[id]', params: { id: n.id } })} />)
      )}
      <LinkBtn
        p={hasNgo ? ['Open my NGO', 'मेरी संस्था खोलें'] : ['Are you an NGO? Register to post meal needs', 'क्या आप संस्था हैं? ज़रूरत बताने के लिए रजिस्टर करें']}
        onPress={toNgo}
      />
    </Screen>
  );
}
