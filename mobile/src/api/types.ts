// Friendly names for the generated OpenAPI types (run `npm run gen:api` after backend changes).
import type { components } from './schema';

type S = components['schemas'];

export type Me = S['MeOut'];
export type TokenPair = S['TokenPair'];
export type OtpRequestOut = S['OtpRequestOut'];
export type ImpactStats = S['ImpactStats'];
export type ListingCard = S['ListingCard'];
export type ListingDetail = S['ListingDetail'];
export type ListingCreateIn = S['ListingCreateIn'];
export type ListingUpdateIn = S['ListingUpdateIn'];
export type ListingNearby = S['ListingNearbyOut'];
export type MyListing = S['MyListing'];
export type Reservation = S['ReservationOut'];
export type ReservationCreateIn = S['ReservationCreateIn'];
export type Review = S['ReviewOut'];
export type ReviewIn = S['ReviewIn'];
export type PublicProfile = S['PublicProfile'];
export type Notification = S['NotificationOut'];
export type NgoOut = S['NgoOut'];
export type NgoRegisterIn = S['NgoRegisterIn'];
export type NeedCard = S['NeedCard'];
export type NeedDetail = S['NeedDetail'];
export type NeedIn = S['NeedIn'];
export type Pledge = S['PledgeOut'];
export type PledgeIn = S['PledgeIn'];
export type ReportIn = S['ReportIn'];
export type FoodType = ListingCard['food_type'];
export type ForWhom = Reservation['for_whom'];
export type Page<T> = { items: T[]; total: number; limit: number; offset: number };
