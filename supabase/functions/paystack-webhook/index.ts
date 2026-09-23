/**
 * Edge Function: paystack-webhook
 *
 * POST /functions/v1/paystack-webhook
 *
 * Handles incoming Paystack webhook events:
 *   - charge.success → activate subscription
 *   - transfer.success / transfer.failed → update payroll batch status
 *
 * Security:
 *   - HMAC-SHA512 signature verification (timing-safe) on every request
 *   - Raw body read before JSON parse (required for correct HMAC)
 *   - Idempotent: duplicate webhook delivery handled by paystack_reference UNIQUE constraint
 *   - No user JWT required — this endpoint is called by Paystack servers, not the client
 *   - webhook_data (raw payload) stored for audit but NEVER returned to clients
 */

import {
  corsHeaders,
  ok,
  err,
  serviceClient,
  verifyPaystackSignature,
} from "../_shared/utils.ts";

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin");

  if (req.method !== "POST") return err("Method not allowed", 405, origin);

  // ---- Read raw body BEFORE parsing (HMAC requires exact bytes) ----
  const rawBody = await req.text();
  const signature = req.headers.get("x-paystack-signature");

  // ---- Verify Paystack HMAC-SHA512 signature ----
  const isValid = await verifyPaystackSignature(rawBody, signature);
  if (!isValid) {
    console.warn("Invalid Paystack webhook signature");
    // Return 200 to prevent Paystack from retrying indefinitely on auth errors
    // but log for monitoring
    return new Response("Signature mismatch", { status: 200 });
  }

  // ---- Parse payload ----
  let event: Record<string, unknown>;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return new Response("Invalid JSON", { status: 200 });
  }

  const eventType = event.event as string;
  const data = event.data as Record<string, unknown>;

  const svc = serviceClient();

  switch (eventType) {
    case "charge.success":
      await handleChargeSuccess(svc, data, rawBody);
      break;
    case "transfer.success":
      await handleTransferResult(svc, data, "paid");
      break;
    case "transfer.failed":
    case "transfer.reversed":
      await handleTransferResult(svc, data, "rejected");
      break;
    default:
      // Unknown event — log it but return 200 so Paystack stops retrying
      console.log(`Unhandled Paystack event: ${eventType}`);
  }

  // Always return 200 to Paystack (they retry on non-2xx)
  return new Response("ok", { status: 200 });
});

// ============================================================
// HANDLERS
// ============================================================

async function handleChargeSuccess(
  svc: ReturnType<typeof serviceClient>,
  data: Record<string, unknown>,
  rawBody: string,
): Promise<void> {
  const reference = data.reference as string;
  const metadata = data.metadata as Record<string, unknown> | null;
  const userId = metadata?.user_id as string | undefined;
  const planType = metadata?.plan_type as string | undefined;
  const amountKobo = data.amount as number;

  if (!reference || !userId) {
    console.error("charge.success missing reference or user_id in metadata");
    return;
  }

  // Determine access expiry by plan type
  let expiresAt: string | null = null;
  if (planType === "gst_year1" || planType === "gst_year2") {
    // GST access is semester-based: ~6 months
    const exp = new Date();
    exp.setMonth(exp.getMonth() + 6);
    expiresAt = exp.toISOString();
  } else if (planType === "cbt_premium") {
    // CBT access: 1 year
    const exp = new Date();
    exp.setFullYear(exp.getFullYear() + 1);
    expiresAt = exp.toISOString();
  }

  const { error } = await svc
    .from("subscriptions")
    .upsert(
      {
        user_id: userId,
        plan_type: planType ?? "unknown",
        paystack_reference: reference,
        status: "success",
        amount_kobo: amountKobo,
        access_expires_at: expiresAt,
        webhook_data: JSON.parse(rawBody), // Stored for audit; never client-readable
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: "paystack_reference",
        ignoreDuplicates: false, // Update status if previously pending
      },
    );

  if (error) {
    console.error("Failed to upsert subscription:", error);
  }
}

async function handleTransferResult(
  svc: ReturnType<typeof serviceClient>,
  data: Record<string, unknown>,
  status: "paid" | "rejected",
): Promise<void> {
  const transferCode = data.transfer_code as string;
  if (!transferCode) return;

  const { error } = await svc
    .from("payroll_batches")
    .update({
      status,
      processed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("paystack_bulk_transfer_code", transferCode);

  if (error) {
    console.error(`Failed to update payroll batch for transfer ${transferCode}:`, error);
  }
}
