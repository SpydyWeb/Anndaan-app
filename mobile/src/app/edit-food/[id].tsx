import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import { useListing, useListingAction } from '@/api/hooks';
import type { ListingDetail } from '@/api/types';
import { errorPair } from '@/i18n';
import { minutesUntil, time12 } from '@/lib/format';
import { Door, FoodMark, Shield } from '@/ui/icons';
import { Btn, Chip, Chips, ErrorState, Field, FieldError, Lbl, Loading, Opt, Screen, Stepper } from '@/ui/kit';

/** Edit a post nobody has reserved yet. Good-until can be moved earlier or up to 24 h. */
export default function EditFood() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const q = useListing(id);
  if (q.isLoading) return <Screen title={['Edit food', 'खाना बदलें']}><Loading /></Screen>;
  if (!q.data) return <Screen title={['Edit food', 'खाना बदलें']}><ErrorState error={q.error} onRetry={() => q.refetch()} /></Screen>;
  return <EditForm key={q.data.id} l={q.data} />;
}

function EditForm({ l }: { l: ListingDetail }) {
  const id = l.id;
  const { update } = useListingAction();
  const [servings, setServings] = useState(l.servings);
  const [food, setFood] = useState<'veg' | 'nonveg'>(l.food_type);
  const [pickup, setPickup] = useState<'door' | 'guard'>(l.pickup_method);
  const [address, setAddress] = useState(l.address ?? '');
  const [area, setArea] = useState(l.area);
  const [untilMins, setUntilMins] = useState<number | null>(null);

  const save = () =>
    update.mutate(
      {
        id,
        body: {
          servings,
          food_type: food,
          pickup_method: pickup,
          address: address.trim(),
          area: area.trim(),
          ...(untilMins ? { good_until: new Date(Date.now() + untilMins * 60_000).toISOString() } : {}),
        },
      },
      { onSuccess: () => router.back() },
    );

  const left = minutesUntil(l.good_until);
  return (
    <Screen
      title={['Edit food', 'खाना बदलें']}
      foot={
        <>
          {update.error && <FieldError p={errorPair(update.error)} />}
          <Btn p={['Save changes', 'बदलाव सेव करें']} onPress={save} loading={update.isPending} disabled={!l.can_edit} />
        </>
      }
    >
      <Lbl p={['What food?', 'कौन-सा खाना?']} />
      <Chips>
        <Chip big p={['Veg', 'शाकाहारी']} icon={<FoodMark type="veg" />} on={food === 'veg'} onPress={() => setFood('veg')} />
        <Chip big p={['Non-veg', 'मांसाहारी']} icon={<FoodMark type="nonveg" />} on={food === 'nonveg'} onPress={() => setFood('nonveg')} />
      </Chips>
      <Lbl p={['For how many people?', 'कितने लोगों के लिए?']} />
      <Stepper value={servings} onChange={setServings} unit={['people', 'लोग']} />
      <Lbl p={[`Good until (now ${time12(l.good_until)})`, `कब तक ठीक (अभी ${time12(l.good_until)})`]} />
      <Chips>
        <Chip tight p={['No change', 'वही रहे']} on={untilMins === null} onPress={() => setUntilMins(null)} />
        {[60, 120, 240].map((m) => (
          <Chip key={m} tight p={[`${m / 60} h from now`, `अब से ${m / 60} घंटे`]} on={untilMins === m} onPress={() => setUntilMins(m)} disabled={m > 24 * 60 || (m < 15 && left < 15)} />
        ))}
      </Chips>
      <Lbl p={['Where will it be handed over?', 'खाना कहाँ दिया जाएगा?']} />
      <Opt p={['At my door', 'मेरे दरवाज़े पर']} sub={['They show you a pick-up code', 'वे आपको पिक-अप कोड बताएँगे']} icon={<Door />} on={pickup === 'door'} onPress={() => setPickup('door')} />
      <Opt p={['With the guard', 'गार्ड के पास']} sub={['Either of you confirms it was collected', 'आप में से कोई भी पुष्टि करेगा']} icon={<Shield />} on={pickup === 'guard'} onPress={() => setPickup('guard')} />
      <Lbl p={['Address', 'पता']} />
      <Field value={address} onChangeText={setAddress} />
      <Lbl p={['Area shown to others', 'दूसरों को दिखने वाला इलाका']} />
      <Field value={area} onChangeText={setArea} />
    </Screen>
  );
}
