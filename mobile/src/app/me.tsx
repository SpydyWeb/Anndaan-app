import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, View } from 'react-native';

import {
  logout,
  useMe,
  useMyListings,
  useMyPledges,
  useMyReservations,
  useStats,
  useUnread,
  useUpdateMe,
} from '@/api/hooks';
import { errorPair, FOOD, joinPair, type Pair } from '@/i18n';
import { dayMonth, initials, prettyPhone, time12 } from '@/lib/format';
import { usePrefs, type LangMode } from '@/store/prefs';
import { useSession } from '@/store/session';
import { C, F } from '@/theme';
import { Bell, People, Pot } from '@/ui/icons';
import { Avatar, Bi, Btn, Chip, Chips, Facts, Field, FieldError, InfoRow, Lbl, LinkBtn, Screen, T, Tag } from '@/ui/kit';

const STATUS: Record<string, Pair> = {
  completed: ['Collected', 'ले लिया'],
  cancelled_by_collector: ['You cancelled', 'आपने रद्द किया'],
  cancelled_by_donor: ['Donor relisted', 'दाता ने फिर से उपलब्ध किया'],
  expired: ['Ended', 'समाप्त'],
  active: ['Reserved', 'आरक्षित'],
};

function Section({ p }: { p: Pair }) {
  return (
    <View style={{ marginTop: 10 }}>
      <Bi en={p[0]} hi={p[1]} style={{ fontFamily: F.display, fontSize: 19, lineHeight: 24, color: C.leaf }} hiStyle={{ fontFamily: F.medium, fontSize: 13, color: C.mut, opacity: 1 }} />
    </View>
  );
}

