// PATCH /api/kelompok/:id/status
// Referensi: API Design.md (Tahap 18), Business Rules.md BR-02
// Hanya role=admin_ppg yang boleh mengubah status Kelompok (aktif/belum_aktif)

import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { verifyToken } from "@/lib/auth";
import { z } from "zod";

const prisma = new PrismaClient();

const bodySchema = z.object({
  status: z.enum(["aktif", "belum_aktif"]),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  const user = token ? verifyToken(token) : null;

  if (!user) {
    return NextResponse.json(
      { success: false, error: { code: "UNAUTHORIZED", message: "Token tidak valid." } },
      { status: 401 }
    );
  }

  // BR-02: hanya Admin PPG yang boleh mengubah status Kelompok
  if (user.role !== "admin_ppg") {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "FORBIDDEN_SCOPE",
          message: "Hanya Admin PPG yang berwenang mengubah status Kelompok.",
        },
      },
      { status: 403 }
    );
  }

  const kelompokId = Number(params.id);
  const parsed = bodySchema.safeParse(await req.json());

  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: { code: "INVALID_INPUT", message: parsed.error.message } },
      { status: 400 }
    );
  }

  const updated = await prisma.kelompok.update({
    where: { id: kelompokId },
    data: { statusAktif: parsed.data.status },
  });

  // Audit log wajib — BR-16 prinsip rekonsiliasi & jejak perubahan
  await prisma.auditLog.create({
    data: {
      tableName: "kelompok",
      recordId: kelompokId,
      action: "update",
      userId: user.id,
      detailPerubahan: { field: "statusAktif", newValue: parsed.data.status },
    },
  });

  return NextResponse.json({ success: true, data: updated });
}
