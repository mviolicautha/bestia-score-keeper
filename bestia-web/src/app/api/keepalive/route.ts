/**
 * Supabase (piano gratuito) mette in pausa i progetti dopo una settimana senza attività:
 * la sera della partita l'app non funzionerebbe. Vercel chiama questa pagina una volta al
 * giorno (vercel.json → crons) e lei fa una lettura leggera sul database.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return Response.json({ ok: false, reason: "Supabase non configurato" }, { status: 200 });
  try {
    const res = await fetch(`${url}/rest/v1/games?select=id&limit=1`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
      cache: "no-store",
    });
    return Response.json({ ok: res.ok, status: res.status, at: new Date().toISOString() }, { status: res.ok ? 200 : 502 });
  } catch (e) {
    return Response.json({ ok: false, reason: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
