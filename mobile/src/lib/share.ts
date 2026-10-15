import { createListing, uploadFoodPhoto } from '@/api/hooks';
import { cookedDate, untilDate, useDraft } from '@/store/draft';

import { pointFor } from './location';

export class NoLocationError extends Error {}

/** Post the current draft. Returns the new listing id. */
export async function postDraft(): Promise<string> {
  const d = useDraft.getState();
  const pt = await pointFor(d.address);
  if (!pt) throw new NoLocationError('location');
  const listing = await createListing({
    food_type: d.foodType,
    servings: d.servings,
    good_until: untilDate(d.until).toISOString(),
    cooked_at: cookedDate(d.cooked).toISOString(),
    pickup_method: d.pickup,
    address: d.address.trim(),
    area: d.area.trim(),
    lat: pt.lat,
    lng: pt.lng,
  });
  if (d.photoUri) {
    // The post is live even if the optional photo fails; don't block on it.
    await uploadFoodPhoto(listing.id, d.photoUri).catch(() => undefined);
  }
  d.reset();
  return listing.id;
}
