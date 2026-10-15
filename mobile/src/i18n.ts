import { ApiError } from '@/api/client';
import { usePrefs, type LangMode } from '@/store/prefs';

export type Pair = readonly [en: string, hi: string];

/** Join a pair for places that take a single string (alerts, accessibility labels). */
export function joinPair([en, hi]: Pair, mode: LangMode = usePrefs.getState().lang, sep = '\n'): string {
  if (mode === 'en') return en;
  if (mode === 'hi') return hi;
  return `${en}${sep}${hi}`;
}

const ERRORS: Record<string, Pair> = {
  network: ['No internet connection. Check your data and try again.', 'इंटरनेट नहीं है। डेटा जाँचें और फिर कोशिश करें।'],
  listing_reserved: ['Someone else just reserved this meal.', 'यह भोजन अभी किसी और ने आरक्षित कर लिया।'],
  listing_unavailable: ['This meal is no longer available.', 'यह भोजन अब उपलब्ध नहीं है।'],
  listing_expired: ['This meal has passed its good-until time.', 'इस भोजन का समय पूरा हो गया।'],
  own_listing: ['You posted this food, so you cannot reserve it.', 'यह खाना आपने पोस्ट किया है, इसे आरक्षित नहीं कर सकते।'],
  too_many_reservations: ['Collect or cancel your current reservations first.', 'पहले अपने मौजूदा आरक्षण लें या रद्द करें।'],
  eta_after_good_until: ['Choose a time before the food’s good-until time.', 'खाने के समय से पहले का समय चुनें।'],
  code_wrong: ['That code is not right. Check it with the person collecting.', 'कोड सही नहीं है। लेने वाले से दोबारा पूछें।'],
  code_locked: ['Too many wrong codes. Make the meal available again, or contact Anndaan support.', 'बहुत बार गलत कोड। भोजन फिर से उपलब्ध करें या सहायता से संपर्क करें।'],
  code_expired: ['This pick-up code has expired.', 'यह पिक-अप कोड समाप्त हो गया है।'],
  already_completed: ['This food was already handed over.', 'यह खाना पहले ही दिया जा चुका है।'],
  reservation_closed: ['This reservation is no longer active.', 'यह आरक्षण अब सक्रिय नहीं है।'],
  otp_wrong: ['That code is not right.', 'कोड सही नहीं है।'],
  otp_expired: ['This code has expired. Ask for a new one.', 'कोड समाप्त हो गया। नया कोड मँगाएँ।'],
  otp_too_many_attempts: ['Too many wrong codes. Ask for a new one.', 'बहुत बार गलत कोड। नया कोड मँगाएँ।'],
  otp_resend_wait: ['Wait a few seconds before asking for a new code.', 'नया कोड मँगाने से पहले कुछ सेकंड रुकें।'],
  otp_limit: ['Too many codes for this number. Try again in an hour.', 'इस नंबर के लिए बहुत कोड माँगे गए। एक घंटे बाद कोशिश करें।'],
  sms_failed: ['We could not send the SMS. Try again in a moment.', 'SMS नहीं भेज पाए। थोड़ी देर बाद कोशिश करें।'],
  account_suspended: ['This account is suspended. Contact Anndaan support.', 'यह खाता निलंबित है। अन्नदान सहायता से संपर्क करें।'],
  good_until_too_soon: ['Good-until must be at least 15 minutes from now.', 'समय अभी से कम से कम 15 मिनट बाद का हो।'],
  good_until_too_late: ['Cooked food can be listed for at most 24 hours.', 'पका खाना अधिकतम 24 घंटे के लिए ही पोस्ट हो सकता है।'],
  need_full: ['This day is already fully covered. Try another day.', 'इस दिन की ज़रूरत पूरी हो चुकी है। दूसरा दिन चुनें।'],
  too_many_people: ['That is more people than are still needed that day.', 'उस दिन इतने लोगों की ज़रूरत नहीं बची है।'],
  ngo_exists: ['You have already registered an NGO.', 'आप पहले ही संस्था रजिस्टर कर चुके हैं।'],
  registration_id_taken: ['This registration number is already registered.', 'यह रजिस्ट्रेशन नंबर पहले से दर्ज है।'],
  file_too_large: ['Files must be 5 MB or smaller.', 'फ़ाइल 5 MB या उससे छोटी हो।'],
  unsupported_file: ['Use a PDF, JPEG or PNG file.', 'PDF, JPEG या PNG फ़ाइल चुनें।'],
  rate_limited: ['Too many requests. Wait a minute.', 'बहुत ज़्यादा अनुरोध। एक मिनट रुकें।'],
  forbidden: ['You are not allowed to do this.', 'आप यह नहीं कर सकते।'],
  not_found: ['This is no longer available.', 'यह अब उपलब्ध नहीं है।'],
};

export function errorPair(e: unknown): Pair {
  if (e instanceof ApiError) {
    const known = ERRORS[e.code];
    if (known) return known;
    if (e.status >= 500) return ['Something went wrong on our side. Try again.', 'हमारी तरफ़ से गड़बड़ी हुई। फिर कोशिश करें।'];
    return [e.message, e.message];
  }
  return ['Something went wrong. Try again.', 'कुछ गड़बड़ हुई। फिर कोशिश करें।'];
}

export const FOR_WHOM: Record<string, Pair> = {
  me: ['For me', 'मेरे लिए'],
  family: ['For my family', 'मेरे परिवार के लिए'],
  needy: ['For people in need', 'ज़रूरतमंदों के लिए'],
  animals: ['For bezubaan friends', 'बेज़ुबान साथियों के लिए'],
};

export const FOOD: Record<string, Pair> = { veg: ['Veg meal', 'शाकाहारी भोजन'], nonveg: ['Non-veg meal', 'मांसाहारी भोजन'] };

export const MEAL: Record<string, Pair> = { breakfast: ['Breakfast', 'नाश्ता'], lunch: ['Lunch', 'दोपहर'], dinner: ['Dinner', 'रात'] };

export const FREQ: Record<string, Pair> = {
  once: ['One time', 'एक बार'],
  daily: ['Daily', 'रोज़'],
  weekly: ['Weekly', 'हर हफ़्ते'],
  monthly: ['Monthly', 'हर महीने'],
};

export type ReviewTag = 'fresh' | 'packed_well' | 'on_time' | 'polite' | 'easy_to_find';

export const REVIEW_TAGS: Record<ReviewTag, Pair> = {
  fresh: ['Fresh food', 'ताज़ा खाना'],
  packed_well: ['Packed well', 'अच्छी पैकिंग'],
  on_time: ['On time', 'समय पर'],
  polite: ['Polite', 'विनम्र'],
  easy_to_find: ['Easy to find', 'आसानी से मिला'],
};
