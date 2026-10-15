import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import * as DocumentPicker from 'expo-document-picker';
import { Redirect, router } from 'expo-router';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Pressable, View } from 'react-native';
import { z } from 'zod';

import { registerNgo, updateNgo, uploadCertificate, useMyNgo } from '@/api/hooks';
import { errorPair, type Pair } from '@/i18n';
import { pointFor } from '@/lib/location';
import { useSession } from '@/store/session';
import { C, F } from '@/theme';
import { Upload } from '@/ui/icons';
import { Bi, Btn, Field, FieldError, Lbl, Loading, Note, Screen, T } from '@/ui/kit';

const schema = z.object({
  name: z.string().trim().min(3),
  registration_id: z.string().trim().regex(/^[A-Za-z0-9/\-. ]{4,60}$/),
  contact_name: z.string().trim().min(2),
  contact_phone: z.string().trim().regex(/^(\+?91)?[\s-]?[6-9]\d{4}[\s-]?\d{5}$/),
  address: z.string().trim().min(5),
  area: z.string().trim().min(2),
});
type Form = z.infer<typeof schema>;

const ERR: Record<keyof Form, Pair> = {
  name: ['Enter the NGO’s name.', 'संस्था का नाम लिखें।'],
  registration_id: ['Enter the NGO Darpan ID or registration number.', 'NGO दर्पण ID या रजिस्ट्रेशन नंबर लिखें।'],
  contact_name: ['Enter the contact person’s name.', 'संपर्क व्यक्ति का नाम लिखें।'],
  contact_phone: ['Enter a valid 10-digit mobile number.', 'सही 10 अंकों का मोबाइल नंबर लिखें।'],
  address: ['Enter the NGO’s address.', 'संस्था का पता लिखें।'],
  area: ['Enter the area, like “Sector 7, Rohini”.', 'इलाका लिखें, जैसे “सेक्टर 7, रोहिणी”।'],
};

/** Register (or fix after a rejection). Only NGOs register; donors and collectors never need to. */
export default function RegisterNgo() {
  const signedIn = !!useSession((s) => s.access);
  const user = useSession((s) => s.user);
  const mine = useMyNgo();
  const qc = useQueryClient();
  const [file, setFile] = useState<{ uri: string; name: string; type: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<Pair | null>(null);
  const existing = mine.data ?? null;
  const { control, handleSubmit, formState } = useForm<Form>({
    resolver: zodResolver(schema),
    values: existing
      ? { name: existing.name, registration_id: existing.registration_id, contact_name: existing.contact_name, contact_phone: existing.contact_phone.replace(/^\+91/, ''), address: existing.address, area: existing.area }
      : { name: '', registration_id: '', contact_name: user?.name ?? '', contact_phone: user?.phone.replace(/^\+91/, '') ?? '', address: '', area: user?.area ?? '' },
  });

  if (!signedIn) return <Redirect href={{ pathname: '/verify', params: { next: 'ngo' } }} />;
  if (mine.isLoading) return <Screen title={['Register your NGO', 'अपनी संस्था रजिस्टर करें']}><Loading /></Screen>;

  const pick = async () => {
    const r = await DocumentPicker.getDocumentAsync({ type: ['application/pdf', 'image/jpeg', 'image/png'], copyToCacheDirectory: true });
    if (r.canceled) return;
    const a = r.assets[0];
    if ((a.size ?? 0) > 5 * 1024 * 1024) return setErr(['Files must be 5 MB or smaller.', 'फ़ाइल 5 MB या उससे छोटी हो।']);
    setErr(null);
    setFile({ uri: a.uri, name: a.name, type: a.mimeType ?? 'application/octet-stream' });
  };

  const submit = handleSubmit(async (v) => {
    setBusy(true);
    setErr(null);
    try {
      const pt = await pointFor(v.address);
      const body = { ...v, lat: pt?.lat ?? null, lng: pt?.lng ?? null };
      if (existing) await updateNgo(body);
      else await registerNgo(body);
      if (file) await uploadCertificate(file.uri, file.name, file.type);
      await qc.invalidateQueries({ queryKey: ['me'] });
      router.replace('/ngos/mine');
    } catch (e) {
      setErr(errorPair(e));
    } finally {
      setBusy(false);
    }
  });

  const input = (name: keyof Form, props: Partial<React.ComponentProps<typeof Field>> = {}) => (
    <>
      <Controller control={control} name={name} render={({ field }) => <Field value={field.value} onChangeText={field.onChange} onBlur={field.onBlur} {...props} />} />
      {formState.errors[name] && <FieldError p={ERR[name]} />}
    </>
  );

  return (
    <Screen
      title={existing ? ['Edit NGO details', 'संस्था की जानकारी बदलें'] : ['Register your NGO', 'अपनी संस्था रजिस्टर करें']}
      foot={<><FieldError p={err} /><Btn p={existing ? ['Save changes', 'बदलाव सेव करें'] : ['Register NGO', 'संस्था रजिस्टर करें']} onPress={submit} loading={busy} /></>}
    >
      {!existing && (
        <Note p={['Only NGOs need to register. You can post meal needs straight after registering.', 'सिर्फ़ संस्थाओं को रजिस्टर करना है। रजिस्टर करते ही आप भोजन की ज़रूरत बता सकते हैं।']} />
      )}
      <Lbl p={['NGO name', 'संस्था का नाम']} />
      {input('name', { placeholder: 'Asha Kiran Children’s Home' })}
      <Lbl p={['NGO Darpan ID or registration number', 'NGO दर्पण ID या रजिस्ट्रेशन नंबर']} />
      {input('registration_id', { placeholder: 'DL/2019/0234567', autoCapitalize: 'characters' })}
      <Lbl p={['Registration certificate (optional)', 'रजिस्ट्रेशन प्रमाणपत्र (वैकल्पिक)']} />
      <Pressable onPress={pick} style={({ pressed }) => [upload, pressed && { opacity: 0.8 }]} accessibilityRole="button">
        <Upload />
        <View style={{ flex: 1 }}>
          <Bi
            en={file ? file.name : existing?.has_certificate ? 'Certificate uploaded. Tap to replace' : 'Upload certificate'}
            hi={file ? file.name : existing?.has_certificate ? 'प्रमाणपत्र अपलोड है। बदलने के लिए दबाएँ' : 'प्रमाणपत्र अपलोड करें'}
            style={{ fontFamily: F.bold, color: C.leaf }}
          />
          <T style={{ fontSize: 12.5, color: C.mut }}>PDF or photo · up to 5 MB</T>
        </View>
      </Pressable>
      <Lbl p={['Contact person and number', 'संपर्क व्यक्ति और नंबर']} />
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <View style={{ flex: 1 }}>{input('contact_name', { placeholder: 'Sunil Mehra' })}</View>
        <View style={{ flex: 1 }}>{input('contact_phone', { placeholder: '98730 15123', keyboardType: 'phone-pad' })}</View>
      </View>
      <Lbl p={['Address', 'पता']} />
      {input('address', { placeholder: 'Plot 12, Sector 7, Rohini, Delhi' })}
      <Lbl p={['Area shown to donors', 'दाताओं को दिखने वाला इलाका']} />
      {input('area', { placeholder: 'Sector 7, Rohini' })}
    </Screen>
  );
}

const upload = { flexDirection: 'row' as const, gap: 12, alignItems: 'center' as const, backgroundColor: C.white, borderRadius: 14, padding: 12, borderWidth: 1.5, borderColor: C.line };
