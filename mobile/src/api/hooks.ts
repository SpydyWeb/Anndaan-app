import { useMutation, useQuery, useQueryClient, type QueryKey } from '@tanstack/react-query';

import { inIndia } from '@/lib/location';
import { useSession } from '@/store/session';

import { api, fileForm } from './client';
import type {
  ImpactStats,
  ListingCreateIn,
  ListingDetail,
  ListingNearby,
  ListingUpdateIn,
  Me,
  MyListing,
  NeedCard,
  NeedDetail,
  NeedIn,
  NgoOut,
  NgoRegisterIn,
  Notification,
  OtpRequestOut,
  Page,
  Pledge,
  PledgeIn,
  PublicProfile,
  ReportIn,
  Reservation,
  ReservationCreateIn,
  Review,
  ReviewIn,
  TokenPair,
} from './types';

export const keys = {
  nearby: (lat?: number, lng?: number, food?: string) => ['nearby', lat, lng, food] as QueryKey,
  listing: (id: string) => ['listing', id] as QueryKey,
  reservation: (id: string) => ['reservation', id] as QueryKey,
  myListings: (state: string) => ['me', 'listings', state] as QueryKey,
  myReservations: (state: string) => ['me', 'reservations', state] as QueryKey,
  myPledges: ['me', 'pledges'] as QueryKey,
  stats: ['me', 'stats'] as QueryKey,
  me: ['me', 'profile'] as QueryKey,
  notifications: ['me', 'notifications'] as QueryKey,
  unread: ['me', 'unread'] as QueryKey,
  profile: (id: string) => ['profile', id] as QueryKey,
  needs: (lat?: number, lng?: number) => ['needs', lat, lng] as QueryKey,
  need: (id: string) => ['need', id] as QueryKey,
  myNgo: ['me', 'ngo'] as QueryKey,
  myNeeds: ['me', 'ngo', 'needs'] as QueryKey,
  ngoPledges: (upcoming: boolean) => ['me', 'ngo', 'pledges', upcoming] as QueryKey,
  pledge: (id: string) => ['pledge', id] as QueryKey,
};

const signedIn = () => !!useSession.getState().access;

// ---------- auth ----------

export const requestOtp = (phone: string) => api<OtpRequestOut>('/auth/otp/request', { body: { phone }, auth: false });
export const verifyOtp = (phone: string, code: string) =>
  api<TokenPair>('/auth/otp/verify', { body: { phone, code }, auth: false });

export async function logout() {
  const { refresh, signOut } = useSession.getState();
  if (refresh) await api('/auth/logout', { body: { refresh_token: refresh }, auth: false }).catch(() => undefined);
  await signOut();
}

export function useUpdateMe() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { name?: string; area?: string; language?: 'both' | 'en' | 'hi' }) =>
      api<Me>('/me', { method: 'PATCH', body }),
    onSuccess: async (me) => {
      await useSession.getState().setUser(me);
      qc.invalidateQueries({ queryKey: ['me'] });
    },
  });
}

export function useMe() {
  const access = useSession((s) => s.access);
  return useQuery({
    queryKey: keys.me,
    queryFn: async () => {
      const me = await api<Me>('/me');
      await useSession.getState().setUser(me);
      return me;
    },
    enabled: !!access,
  });
}

export function useStats() {
  const access = useSession((s) => s.access);
  return useQuery({ queryKey: keys.stats, queryFn: () => api<ImpactStats>('/me/stats'), enabled: !!access });
}

// ---------- food ----------

export function useNearby(lat: number | undefined, lng: number | undefined, foodType?: 'veg' | 'nonveg') {
  return useQuery({
    queryKey: keys.nearby(lat, lng, foodType),
    queryFn: () => api<ListingNearby>('/listings/nearby', { query: { lat, lng, food_type: foodType, limit: 50 } }),
    // The API serves India only; don't send it a point it will reject.
    enabled: lat !== undefined && lng !== undefined && inIndia(lat, lng),
    refetchInterval: 30_000,
  });
}

export function useListing(id: string, lat?: number, lng?: number, pollMs?: number) {
  const access = useSession((s) => s.access);
  return useQuery({
    queryKey: [...keys.listing(id), lat, lng, !!access],
    queryFn: () => api<ListingDetail>(`/listings/${id}`, { query: { lat, lng } }),
    refetchInterval: (q) => (pollMs && ['available', 'reserved'].includes(q.state.data?.status ?? '') ? pollMs : false),
  });
}

