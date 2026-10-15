import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { useNearby } from '@/api/hooks';
import { inIndia, useHere } from '@/lib/location';
import { C } from '@/theme';
import { FoodMark } from '@/ui/icons';
import { Bi, Btn, Chip, Chips, Empty, ErrorState, Field, FieldError, Loading, Screen } from '@/ui/kit';
import { MealCard } from '@/ui/MealCard';

type Filter = 'all' | 'veg' | 'nonveg';

/** Anyone can browse without signing in. */
export default function Meals() {
  const { place, status, locate, search } = useHere();
  const [filter, setFilter] = useState<Filter>('all');
  const [area, setArea] = useState('');
  const [notFound, setNotFound] = useState(false);
  const q = useNearby(place?.lat, place?.lng, filter === 'all' ? undefined : filter);

  const needPlace = (!place || !inIndia(place.lat, place.lng)) && (status === 'denied' || status === 'error' || status === 'outside');

  return (
    <Screen title={['Meals near you', 'आपके पास भोजन']} refreshing={q.isRefetching} onRefresh={() => q.refetch()}>
      <Chips>
        <Chip tight p={['All', 'सभी']} on={filter === 'all'} onPress={() => setFilter('all')} />
        <Chip tight p={['Veg', 'शाकाहारी']} icon={<FoodMark type="veg" />} on={filter === 'veg'} onPress={() => setFilter('veg')} />
        <Chip tight p={['Non-veg', 'मांसाहारी']} icon={<FoodMark type="nonveg" />} on={filter === 'nonveg'} onPress={() => setFilter('nonveg')} />
      </Chips>

      {needPlace ? (
        <View style={{ gap: 12, paddingTop: 12 }}>
          <Empty
            title={['Where are you?', 'आप कहाँ हैं?']}
            body={
              status === 'outside'
                ? ['Anndaan works in India, and your location looks outside India. Type your area to see meals there.', 'अन्नदान भारत में काम करता है और आपकी लोकेशन भारत से बाहर लगती है। वहाँ का भोजन देखने के लिए अपना इलाका लिखें।']
                : ['Allow location to see meals close to you, or type your area.', 'पास का भोजन देखने के लिए लोकेशन चालू करें, या अपना इलाका लिखें।']
            }
          />
          <Btn p={['Use my location', 'मेरी लोकेशन लें']} onPress={locate} />
          <Field value={area} onChangeText={setArea} placeholder="Sector 15, Rohini, Delhi" returnKeyType="search" onSubmitEditing={async () => setNotFound(!(await search(area)))} />
          {notFound && <FieldError p={['We could not find that area. Try adding the city.', 'यह इलाका नहीं मिला। शहर का नाम भी लिखें।']} />}
          <Btn kind="sec" p={['Search this area', 'यह इलाका खोजें']} onPress={async () => setNotFound(!(await search(area)))} />
        </View>
      ) : !place || q.isLoading ? (
        <Loading label={['Finding meals near you', 'आपके पास भोजन खोज रहे हैं']} />
      ) : q.error ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : q.data && q.data.items.length === 0 ? (
        <Empty
          title={['No meals near you right now', 'अभी आपके पास कोई भोजन नहीं']}
          body={['Food appears here as soon as someone nearby shares it. Pull down to check again.', 'जैसे ही कोई पास में खाना बाँटेगा, यहाँ दिखेगा। दोबारा देखने के लिए नीचे खींचें।']}
          action={<Btn kind="sec" p={['Share food instead', 'खाना बाँटें']} onPress={() => router.push('/share')} />}
        />
      ) : (
        <>
          {q.data!.items.map((m) => (
            <MealCard key={m.id} item={m} onPress={() => router.push({ pathname: '/meal/[id]', params: { id: m.id } })} />
          ))}
          <Bi
            en="Collected meals are removed from this list automatically."
            hi="जो खाना ले लिया गया, वह सूची से हट जाता है।"
            style={{ color: C.mut, fontSize: 12.5 }}
          />
        </>
      )}
    </Screen>
  );
}
