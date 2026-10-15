import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { ApiError } from '@/api/client';
import { requestOtp, useUpdateMe, verifyOtp } from '@/api/hooks';
import { errorPair, type Pair } from '@/i18n';
import { NoLocationError, postDraft } from '@/lib/share';
import { useSession } from '@/store/session';
import { C, F } from '@/theme';
import { Bi, Btn, CodeInput, Field, FieldError, Lbl, LinkBtn, Screen, T, useNow } from '@/ui/kit';

type Next = 'post' | 'reserve' | 'ngo' | 'back';
type Step = 'phone' | 'code' | 'name';

const LEAD: Record<Next, Pair> = {
  post: ['Needed once, on your first post. The person collecting will call this number.', 'सिर्फ़ पहली बार। खाना लेने वाला इसी नंबर पर फ़ोन करेगा।'],
  reserve: ['Needed once. The donor will call this number if they need to reach you.', 'सिर्फ़ एक बार। दाता ज़रूरत पड़ने पर इसी नंबर पर फ़ोन करेंगे।'],
  ngo: ['Sign in with the number of the person who manages the NGO.', 'संस्था संभालने वाले व्यक्ति के नंबर से साइन इन करें।'],
  back: ['No password. We send a code to your phone each time you sign in.', 'कोई पासवर्ड नहीं। हर बार साइन इन पर फ़ोन पर कोड आएगा।'],
};

/** Mobile number + SMS code. Also asks for a name the first time. */
export default function Verify() {
  const params = useLocalSearchParams<{ next?: Next; id?: string }>();
  const next: Next = params.next ?? 'back';
  const session = useSession();
  const updateMe = useUpdateMe();
  const [step, setStep] = useState<Step>(session.access ? 'name' : 'phone');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [name, setName] = useState(session.user?.name ?? '');
  const [devCode, setDevCode] = useState<string | null>(null);
  const [resendAt, setResendAt] = useState(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<Pair | null>(null);
  const now = useNow();
  const wait = Math.max(0, Math.ceil((resendAt - now) / 1000));

  const finish = async () => {
    setBusy(true);
    setErr(null);
    try {
      if (next === 'post') {
        const id = await postDraft();
        router.dismissAll();
        router.replace({ pathname: '/share/posted', params: { id } });
      } else if (next === 'reserve' && params.id) {
        router.replace({ pathname: '/reserve/[id]', params: { id: params.id } });
      } else if (next === 'ngo') {
        router.replace('/ngos/register');
      } else if (router.canGoBack()) router.back();
      else router.replace('/me');
    } catch (e) {
      setErr(
        e instanceof NoLocationError
          ? ['We could not find the address. Go back and add more detail, or turn on location.', 'पता नहीं मिला। वापस जाकर और जानकारी जोड़ें या लोकेशन चालू करें।']
          : errorPair(e),
      );
    } finally {
      setBusy(false);
    }
  };

  const send = async () => {
    setBusy(true);
    setErr(null);
    try {
      const r = await requestOtp(phone);
      setPhone(r.phone);
      setDevCode(r.dev_code ?? null);
      setResendAt(Date.now() + r.resend_after_seconds * 1000);
      setCode('');
      setStep('code');
    } catch (e) {
      if (e instanceof ApiError && e.code === 'validation_error') setErr(['Enter a valid 10-digit mobile number.', 'सही 10 अंकों का मोबाइल नंबर डालें।']);
      else setErr(errorPair(e));
    } finally {
      setBusy(false);
    }
  };

  const check = async () => {
    setBusy(true);
    setErr(null);
    try {
      const pair = await verifyOtp(phone, code);
      await session.signIn(pair);
      if (!pair.user.name) {
        setStep('name');
        setBusy(false);
        return;
      }
      await finish();
    } catch (e) {
      setErr(errorPair(e));
      setBusy(false);
    }
  };

  const saveName = async () => {
    if (name.trim().length < 2) return setErr(['Enter your name.', 'अपना नाम लिखें।']);
    setBusy(true);
    try {
      await updateMe.mutateAsync({ name: name.trim() });
      await finish();
    } catch (e) {
      setErr(errorPair(e));
      setBusy(false);
    }
  };

  const foot =
    step === 'phone' ? (
      <Btn p={['Send code', 'कोड भेजें']} onPress={send} loading={busy} disabled={phone.replace(/\D/g, '').length < 10} />
    ) : step === 'code' ? (
      <Btn
        p={next === 'post' ? ['Verify and post', 'पुष्टि करें और पोस्ट करें'] : ['Verify', 'पुष्टि करें']}
        onPress={check}
        loading={busy}
        disabled={code.length < 6}
      />
    ) : (
      <Btn p={next === 'post' ? ['Save and post', 'सेव करें और पोस्ट करें'] : ['Continue', 'आगे बढ़ें']} onPress={saveName} loading={busy} />
    );

  return (
    <Screen title={step === 'name' ? ['Your name', 'आपका नाम'] : ['Verify your number', 'अपना नंबर पुष्टि करें']} foot={<><FieldError p={err} />{foot}</>}>
      {step !== 'name' ? (
        <>
          <Bi en={LEAD[next][0]} hi={LEAD[next][1]} style={{ fontSize: 15 }} />
          <Lbl p={['Mobile number', 'मोबाइल नंबर']} />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={[{ justifyContent: 'center' }, prefix]}>
              <T style={{ fontFamily: F.semi }}>+91</T>
            </View>
            <Field
              style={{ flex: 1 }}
              value={phone.replace(/^\+91/, '')}
              onChangeText={(t) => setPhone(t.replace(/[^\d ]/g, ''))}
              keyboardType="phone-pad"
              autoComplete="tel"
              textContentType="telephoneNumber"
              placeholder="98110 42345"
              maxLength={12}
              editable={step === 'phone'}
              autoFocus
            />
          </View>
          {step === 'code' && (
            <>
              <Lbl p={['Code sent by SMS', 'SMS से आया कोड']} />
              <CodeInput length={6} value={code} onChange={setCode} autoFocus />
              {devCode && <T style={{ color: C.mut, fontSize: 12.5 }}>Development server code: {devCode}</T>}
              {wait > 0 ? (
                <Bi en={`Didn’t get it? Resend in 0:${String(wait).padStart(2, '0')}`} hi={`नहीं मिला? 0:${String(wait).padStart(2, '0')} में दोबारा भेजें`} style={{ color: C.mut, fontSize: 13.5 }} />
              ) : (
                <LinkBtn p={['Resend code', 'कोड दोबारा भेजें']} onPress={send} />
              )}
              <LinkBtn p={['Change number', 'नंबर बदलें']} onPress={() => setStep('phone')} />
            </>
          )}
        </>
      ) : (
        <>
          <Bi en="What should people call you? Others see your first name and the first letter of your surname." hi="लोग आपको किस नाम से जानें? दूसरों को आपका पहला नाम और उपनाम का पहला अक्षर दिखेगा।" style={{ fontSize: 15 }} />
          <Lbl p={['Full name', 'पूरा नाम']} />
          <Field value={name} onChangeText={setName} placeholder="Meera Sharma" autoComplete="name" textContentType="name" autoFocus maxLength={80} />
        </>
      )}
    </Screen>
  );
}

const prefix = { backgroundColor: C.white, borderRadius: 12, borderWidth: 1.5, borderColor: C.line, paddingHorizontal: 14, minHeight: 48 };
