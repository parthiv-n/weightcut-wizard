const STORAGE_KEY = "custom_session_types";

export function getCustomTypes(userId: string): string[] {
  try {
    const raw = localStorage.getItem(`${STORAGE_KEY}_${userId}`);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function addCustomType(userId: string, type: string): string[] {
  const types = getCustomTypes(userId);
  const trimmed = type.trim();
  if (!trimmed || types.includes(trimmed)) return types;
  const updated = [...types, trimmed];
  localStorage.setItem(`${STORAGE_KEY}_${userId}`, JSON.stringify(updated));
  return updated;
}

export function removeCustomType(userId: string, type: string): string[] {
  const types = getCustomTypes(userId).filter(t => t !== type);
  localStorage.setItem(`${STORAGE_KEY}_${userId}`, JSON.stringify(types));
  return types;
}
