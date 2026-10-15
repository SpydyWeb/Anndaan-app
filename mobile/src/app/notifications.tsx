import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { View } from 'react-native';

import { keys, markAllRead, useNotifications } from '@/api/hooks';
import { ago } from '@/lib/format';
import { routeForNotification } from '@/lib/push';
import { C, F } from '@/theme';
import { Bi, Card, Empty, ErrorState, Loading, Screen, T } from '@/ui/kit';

export default function Notifications() {
  const q = useNotifications();
  const qc = useQueryClient();

  useEffect(() => {
    if (q.data?.items.some((n) => !n.read_at)) {
      markAllRead().then(() => qc.invalidateQueries({ queryKey: keys.unread }));
    }
  }, [q.data, qc]);

  return (
    <Screen title={['Notifications', 'सूचनाएँ']} refreshing={q.isRefetching} onRefresh={() => q.refetch()}>
      {q.isLoading ? (
        <Loading />
      ) : q.error ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : !q.data?.items.length ? (
        <Empty title={['Nothing yet', 'अभी कुछ नहीं']} body={['Reservations, hand-overs and NGO updates show up here.', 'आरक्षण, खाना पहुँचना और संस्था की खबरें यहाँ दिखेंगी।']} />
      ) : (
        q.data.items.map((n) => (
          <Card key={n.id} onPress={() => routeForNotification(n.data as Record<string, unknown>)} style={!n.read_at ? { borderColor: C.leaf } : undefined}>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <View style={{ flex: 1 }}>
                <Bi en={n.title_en} hi={n.title_hi} style={{ fontFamily: F.bold, color: C.leaf, fontSize: 15 }} />
              </View>
              <T style={{ color: C.mut, fontSize: 12 }}>{ago(n.created_at)[0]}</T>
            </View>
            <Bi en={n.body_en} hi={n.body_hi} style={{ fontSize: 14 }} />
          </Card>
        ))
      )}
    </Screen>
  );
}
