import { zodResolver } from '@hookform/resolvers/zod';
import * as ImagePicker from 'expo-image-picker';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Pressable, View } from 'react-native';
import { z } from 'zod';

import { errorPair, type Pair } from '@/i18n';
import { currentArea } from '@/lib/location';
import { NoLocationError, postDraft } from '@/lib/share';
import { useDraft } from '@/store/draft';
import { useSession } from '@/store/session';
import { C, F } from '@/theme';
import { Camera, Door, Shield } from '@/ui/icons';
import { Bi, Btn, Field, FieldError, Lbl, Opt, Screen, T } from '@/ui/kit';

const schema = z.object({
  address: z.string().trim().min(5, 'address'),
  area: z.string().trim().min(2, 'area'),
});
type Form = z.infer<typeof schema>;

/** Step 2 of 2: hand-over point, address (private until reserved), public area. */
export default function Pickup() {
  const d = useDraft();
  const user = useSession((s) => s.user);
  const signedIn = !!useSession((s) => s.access);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<Pair | null>(null);
  const { control, handleSubmit, setValue, getValues, formState } = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: { address: d.address, area: d.area || user?.area || '' },
  });

  useEffect(() => {
    if (!getValues('area')) currentArea().then((a) => a && !getValues('area') && setValue('area', a));
  }, [getValues, setValue]);

  const pickPhoto = async () => {
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7, allowsEditing: true, aspect: [4, 3] });
    if (!r.canceled) d.set({ photoUri: r.assets[0].uri });
  };

  const submit = handleSubmit(async (v) => {
    d.set({ address: v.address, area: v.area });
    setErr(null);
    if (!signedIn || !user?.name) {
      router.push({ pathname: '/verify', params: { next: 'post' } });
      return;
    }
    setBusy(true);
    try {
      const id = await postDraft();
      router.dismissAll();
      router.replace({ pathname: '/share/posted', params: { id } });
    } catch (e) {
      setErr(
        e instanceof NoLocationError
          ? ['We could not find this place. Turn on location, or add more detail to the address.', 'जगह नहीं मिली। लोकेशन चालू करें या पता और साफ़ लिखें।']
          : errorPair(e),
      );
    } finally {
      setBusy(false);
    }
  });

  return (
    <Screen
      title={['Where to collect', 'कहाँ से लेना है']}
      foot={
        <>
          <FieldError p={err} />
          <Btn p={['Post food', 'खाना पोस्ट करें']} onPress={submit} loading={busy} />
          <T style={{ textAlign: 'center', fontSize: 12, color: C.mut }}>Step 2 of 2</T>
        </>
      }
    >
      <Lbl p={['Where will it be handed over?', 'खाना कहाँ दिया जाएगा?']} />
      <Opt
        p={['At my door', 'मेरे दरवाज़े पर']}
        sub={['They show you a pick-up code', 'वे आपको पिक-अप कोड बताएँगे']}
        icon={<Door />}
        on={d.pickup === 'door'}
        onPress={() => d.set({ pickup: 'door' })}
      />
      <Opt
        p={['With the guard', 'गार्ड के पास']}
        sub={['Either of you confirms it was collected', 'आप में से कोई भी पुष्टि करेगा']}
        icon={<Shield />}
        on={d.pickup === 'guard'}
        onPress={() => d.set({ pickup: 'guard' })}
      />

      <Lbl p={['Address', 'पता']} />
      <Controller
        control={control}
        name="address"
        render={({ field }) => (
          <Field value={field.value} onChangeText={field.onChange} onBlur={field.onBlur} placeholder="Flat 204, Tower B, Shanti Apartments, Sector 15" autoComplete="street-address" />
        )}
      />
      {formState.errors.address && <FieldError p={['Enter the full address.', 'पूरा पता लिखें।']} />}
      <T style={{ fontSize: 12.5, color: C.mut, marginTop: -6 }}>Only the person who reserves sees the full address.</T>

      <Lbl p={['Area shown to others', 'दूसरों को दिखने वाला इलाका']} />
      <Controller
        control={control}
        name="area"
        render={({ field }) => <Field value={field.value} onChangeText={field.onChange} onBlur={field.onBlur} placeholder="Sector 15, Rohini" />}
      />
      {formState.errors.area && <FieldError p={['Add your area, like “Sector 15”.', 'इलाका लिखें, जैसे “सेक्टर 15”।']} />}

      <Lbl p={['Photo (optional)', 'फ़ोटो (वैकल्पिक)']} />
      <Pressable onPress={pickPhoto} style={({ pressed }) => [upload, pressed && { opacity: 0.8 }]} accessibilityRole="button">
        {d.photoUri ? <Image source={{ uri: d.photoUri }} style={{ width: 44, height: 44, borderRadius: 10 }} /> : <Camera />}
        <View style={{ flex: 1 }}>
          <Bi en={d.photoUri ? 'Change photo' : 'Add a photo of the food'} hi={d.photoUri ? 'फ़ोटो बदलें' : 'खाने की फ़ोटो जोड़ें'} style={{ fontFamily: F.bold, color: C.leaf }} />
          <T style={{ fontSize: 12.5, color: C.mut }}>Location data is removed from photos.</T>
        </View>
      </Pressable>
    </Screen>
  );
}

const upload = {
  flexDirection: 'row' as const,
  gap: 12,
  alignItems: 'center' as const,
  backgroundColor: C.white,
  borderRadius: 14,
  padding: 12,
  borderWidth: 1.5,
  borderColor: C.line,
};
