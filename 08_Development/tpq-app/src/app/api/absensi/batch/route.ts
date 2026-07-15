// POST /api/absensi/batch
// Referensi: API Design.md §Contoh Kontrak, Wireframe.md §3 (input cepat 1 aksi konfirmasi)

import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { verifyToken, canAccessKelompok } from "@/lib/auth";
import { z } from "zod";

const prisma = new PrismaClient();

const bodySchema = z.object({
  tanggal: z.string(),
  kelompokId: z.number(),
  data: z.array(
    z.object({
      santriId: z.number(),
      status: z.enum(["hadir", "alpa", "izin"]),
    })
  ),
});

export async function POST(req: NextRequest) {
  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  const user = token ? verifyToken(token) : null;

  if (!user) {
    return NextResponse.json(
      { success: false, error: { code: "UNAUTHORIZED", message: "Token tidak valid." } },
      { status: 401 }
    );
  }

  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: { code: "INVALID_INPUT", message: parsed.error.message } },
      { status: 400 }
    );
  }

  const { tanggal, kelompokId, data } = parsed.data;

  // RBAC: hanya Admin Kelompok pemilik scope yang boleh mencatat (BR-05)
  if (!canAccessKelompok(user, kelompokId)) {
    return NextResponse.json(
      {
        success: false,
        error: { code: "FORBIDDEN_SCOPE", message: "Anda tidak berwenang mengelola Kelompok ini." },
      },
      { status: 403 }
    );
  }

  const results = await prisma.$transaction(
    data.map((item) =>
      prisma.absensi.upsert({
        where: {
          santriId_tanggal: { santriId: item.santriId, tanggal: new Date(tanggal) },
        },
        update: { status: item.status, dicatatOleh: user.id },
        create: {
          santriId: item.santriId,
          tanggal: new Date(tanggal),
          status: item.status,
          dicatatOleh: user.id,
        },
      })
    )
  );

  return NextResponse.json({
    success: true,
    data: { tersimpan: results.length, tanggal },
  });
}
