/*
  Endpoint chiamato ogni 30 minuti dal job pg_cron del database
  (vedi STEP35_NOTIFICHE_PUSH.sql). Controlla:
    - battelli attivi con consegna richiesta ma parabrezza o
      tappezzeria ancora mancanti ("a rischio consegna")
    - articoli sotto la scorta minima
  e manda una notifica push ai dispositivi iscritti, una sola
  volta al giorno per ogni battello/articolo (per non ripetere lo
  stesso avviso ogni mezz'ora).

  Protetto da un header segreto (x-cron-secret) che deve
  corrispondere alla variabile d'ambiente NOTIFICHE_CRON_SECRET.
*/

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import webPush from "web-push";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RiskBoat = {
  id: string;
  order_number: string;
  model_boat: string;
};

type LowStockItem = {
  id: string;
  code: string;
  description: string;
};

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error(
      "Configurazione Supabase mancante."
    );
  }

  return createClient(url, key);
}

async function findBoatsAtRisk(
  supabase: ReturnType<typeof getSupabase>
): Promise<RiskBoat[]> {
  const { data: riskBoatsData, error: riskBoatsError } =
    await supabase
      .from("production_boats")
      .select("id,order_number,model_boat,requested_delivery_date")
      .eq("status", "active")
      .not("requested_delivery_date", "is", null)
      .order("requested_delivery_date", { ascending: true })
      .limit(40);

  if (riskBoatsError || !riskBoatsData || riskBoatsData.length === 0) {
    return [];
  }

  const boatIds = riskBoatsData.map((row) => String(row.id));

  const [windshieldResult, upholsteryResult] = await Promise.all([
    supabase
      .from("production_boat_windshield")
      .select("boat_id")
      .in("boat_id", boatIds)
      .is("kit_id", null),
    supabase
      .from("production_boat_upholstery")
      .select("boat_id")
      .in("boat_id", boatIds)
      .is("kit_id", null),
  ]);

  const missingSet = new Set<string>();

  (
    (windshieldResult.data || []) as { boat_id: string }[]
  ).forEach((row) => missingSet.add(String(row.boat_id)));

  (
    (upholsteryResult.data || []) as { boat_id: string }[]
  ).forEach((row) => missingSet.add(String(row.boat_id)));

  return riskBoatsData
    .filter((row) => missingSet.has(String(row.id)))
    .map((row) => ({
      id: String(row.id),
      order_number: String(row.order_number || ""),
      model_boat: String(row.model_boat || ""),
    }));
}

async function findLowStockItems(
  supabase: ReturnType<typeof getSupabase>
): Promise<LowStockItem[]> {
  const { data, error } = await supabase
    .from("items")
    .select("id, code, description, stock, min_stock");

  if (error || !data) {
    return [];
  }

  return data
    .filter((item) => {
      const stock = Number(item.stock ?? 0);
      const minStock = Number(item.min_stock ?? 0);
      return minStock > 0 && stock <= minStock;
    })
    .map((item) => ({
      id: String(item.id),
      code: String(item.code || ""),
      description: String(item.description || ""),
    }));
}

async function filterAlreadyNotified(
  supabase: ReturnType<typeof getSupabase>,
  kind: "rischio_consegna" | "scorta_bassa",
  refIds: string[]
): Promise<Set<string>> {
  if (refIds.length === 0) {
    return new Set();
  }

  const today = new Date()
    .toISOString()
    .slice(0, 10);

  const { data } = await supabase
    .from("push_notification_log")
    .select("ref_id")
    .eq("kind", kind)
    .eq("notified_on", today)
    .in("ref_id", refIds);

  return new Set(
    (data || []).map((row) => String(row.ref_id))
  );
}

export async function POST(request: NextRequest) {
  const secret = request.headers.get("x-cron-secret");

  if (
    !process.env.NOTIFICHE_CRON_SECRET ||
    secret !== process.env.NOTIFICHE_CRON_SECRET
  ) {
    return NextResponse.json(
      { error: "Non autorizzato." },
      { status: 401 }
    );
  }

  const vapidPublicKey = process.env.VAPID_PUBLIC_KEY;
  const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;

  if (!vapidPublicKey || !vapidPrivateKey) {
    return NextResponse.json(
      { error: "Chiavi VAPID non configurate." },
      { status: 500 }
    );
  }

  webPush.setVapidDetails(
    "mailto:notifiche@magazzino-web.local",
    vapidPublicKey,
    vapidPrivateKey
  );

  const supabase = getSupabase();

  const [riskBoats, lowStockItems] = await Promise.all([
    findBoatsAtRisk(supabase),
    findLowStockItems(supabase),
  ]);

  const [alreadyRisk, alreadyLowStock] = await Promise.all([
    filterAlreadyNotified(
      supabase,
      "rischio_consegna",
      riskBoats.map((boat) => boat.id)
    ),
    filterAlreadyNotified(
      supabase,
      "scorta_bassa",
      lowStockItems.map((item) => item.id)
    ),
  ]);

  const newRiskBoats = riskBoats.filter(
    (boat) => !alreadyRisk.has(boat.id)
  );

  const newLowStockItems = lowStockItems.filter(
    (item) => !alreadyLowStock.has(item.id)
  );

  if (newRiskBoats.length === 0 && newLowStockItems.length === 0) {
    return NextResponse.json({
      sent: 0,
      newRiskBoats: 0,
      newLowStockItems: 0,
    });
  }

  const parts: string[] = [];

  if (newRiskBoats.length > 0) {
    parts.push(
      `${newRiskBoats.length} battell${
        newRiskBoats.length === 1 ? "o" : "i"
      } a rischio consegna`
    );
  }

  if (newLowStockItems.length > 0) {
    parts.push(
      `${newLowStockItems.length} articol${
        newLowStockItems.length === 1 ? "o" : "i"
      } sotto scorta minima`
    );
  }

  const title = "Gestionale Matteo";
  const body = parts.join(" · ");

  const url =
    newRiskBoats.length > 0
      ? "/"
      : "/low-stock-report";

  const payload = JSON.stringify({
    title,
    body,
    url,
  });

  const { data: subscriptions } = await supabase
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth");

  let sent = 0;
  const staleIds: string[] = [];

  await Promise.all(
    (subscriptions || []).map(async (sub) => {
      try {
        await webPush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: {
              p256dh: sub.p256dh,
              auth: sub.auth,
            },
          },
          payload
        );

        sent += 1;
      } catch (error) {
        const statusCode =
          error &&
          typeof error === "object" &&
          "statusCode" in error
            ? (error as { statusCode: number }).statusCode
            : null;

        if (statusCode === 404 || statusCode === 410) {
          staleIds.push(sub.id);
        }
      }
    })
  );

  if (staleIds.length > 0) {
    await supabase
      .from("push_subscriptions")
      .delete()
      .in("id", staleIds);
  }

  const today = new Date().toISOString().slice(0, 10);

  const logRows = [
    ...newRiskBoats.map((boat) => ({
      kind: "rischio_consegna",
      ref_id: boat.id,
      notified_on: today,
    })),
    ...newLowStockItems.map((item) => ({
      kind: "scorta_bassa",
      ref_id: item.id,
      notified_on: today,
    })),
  ];

  if (logRows.length > 0) {
    await supabase
      .from("push_notification_log")
      .upsert(logRows, {
        onConflict: "kind,ref_id,notified_on",
        ignoreDuplicates: true,
      });
  }

  return NextResponse.json({
    sent,
    newRiskBoats: newRiskBoats.length,
    newLowStockItems: newLowStockItems.length,
    staleRemoved: staleIds.length,
  });
}
