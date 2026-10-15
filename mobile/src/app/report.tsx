import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { sendReport } from '@/api/hooks';
import type { ReportIn } from '@/api/types';
import { errorPair, type Pair } from '@/i18n';
import { C } from '@/theme';
import { Bi, Btn, Empty, Field, FieldError, Lbl, Opt, Screen } from '@/ui/kit';

type Reason = ReportIn['reason'];

const REASONS: { v: Reason; p: Pair }[] = [
  { v: 'unsafe_food', p: ['Food seemed unsafe or spoiled', 'खाना ख़राब या असुरक्षित लगा'] },
  { v: 'not_as_described', p: ['Not as described', 'जैसा बताया था वैसा नहीं'] },
  { v: 'no_show', p: ['Did not turn up', 'नहीं आए'] },
  { v: 'abusive', p: ['Rude or abusive', 'बदतमीज़ी या दुर्व्यवहार'] },
  { v: 'fake', p: ['Fake post or person', 'नकली पोस्ट या व्यक्ति'] },
  { v: 'other', p: ['Something else', 'कुछ और'] },
];

export default function Report() {
  const { listing, user } = useLocalSearchParams<{ listing?: string; user?: string }>();
  const [reason, setReason] = useState<Reason>('unsafe_food');
  const [details, setDetails] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<Pair | null>(null);
  const [sent, setSent] = useState(false);

  const submit = async () => {
    setBusy(true);
    setErr(null);
    try {
      await sendReport({ listing_id: listing ?? null, user_id: user ?? null, reason, details: details.trim() || null });
      setSent(true);
    } catch (e) {
      setErr(errorPair(e));
    } finally {
      setBusy(false);
    }
  };

  if (sent)
    return (
      <Screen title={['Report sent', 'शिकायत भेजी गई']} foot={<Btn p={['Done', 'ठीक है']} onPress={() => router.back()} />}>
        <Empty title={['Thank you for telling us', 'बताने के लिए धन्यवाद']} body={['The Anndaan team reviews every report.', 'अन्नदान टीम हर शिकायत देखती है।']} />
      </Screen>
    );

  return (
    <Screen
      title={listing ? ['Report this food', 'इस खाने की शिकायत'] : ['Report this person', 'इस व्यक्ति की शिकायत']}
      foot={<><FieldError p={err} /><Btn p={['Send report', 'शिकायत भेजें']} onPress={submit} loading={busy} /></>}
    >
      <Bi
        en="If someone is unwell after eating, get medical help first."
        hi="अगर किसी की खाने के बाद तबीयत बिगड़े, तो पहले डॉक्टर से मदद लें।"
        style={{ color: C.danger, fontSize: 14 }}
      />
      <Lbl p={['What happened?', 'क्या हुआ?']} />
      <View style={{ gap: 8 }}>
        {REASONS.map((r) => (
          <Opt key={r.v} p={r.p} on={reason === r.v} onPress={() => setReason(r.v)} />
        ))}
      </View>
      <Lbl p={['Details (optional)', 'जानकारी (वैकल्पिक)']} />
      <Field multiline value={details} onChangeText={setDetails} maxLength={1000} />
    </Screen>
  );
}
