export interface Species {
  id: number;
  common_name: string;
  scientific_name: string | null;
  habitat_description: string | null;
  typical_size_range: string | null;
  season_notes: string | null;
  image_url: string | null;
  silhouette_url: string | null;
  min_size: string | null;
  bag_limit: string | null;
  regulation_notes: string | null;
}

export interface SpotSummary {
  id: number;
  name: string;
}

export interface Spot {
  id: number;
  name: string;
  /** [[lat, lng], ...] in drawn order; implicitly closes last -> first. */
  polygon: [number, number][];
  centroid_lat: number;
  centroid_lng: number;
  /** Manually pinned by the admin (e.g. the parking lot) — where to actually
   * send someone who wants to drive there. Falls back to the centroid when null. */
  parking_lat: number | null;
  parking_lng: number | null;
  created_at: string;
}

export interface SpotInput {
  name: string;
  polygon: [number, number][];
}

export interface SpotUpdateInput {
  name?: string;
  parking_lat?: number;
  parking_lng?: number;
}

export interface CatchPhoto {
  id: number;
  photo_url: string;
}

export interface Catch {
  id: number;
  user_id: number;
  species_id: number;
  weight: number | null;
  length: number | null;
  caught_at: string;
  latitude: number | null;
  longitude: number | null;
  /** The primary (first-uploaded) photo — kept for every existing single-photo display. */
  photo_url: string | null;
  /** Every photo for this catch, in upload order — photos[0].photo_url === photo_url. */
  photos: CatchPhoto[];
  notes: string | null;
  created_at: string;
  species: Species;
  /** Computed server-side from NOAA predictions at caught_at — not user-supplied. */
  tide_height_ft: number | null;
  tide_direction: "rising" | "falling" | null;
  /** Computed server-side from whether (latitude, longitude) falls inside a curated spot's polygon. */
  spot: SpotSummary | null;
  /** Excludes this catch from leaderboards/PB-record detection/angler stats while it still shows normally
   * everywhere else (dex, map, my catches) — defaults true, only false for catches explicitly excluded. */
  counts_for_leaderboard: boolean;
  /** Response-only, only meaningful right after a create/update save — used to trigger a celebration animation. */
  is_personal_best: boolean;
  is_leaderboard_record: boolean;
  /** The weight this catch just beat, whenever is_personal_best or is_leaderboard_record is true. */
  previous_best_weight: number | null;
}

export type NotificationMode = "all" | "pb_and_record" | "record_only" | "off";

export interface PushSubscriptionInput {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export interface CatchInput {
  species_id: number;
  weight?: number | null;
  length?: number | null;
  caught_at: string;
  latitude?: number | null;
  longitude?: number | null;
  notes?: string | null;
}

export interface CatchUpdateInput {
  species_id?: number;
  weight?: number | null;
  length?: number | null;
  caught_at?: string;
  latitude?: number | null;
  longitude?: number | null;
  notes?: string | null;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
}

export interface IdentifyResult {
  species: Species | null;
  raw_answer: string;
}

export interface LeaderboardCatch {
  id: number;
  display_name: string;
  weight: number | null;
  length: number | null;
  caught_at: string;
  photo_url: string | null;
  photos: CatchPhoto[];
  latitude: number | null;
  longitude: number | null;
  tide_height_ft: number | null;
  tide_direction: "rising" | "falling" | null;
  spot: SpotSummary | null;
}

export interface SpeciesRecord {
  species: Species;
  catch_count: number;
  top_catch: LeaderboardCatch | null;
}

export interface Challenge {
  id: string;
  name: string;
  starts_at: string;
  ends_at: string;
  status: "upcoming" | "active" | "ended";
  /** Ranked by weight descending — standings[0] is the winner (or current
   * leader), standings[standings.length - 1] is the loser (or current last).
   * Each entry is one participant's single best qualifying catch. */
  standings: LeaderboardCatch[];
}

export interface MapCatch {
  id: number;
  display_name: string;
  weight: number | null;
  length: number | null;
  caught_at: string;
  latitude: number;
  longitude: number;
  photo_url: string | null;
  species: Species;
  spot: SpotSummary | null;
}

export interface CurrentUser {
  id: number;
  display_name: string;
  created_at: string;
  is_admin: boolean;
  notification_mode: NotificationMode;
}

export interface AdminSettings {
  model: string;
  available_models: string[];
}

export interface RecentCatch {
  id: number;
  user_id: number;
  display_name: string;
  weight: number | null;
  length: number | null;
  caught_at: string;
  photo_url: string | null;
  photos: CatchPhoto[];
  latitude: number | null;
  longitude: number | null;
  species: Species;
  tide_height_ft: number | null;
  tide_direction: "rising" | "falling" | null;
  spot: SpotSummary | null;
}

export interface UserStat {
  id: number;
  display_name: string;
  catch_count: number;
  species_count: number;
}

export interface Comment {
  id: number;
  catch_id: number;
  user_id: number;
  display_name: string;
  body: string;
  created_at: string;
  updated_at: string | null;
}
