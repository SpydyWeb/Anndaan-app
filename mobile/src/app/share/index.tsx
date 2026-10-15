import { router } from 'expo-router';
import { useEffect } from 'react';
import { View } from 'react-native';

import { time12 } from '@/lib/format';
import { tonight, tonightAvailable, useDraft } from '@/store/draft';
import { C } from '@/theme';
import { FoodMark } from '@/ui/icons';
import { Btn, Chip, Chips, Lbl, Note, Screen, Stepper, T } from '@/ui/kit';

/** Step 1 of 2: what food, for how many, good until when. No dish list, by design. */
export default function ShareFood() {
  const d = useDraft();
  const canTonight = tonightAvailable();
  const { until, set } = d;
  useEffect(() => {
    if (until === 'tonight' && !canTonight) set({ until: '4h' });
  }, [until, canTonight, set]);

  return (
    <Screen
      title={['Share food', 'खाना बाँटें']}
      foot={
        <>
          <Btn p={['Next: where to collect', 'आगे: कहाँ से लेना है']} onPress={() => router.push('/share/pickup')} />
          <T style={{ textAlign: 'center', fontSize: 12, color: C.mut }}>Step 1 of 2</T>
        </>
      }
    >
      <Note p={['Cooked meals only. No packets, raw food or groceries.', 'सिर्फ़ पका हुआ खाना। पैकेट, कच्चा अनाज या राशन नहीं।']} />

      <Lbl p={['What food?', 'कौन-सा खाना?']} />
      <Chips>
        <Chip big p={['Veg', 'शाकाहारी']} icon={<FoodMark type="veg" />} on={d.foodType === 'veg'} onPress={() => d.set({ foodType: 'veg' })} />
        <Chip big p={['Non-veg', 'मांसाहारी']} icon={<FoodMark type="nonveg" />} on={d.foodType === 'nonveg'} onPress={() => d.set({ foodType: 'nonveg' })} />
      </Chips>

      <Lbl p={['For how many people?', 'कितने लोगों के लिए?']} />
      <Stepper value={d.servings} onChange={(v) => d.set({ servings: v })} min={1} max={500} unit={['people', 'लोग']} />

      <Lbl p={['Good until', 'कब तक ठीक रहेगा?']} />
      <Chips>
        <Chip p={['2 hours', '2 घंटे']} on={d.until === '2h'} onPress={() => d.set({ until: '2h' })} />
        <Chip p={['4 hours', '4 घंटे']} on={d.until === '4h'} onPress={() => d.set({ until: '4h' })} />
        <Chip
          p={['Tonight', 'आज रात तक']}
          sub={canTonight ? time12(tonight()) : undefined}
          disabled={!canTonight}
          on={d.until === 'tonight'}
          onPress={() => d.set({ until: 'tonight' })}
        />
      </Chips>

      <Lbl p={['When was it cooked?', 'कब पकाया गया?']} />
      <Chips>
        <Chip tight p={['Just now', 'अभी']} on={d.cooked === 'now'} onPress={() => d.set({ cooked: 'now' })} />
        <Chip tight p={['1–2 hours ago', '1–2 घंटे पहले']} on={d.cooked === 'recent'} onPress={() => d.set({ cooked: 'recent' })} />
        <Chip tight p={['Earlier today', 'आज पहले']} on={d.cooked === 'earlier'} onPress={() => d.set({ cooked: 'earlier' })} />
      </Chips>
      <View style={{ height: 4 }} />
      <T style={{ fontSize: 12.5, color: C.mut }}>
        Share only food you would serve at home. “Good until” is your estimate, not a safety guarantee.
      </T>
    </Screen>
  );
}
