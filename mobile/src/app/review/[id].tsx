import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { useReservation, useReservationAction } from '@/api/hooks';
import { errorPair, REVIEW_TAGS } from '@/i18n';
import { firstName, initials } from '@/lib/format';
import { C, F } from '@/theme';
import { Star } from '@/ui/icons';
import { Avatar, Bi, Btn, Chip, Chips, ErrorState, Field, FieldError, Lbl, Loading, Screen } from '@/ui/kit';

type Tag = keyof typeof REVIEW_TAGS;

export default function ReviewScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const q = useReservation(id, false);
  const { review } = useReservationAction();
  const [stars, setStars] = useState(0);
  const [tags, setTags] = useState<Tag[]>([]);
  const [comment, setComment] = useState('');
  const r = q.data;

  if (q.isLoading) return <Screen title={['Leave a review', 'समीक्षा लिखें']}><Loading /></Screen>;
  if (!r) return <Screen title={['Leave a review', 'समीक्षा लिखें']}><ErrorState error={q.error} onRetry={() => q.refetch()} /></Screen>;

  const other = r.role === 'collector' ? r.donor : r.collector;
  const otherName = other?.name ?? r.listing.donor.display_name;
  const fn = firstName(otherName);
  const subjectId = r.role === 'collector' ? r.listing.donor.id : other?.id;

  const toggle = (t: Tag) => setTags((cur) => (cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t]));
  const post = () =>
    review.mutate(
      { id, body: { stars, tags, comment: comment.trim() || null } },
      { onSuccess: () => (subjectId ? router.replace({ pathname: '/profile/[id]', params: { id: subjectId } }) : router.replace('/home')) },
    );

  return (
    <Screen
      title={['Leave a review', 'समीक्षा लिखें']}
      foot={
        <>
          {review.error && <FieldError p={errorPair(review.error)} />}
          <Btn p={['Post review', 'समीक्षा पोस्ट करें']} onPress={post} loading={review.isPending} disabled={stars === 0 || !r.can_review} />
        </>
      }
    >
      <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
        <Avatar text={initials(otherName)} />
        <View style={{ flex: 1 }}>
          <Bi en={`How was it with ${fn}?`} hi={`${fn} जी के साथ अनुभव कैसा रहा?`} style={{ fontFamily: F.display, fontSize: 18, lineHeight: 23, color: C.leaf }} hiStyle={{ fontFamily: F.medium, fontSize: 13 }} />
        </View>
      </View>
      <View style={{ flexDirection: 'row', gap: 4 }} accessibilityRole="adjustable" accessibilityValue={{ min: 0, max: 5, now: stars }}>
        {[1, 2, 3, 4, 5].map((i) => (
          <Pressable key={i} onPress={() => setStars(i)} hitSlop={4} accessibilityRole="button" accessibilityLabel={`${i} star${i > 1 ? 's' : ''}`}>
            <Star size={42} filled={i <= stars} />
          </Pressable>
        ))}
      </View>
      <Lbl p={['What went well?', 'क्या अच्छा लगा?']} />
      <Chips>
        {(Object.keys(REVIEW_TAGS) as Tag[])
          .filter((t) => r.role === 'collector' || t !== 'packed_well')
          .map((t) => (
            <Chip key={t} tight p={REVIEW_TAGS[t]} on={tags.includes(t)} onPress={() => toggle(t)} />
          ))}
      </Chips>
      <Lbl p={['Add a few words (optional)', 'कुछ शब्द लिखें (वैकल्पिक)']} />
      <Field multiline value={comment} onChangeText={setComment} maxLength={500} placeholder="Food was fresh and still warm." />
      <Bi
        en={`Your review is shown on ${fn}’s profile with your first name.`}
        hi={`आपकी समीक्षा आपके पहले नाम के साथ ${fn} जी की प्रोफ़ाइल पर दिखेगी।`}
        style={{ color: C.mut, fontSize: 13.5 }}
      />
    </Screen>
  );
}
