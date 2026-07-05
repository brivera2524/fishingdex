import { apiFetch } from "./client";
import type {
  AdminSettings,
  AnglerStat,
  Catch,
  CatchInput,
  CatchUpdateInput,
  Challenge,
  Comment,
  CurrentUser,
  IdentifyResult,
  LeaderboardCatch,
  MapCatch,
  NotificationMode,
  PushSubscriptionInput,
  RecentCatch,
  Species,
  SpeciesRecord,
  Spot,
  SpotInput,
  SpotUpdateInput,
  TokenResponse,
  UserStat,
} from "./types";

export function signup(inviteCode: string, displayName: string, password: string) {
  return apiFetch<TokenResponse>("/auth/signup", {
    method: "POST",
    body: JSON.stringify({ invite_code: inviteCode, display_name: displayName, password }),
  });
}

export function login(displayName: string, password: string) {
  return apiFetch<TokenResponse>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ display_name: displayName, password }),
  });
}

export function getMe() {
  return apiFetch<CurrentUser>("/auth/me");
}

export function listSpecies() {
  return apiFetch<Species[]>("/species");
}

export function listMyCatches() {
  return apiFetch<Catch[]>("/catches/me");
}

export function createCatch(input: CatchInput) {
  return apiFetch<Catch>("/catches", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function getMapCatches() {
  return apiFetch<MapCatch[]>("/catches/map");
}

export function getRecentCatches() {
  return apiFetch<RecentCatch[]>("/catches/recent");
}

export function getCatch(catchId: number) {
  return apiFetch<Catch>(`/catches/${catchId}`);
}

export function updateCatch(catchId: number, input: CatchUpdateInput) {
  return apiFetch<Catch>(`/catches/${catchId}`, {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

export function deleteCatch(catchId: number) {
  return apiFetch<void>(`/catches/${catchId}`, { method: "DELETE" });
}

export function addCatchPhoto(catchId: number, file: File) {
  const formData = new FormData();
  formData.append("file", file);
  return apiFetch<Catch>(`/catches/${catchId}/photos`, {
    method: "POST",
    body: formData,
  });
}

export function deleteCatchPhoto(catchId: number, photoId: number) {
  return apiFetch<Catch>(`/catches/${catchId}/photos/${photoId}`, { method: "DELETE" });
}

export function identifyPhoto(file: File | Blob) {
  const formData = new FormData();
  formData.append("file", file, "capture.jpg");
  return apiFetch<IdentifyResult>("/identify", {
    method: "POST",
    body: formData,
  });
}

export function getSpeciesLeaderboard() {
  return apiFetch<SpeciesRecord[]>("/leaderboard/species");
}

export function getSpeciesCatchLeaderboard(speciesId: number) {
  return apiFetch<LeaderboardCatch[]>(`/leaderboard/species/${speciesId}`);
}

export function getAnglerLeaderboard() {
  return apiFetch<AnglerStat[]>("/leaderboard/anglers");
}

export function getChallenges() {
  return apiFetch<Challenge[]>("/leaderboard/challenges");
}

export function getComments(catchId: number) {
  return apiFetch<Comment[]>(`/catches/${catchId}/comments`);
}

export function createComment(catchId: number, body: string) {
  return apiFetch<Comment>(`/catches/${catchId}/comments`, {
    method: "POST",
    body: JSON.stringify({ body }),
  });
}

export function updateComment(commentId: number, body: string) {
  return apiFetch<Comment>(`/comments/${commentId}`, {
    method: "PUT",
    body: JSON.stringify({ body }),
  });
}

export function deleteComment(commentId: number) {
  return apiFetch<void>(`/comments/${commentId}`, { method: "DELETE" });
}

export function listUsers() {
  return apiFetch<UserStat[]>("/users");
}

export function getUserCatches(userId: number) {
  return apiFetch<Catch[]>(`/users/${userId}/catches`);
}

export function listSpots() {
  return apiFetch<Spot[]>("/spots");
}

export function createSpot(input: SpotInput) {
  return apiFetch<Spot>("/spots", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateSpot(spotId: number, input: SpotUpdateInput) {
  return apiFetch<Spot>(`/spots/${spotId}`, {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

export function deleteSpot(spotId: number) {
  return apiFetch<void>(`/spots/${spotId}`, { method: "DELETE" });
}

export function getVapidPublicKey() {
  return apiFetch<{ key: string }>("/push/vapid-public-key");
}

export function subscribePush(subscription: PushSubscriptionInput) {
  return apiFetch<void>("/push/subscribe", {
    method: "POST",
    body: JSON.stringify(subscription),
  });
}

export function updateNotificationMode(mode: NotificationMode) {
  return apiFetch<{ mode: NotificationMode }>("/push/notification-mode", {
    method: "PUT",
    body: JSON.stringify({ mode }),
  });
}

export function getAdminSettings() {
  return apiFetch<AdminSettings>("/admin/settings");
}

export function updateAdminSettings(model: string) {
  return apiFetch<AdminSettings>("/admin/settings", {
    method: "PUT",
    body: JSON.stringify({ model }),
  });
}