/** Everything about "me": impact, my food, my pick-ups, NGO, language, sign out. */
export default function Me() {
  const signedIn = !!useSession((s) => s.access);
  const user = useSession((s) => s.user);
  const lang = usePrefs((s) => s.lang);
  const setLang = usePrefs((s) => s.setLang);
  const me = useMe();
  const stats = useStats();
  const open = useMyListings('open');
  const past = useMyListings('closed');
  const active = useMyReservations('active');
  const history = useMyReservations('history');
  const pledges = useMyPledges();
  const unread = useUnread();
  const updateMe = useUpdateMe();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [area, setArea] = useState('');

  const langPicker = (
    <>
      <Section p={['Language', 'भाषा']} />
      <Chips>
        {(
          [
            ['both', ['English + हिन्दी', 'English + हिन्दी']],
            ['en', ['English', 'English']],
            ['hi', ['हिन्दी', 'हिन्दी']],
          ] as [LangMode, Pair][]
        ).map(([v, p]) => (
          <Chip
            key={v}
            tight
            p={p}
            on={lang === v}
            onPress={() => {
              setLang(v);
              if (signedIn) updateMe.mutate({ language: v });
            }}
          />
        ))}
      </Chips>
    </>
  );

  if (!signedIn || !user) {
    return (
      <Screen title={['My account', 'मेरा खाता']}>
        <Bi
          en="You can find food without an account. Verify your number to share food, reserve a meal or register an NGO."
          hi="खाना खोजने के लिए खाता ज़रूरी नहीं। खाना बाँटने, भोजन आरक्षित करने या संस्था रजिस्टर करने के लिए नंबर पुष्टि करें।"
          style={{ fontSize: 15 }}
        />
        <Btn p={['Verify my number', 'मेरा नंबर पुष्टि करें']} onPress={() => router.push('/verify')} />
        {langPicker}
      </Screen>
    );
  }

  const s = stats.data;
  const refresh = () => Promise.all([me.refetch(), stats.refetch(), open.refetch(), active.refetch(), history.refetch(), past.refetch(), pledges.refetch()]);
  const ngo = me.data?.ngo ?? user.ngo;

  const save = () =>
    updateMe.mutate(
      { name: name.trim() || undefined, area: area.trim() || undefined },
      { onSuccess: () => setEditing(false) },
    );

  const signOut = () =>
    Alert.alert(joinPair(['Sign out?', 'साइन आउट करें?']), undefined, [
      { text: joinPair(['Stay', 'रहने दें'], undefined, ' / '), style: 'cancel' },
      { text: joinPair(['Sign out', 'साइन आउट'], undefined, ' / '), style: 'destructive', onPress: () => logout().then(() => router.replace('/home')) },
    ]);

  return (
    <Screen
      title={['My account', 'मेरा खाता']}
      refreshing={me.isRefetching}
      onRefresh={refresh}
      right={
        <View>
          <LinkBtn p={['Notifications', 'सूचनाएँ']} onPress={() => router.push('/notifications')} />
        </View>
      }
    >
      <View style={{ flexDirection: 'row', gap: 14, alignItems: 'center' }}>
        <Avatar big text={initials(user.name)} />
        <View style={{ flex: 1 }}>
          <T style={{ fontFamily: F.display, fontSize: 22, lineHeight: 28, color: C.leaf }}>{user.name ?? 'Add your name'}</T>
          <T style={{ color: C.mut, fontSize: 13 }}>
            {prettyPhone(user.phone)}
            {user.area ? ` · ${user.area}` : ''}
          </T>
        </View>
      </View>
      {editing ? (
        <View style={{ gap: 8 }}>
          <Lbl p={['Full name', 'पूरा नाम']} />
          <Field value={name} onChangeText={setName} maxLength={80} />
          <Lbl p={['Your area', 'आपका इलाका']} />
          <Field value={area} onChangeText={setArea} placeholder="Sector 15, Rohini" maxLength={120} />
          {updateMe.error && <FieldError p={errorPair(updateMe.error)} />}
          <Btn p={['Save', 'सेव करें']} onPress={save} loading={updateMe.isPending} />
        </View>
      ) : (
        <View style={{ flexDirection: 'row', gap: 16 }}>
          <LinkBtn
            p={['Edit profile', 'प्रोफ़ाइल बदलें']}
            onPress={() => {
              setName(user.name ?? '');
              setArea(user.area ?? '');
              setEditing(true);
            }}
          />
          <LinkBtn p={['See public profile', 'सार्वजनिक प्रोफ़ाइल']} onPress={() => router.push({ pathname: '/profile/[id]', params: { id: user.id } })} />
        </View>
      )}

      {(unread.data?.unread ?? 0) > 0 && (
        <InfoRow
          tint
          icon={<Bell />}
          title={[`${unread.data!.unread} new notifications`, `${unread.data!.unread} नई सूचनाएँ`]}
          onPress={() => router.push('/notifications')}
          right={<T style={{ fontSize: 24, color: C.mut }}>›</T>}
        />
      )}

      <Section p={['Your impact', 'आपका योगदान']} />
      <Facts
        items={[
          { p: ['Meals shared', 'भोजन बाँटे'], value: String(s?.meals_shared ?? '–') },
          { p: ['People fed', 'लोगों ने खाया'], value: String(s?.people_fed ?? '–') },
          { p: ['Collected', 'भोजन लिया'], value: String(s?.meals_collected ?? '–') },
        ]}
      />

      {(active.data?.items.length ?? 0) > 0 && (
        <>
          <Section p={['To collect', 'लेना है']} />
          {active.data!.items.map((r) => (
            <InfoRow
              key={r.id}
              icon={<Pot size={24} />}
              title={[`${FOOD[r.listing.food_type][0]} · ${r.listing.servings} people`, `${FOOD[r.listing.food_type][1]} · ${r.listing.servings} लोग`]}
              sub={`Before ${time12(r.listing.good_until)} · ${r.listing.area}`}
              right={<T style={{ fontSize: 24, color: C.mut }}>›</T>}
              onPress={() => router.push({ pathname: '/reservation/[id]', params: { id: r.id } })}
            />
          ))}
        </>
      )}

      <Section p={['My posted food', 'मेरा पोस्ट किया खाना']} />
      {(open.data?.items.length ?? 0) === 0 ? (
        <Btn kind="sec" p={['Share food', 'खाना बाँटें']} onPress={() => router.push('/share')} />
      ) : (
        open.data!.items.map((m) => (
          <InfoRow
            key={m.listing.id}
            icon={<Pot size={24} />}
            title={[`${FOOD[m.listing.food_type][0]} · ${m.listing.servings} people`, `${FOOD[m.listing.food_type][1]} · ${m.listing.servings} लोग`]}
            sub={m.active_reservation ? `Reserved by ${m.active_reservation.collector?.name ?? 'someone'}` : `Available until ${time12(m.listing.good_until)}`}
            right={<Tag p={m.active_reservation ? ['Reserved', 'आरक्षित'] : ['Available', 'उपलब्ध']} kind={m.active_reservation ? 'res' : 'ok'} />}
            onPress={() => router.push({ pathname: '/my-food/[id]', params: { id: m.listing.id } })}
          />
        ))
      )}

      <Section p={['NGO', 'संस्था']} />
      {ngo ? (
        <InfoRow
          icon={<People size={24} color={C.leaf} />}
          title={[ngo.name, ngo.name]}
          sub={ngo.status === 'rejected' ? 'Paused by Anndaan support' : 'Registered NGO · can post meal needs'}
          right={<T style={{ fontSize: 24, color: C.mut }}>›</T>}
          onPress={() => router.push('/ngos/mine')}
        />
      ) : (
        <LinkBtn p={['Are you an NGO? Register to post meal needs', 'क्या आप संस्था हैं? ज़रूरत बताने के लिए रजिस्टर करें']} onPress={() => router.push('/ngos/register')} />
      )}

      {(pledges.data?.items.length ?? 0) > 0 && (
        <>
          <Section p={['Meals I gave to NGOs', 'संस्थाओं को दिया भोजन']} />
          {pledges.data!.items.slice(0, 10).map((p) => (
            <InfoRow
              key={p.id}
              icon={<People size={24} color={C.leaf} />}
              title={[`${p.need.ngo.name}`, `${p.need.ngo.name}`]}
              sub={`${p.people} people · ${dayMonth(p.for_date)[0]} · ${p.status === 'cancelled' ? 'cancelled' : p.status === 'received' ? 'received' : 'promised'}`}
              onPress={() => router.push({ pathname: '/ngos/thanks/[id]', params: { id: p.id } })}
            />
          ))}
        </>
      )}

      {((history.data?.items.length ?? 0) > 0 || (past.data?.items.length ?? 0) > 0) && <Section p={['History', 'पुराना']} />}
      {history.data?.items.map((r) => (
        <InfoRow
          key={r.id}
          icon={<Pot size={24} />}
          title={[`Collected: ${FOOD[r.listing.food_type][0]}`, `लिया: ${FOOD[r.listing.food_type][1]}`]}
          sub={`${dayMonth(r.created_at.slice(0, 10))[0]} · ${r.listing.servings} people · ${STATUS[r.status][0]}`}
          onPress={() => router.push(r.can_review ? { pathname: '/review/[id]', params: { id: r.id } } : { pathname: '/reservation/[id]', params: { id: r.id } })}
          right={r.can_review ? <T style={{ color: C.leaf, fontFamily: F.bold, fontSize: 13 }}>Review</T> : undefined}
        />
      ))}
      {past.data?.items.map((m) => (
        <InfoRow
          key={m.listing.id}
          icon={<Pot size={24} />}
          title={[`Shared: ${FOOD[m.listing.food_type][0]}`, `बाँटा: ${FOOD[m.listing.food_type][1]}`]}
          sub={`${dayMonth(m.listing.created_at.slice(0, 10))[0]} · ${m.listing.servings} people · ${m.listing.status}`}
          onPress={() => router.push({ pathname: '/my-food/[id]', params: { id: m.listing.id } })}
        />
      ))}

      {langPicker}
      <View style={{ height: 8 }} />
      <Btn kind="danger" p={['Sign out', 'साइन आउट']} onPress={signOut} />
    </Screen>
  );
}