export const createListing = (body: ListingCreateIn) => api<ListingDetail>('/listings', { body });
export const uploadFoodPhoto = (id: string, uri: string) =>
  api(`/listings/${id}/images`, { form: fileForm(uri, 'food.jpg', 'image/jpeg') });

export function useListingAction() {
  const qc = useQueryClient();
  const done = () => {
    qc.invalidateQueries({ queryKey: ['listing'] });
    qc.invalidateQueries({ queryKey: ['me'] });
    qc.invalidateQueries({ queryKey: ['nearby'] });
    qc.invalidateQueries({ queryKey: ['reservation'] });
  };
  return {
    update: useMutation({
      mutationFn: ({ id, body }: { id: string; body: ListingUpdateIn }) =>
        api<ListingDetail>(`/listings/${id}`, { method: 'PATCH', body }),
      onSuccess: done,
    }),
    cancel: useMutation({ mutationFn: (id: string) => api<ListingDetail>(`/listings/${id}/cancel`, { method: 'POST' }), onSuccess: done }),
    reactivate: useMutation({
      mutationFn: ({ id, good_until }: { id: string; good_until?: string }) =>
        api<ListingDetail>(`/listings/${id}/reactivate`, { body: good_until ? { good_until } : {} }),
      onSuccess: done,
    }),
    photo: useMutation({ mutationFn: ({ id, uri }: { id: string; uri: string }) => uploadFoodPhoto(id, uri), onSuccess: done }),
  };
}

export function useMyListings(state: 'open' | 'closed' | 'all') {
  const access = useSession((s) => s.access);
  return useQuery({
    queryKey: keys.myListings(state),
    queryFn: () => api<Page<MyListing>>('/me/listings', { query: { state, limit: 50 } }),
    enabled: !!access,
    refetchInterval: state === 'open' ? 15_000 : false,
  });
}

// ---------- reservations ----------

export function useReserve() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ listingId, body }: { listingId: string; body: ReservationCreateIn }) =>
      api<Reservation>(`/listings/${listingId}/reservations`, { body }),
    onSuccess: (res) => {
      qc.setQueryData(keys.reservation(res.id), res);
      qc.invalidateQueries({ queryKey: ['nearby'] });
      qc.invalidateQueries({ queryKey: ['listing'] });
      qc.invalidateQueries({ queryKey: ['me'] });
    },
  });
}

export function useReservation(id: string, poll = true) {
  return useQuery({
    queryKey: keys.reservation(id),
    queryFn: () => api<Reservation>(`/reservations/${id}`),
    enabled: signedIn() && !!id,
    refetchInterval: (q) => (poll && q.state.data?.status === 'active' ? 5000 : false),
  });
}

export function useReservationAction() {
  const qc = useQueryClient();
  const done = (res: Reservation) => {
    qc.setQueryData(keys.reservation(res.id), res);
    qc.invalidateQueries({ queryKey: ['me'] });
    qc.invalidateQueries({ queryKey: ['nearby'] });
    qc.invalidateQueries({ queryKey: ['listing'] });
  };
  return {
    cancel: useMutation({ mutationFn: (id: string) => api<Reservation>(`/reservations/${id}/cancel`, { method: 'POST' }), onSuccess: done }),
    verifyCode: useMutation({
      mutationFn: ({ id, code }: { id: string; code: string }) => api<Reservation>(`/reservations/${id}/verify-code`, { body: { code } }),
      onSuccess: done,
      onError: () => qc.invalidateQueries({ queryKey: ['me', 'listings'] }),
    }),
    confirm: useMutation({
      mutationFn: (id: string) => api<Reservation>(`/reservations/${id}/confirm-collected`, { method: 'POST' }),
      onSuccess: done,
    }),
    review: useMutation({
      mutationFn: ({ id, body }: { id: string; body: ReviewIn }) => api<Review>(`/reservations/${id}/review`, { body }),
      onSuccess: () => qc.invalidateQueries({ queryKey: ['reservation'] }).then(() => qc.invalidateQueries({ queryKey: ['profile'] })),
    }),
  };
}

export function useMyReservations(state: 'active' | 'history' | 'all') {
  const access = useSession((s) => s.access);
  return useQuery({
    queryKey: keys.myReservations(state),
    queryFn: () => api<Page<Reservation>>('/me/reservations', { query: { state, limit: 50 } }),
    enabled: !!access,
    refetchInterval: state === 'active' ? 15_000 : false,
  });
}

