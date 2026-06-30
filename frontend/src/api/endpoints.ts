import { apiFetch } from "./client";
import type { Catch, CatchInput, CatchUpdateInput, IdentifyResult, Species, TokenResponse } from "./types";

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

export function uploadCatchPhoto(catchId: number, file: File) {
  const formData = new FormData();
  formData.append("file", file);
  return apiFetch<Catch>(`/catches/${catchId}/photo`, {
    method: "POST",
    body: formData,
  });
}

export function deleteCatchPhoto(catchId: number) {
  return apiFetch<Catch>(`/catches/${catchId}/photo`, { method: "DELETE" });
}

export function identifyPhoto(file: File | Blob) {
  const formData = new FormData();
  formData.append("file", file, "capture.jpg");
  return apiFetch<IdentifyResult>("/identify", {
    method: "POST",
    body: formData,
  });
}
