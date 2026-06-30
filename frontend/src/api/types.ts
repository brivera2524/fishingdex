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