// ---------- profiles, reports, notifications ----------

export function useProfile(id: string) {
  return useQuery({ queryKey: keys.profile(id), queryFn: () => api<PublicProfile>(`/users/${id}/profile`) });
}

export const sendReport = (body: ReportIn) => api('/reports', { body });

export function useNotifications() {
  const access = useSession((s) => s.access);
  return useQuery({
    queryKey: keys.notifications,
    queryFn: () => api<Page<Notification>>('/notifications', { query: { limit: 50 } }),
    enabled: !!access,
  });
}

export function useUnread() {
  const access = useSession((s) => s.access);
  return useQuery({
    queryKey: keys.unread,
    queryFn: () => api<{ unread: number }>('/notifications/unread-count'),
    enabled: !!access,
    refetchInterval: 60_000,
  });
}

export const markAllRead = () => api('/notifications/read', { body: {} });
export const registerPushToken = (token: string, platform: 'ios' | 'android' | 'web') =>
  api('/me/push-tokens', { body: { token, platform } });

// ---------- NGOs ----------

export function useNeeds(lat?: number, lng?: number) {
  return useQuery({
    queryKey: keys.needs(lat, lng),
    queryFn: () => api<Page<NeedCard>>('/ngos/needs', { query: { lat, lng, limit: 50 } }),
  });
}

export function useNeed(id: string) {
  return useQuery({ queryKey: keys.need(id), queryFn: () => api<NeedDetail>(`/ngos/needs/${id}`) });
}

export function usePledge() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ needId, body }: { needId: string; body: PledgeIn }) => api<Pledge>(`/ngos/needs/${needId}/pledges`, { body }),
    onSuccess: (p) => {
      qc.setQueryData(keys.pledge(p.id), p);
      qc.invalidateQueries({ queryKey: ['needs'] });
      qc.invalidateQueries({ queryKey: ['need'] });
      qc.invalidateQueries({ queryKey: keys.myPledges });
    },
  });
}

export function useMyPledges() {
  const access = useSession((s) => s.access);
  return useQuery({ queryKey: keys.myPledges, queryFn: () => api<Page<Pledge>>('/me/pledges', { query: { limit: 50 } }), enabled: !!access });
}

export function useCancelPledge() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<Pledge>(`/pledges/${id}/cancel`, { method: 'POST' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.myPledges });
      qc.invalidateQueries({ queryKey: ['needs'] });
    },
  });
}

export function useMyNgo() {
  const access = useSession((s) => s.access);
  return useQuery({
    queryKey: keys.myNgo,
    queryFn: () => api<NgoOut>('/ngos/mine').catch((e) => (e?.status === 404 ? null : Promise.reject(e))),
    enabled: !!access,
  });
}

export const registerNgo = (body: NgoRegisterIn) => api<NgoOut>('/ngos', { body });
export const updateNgo = (body: NgoRegisterIn) => api<NgoOut>('/ngos/mine', { method: 'PATCH', body });
export const uploadCertificate = (uri: string, name: string, type: string) =>
  api<NgoOut>('/ngos/mine/certificate', { form: fileForm(uri, name, type) });

export function useMyNeeds(enabled: boolean) {
  return useQuery({ queryKey: keys.myNeeds, queryFn: () => api<Page<NeedCard>>('/ngos/mine/needs'), enabled });
}

export function usePostNeed() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: NeedIn) => api<NeedCard>('/ngos/mine/needs', { body }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.myNeeds });
      qc.invalidateQueries({ queryKey: ['needs'] });
    },
  });
}

export function useCloseNeed() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'open' | 'closed' }) =>
      api<NeedCard>(`/ngos/mine/needs/${id}`, { method: 'PATCH', body: { status } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.myNeeds });
      qc.invalidateQueries({ queryKey: ['needs'] });
    },
  });
}

export function useNgoPledges(enabled: boolean, upcoming = true) {
  return useQuery({
    queryKey: keys.ngoPledges(upcoming),
    queryFn: () => api<Page<Pledge>>('/ngos/mine/pledges', { query: { upcoming, limit: 50 } }),
    enabled,
  });
}

export function useMarkReceived() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<Pledge>(`/ngos/mine/pledges/${id}/received`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['me', 'ngo', 'pledges'] }),
  });
}
