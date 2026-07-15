// RBAC enforcement — implementasi dari System Architecture.md (Tahap 17) §4
// Referensi aturan: Business Rules.md BR-04 s.d. BR-07

import jwt from "jsonwebtoken";

export type Role = "admin_kelompok" | "admin_desa" | "admin_ppg";
export type ScopeType = "kelompok" | "desa" | "ppg";

export interface AuthUser {
  id: number;
  role: Role;
  scopeType: ScopeType;
  scopeId: number;
}

const JWT_SECRET = process.env.JWT_SECRET as string;

export function verifyToken(token: string): AuthUser | null {
  try {
    return jwt.verify(token, JWT_SECRET) as AuthUser;
  } catch {
    return null;
  }
}

/**
 * Mengecek apakah user berwenang mengakses resource dengan kelompokId/desaId tertentu.
 * Mengikuti BR-05 (Admin Kelompok: scope sendiri), BR-06 (Admin Desa: seluruh Kelompok
 * di Desanya), BR-07 (Admin PPG: seluruh organisasi).
 *
 * CATATAN PENTING: fungsi ini butuh lookup relasi kelompok->desa->ppg dari database
 * untuk kasus Admin Desa/PPG (belum diimplementasikan di scaffold ini — lihat TODO).
 */
export function canAccessKelompok(
  user: AuthUser,
  targetKelompokId: number,
  targetDesaId?: number
): boolean {
  if (user.role === "admin_ppg") return true; // BR-07: akses seluruh organisasi

  if (user.role === "admin_desa") {
    // TODO: validasi targetDesaId === user.scopeId via query DB, bukan asumsi
    return user.scopeType === "desa" && targetDesaId === user.scopeId;
  }

  if (user.role === "admin_kelompok") {
    return user.scopeType === "kelompok" && targetKelompokId === user.scopeId;
  }

  return false;
}

/**
 * Aturan hapus data — BR-05/06/07: hanya Admin Kelompok yang boleh hapus,
 * dan hanya data miliknya sendiri.
 */
export function canDelete(user: AuthUser, targetKelompokId: number): boolean {
  return user.role === "admin_kelompok" && user.scopeId === targetKelompokId;
}
