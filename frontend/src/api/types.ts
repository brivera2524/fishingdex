export interface Species {
  id: number;
  common_name: string;
  scientific_name: string | null;
  habitat_description: string | null;
  typical_size_range: string | null;
  season_notes: string | null;
  image_url: string | null;
  silhouette_url: string | null;
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
  photo_url: string | null;
  notes: string | null;
  created_at: string;
  species: Species;
}

export interface CatchInput {
  species_id: number;
  weight?: number | null;
  length?: number | null;
  caught_at: string;
  latitude?: number | null;
  longitude?: number | null;
  photo_url?: string | null;
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
}

export interface SpeciesRecord {
  species: Species;
  catch_count: number;
  top_catch: LeaderboardCatch | null;
}

export interface AnglerStat {
  display_name: string;
  catch_count: number;
  species_count: number;
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
}

export interface CurrentUser {
  id: number;
  display_name: string;
  created_at: string;
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
