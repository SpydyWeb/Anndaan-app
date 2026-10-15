import { Redirect } from 'expo-router';

import { usePrefs } from '@/store/prefs';

export default function Index() {
  const seen = usePrefs((s) => s.welcomeSeen);
  return <Redirect href={seen ? '/home' : '/welcome'} />;
}
