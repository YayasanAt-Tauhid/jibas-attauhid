/**
 * Server functions: sendTelegram, sendWhatsapp
 * Migrasi dari supabase/functions/send-telegram & send-whatsapp.
 * Hanya admin / kepala_sekolah. Mendukung kirim tunggal maupun bulk.
 */
import { createServerFn } from "@tanstack/react-start";
import { authMiddleware, requireContext, requireRole } from "./auth";
import { createAdminClient, readEnv } from "./supabase";

export interface SendTelegramInput {
  chat_id?: string;
  chat_ids?: string[];
  message: string;
  parse_mode?: "HTML" | "Markdown";
}

export interface SendWhatsappInput {
  phone?: string;
  phones?: string[];
  message: string;
}

interface SendResult {
  success: true;
  sent: number;
  failed: number;
  details: { target: string; success: boolean; error?: string }[];
}

export const sendTelegram = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .inputValidator((d: SendTelegramInput) => d)
  .handler(async ({ data, context }): Promise<SendResult> => {
    const admin = createAdminClient();
    await requireRole(admin, requireContext(context).userId, ["admin", "kepala_sekolah"]);

    const token = readEnv("TELEGRAM_BOT_TOKEN");
    if (!token) throw new Error("TELEGRAM_BOT_TOKEN belum dikonfigurasi");

    const chatIds = data.chat_ids ?? (data.chat_id ? [data.chat_id] : []);
    const message = data.message;
    const parseMode = data.parse_mode ?? "HTML";
    if (!chatIds.length || !message) {
      throw new Error("chat_id(s) dan message wajib diisi");
    }

    const details: SendResult["details"] = [];
    for (const chatId of chatIds) {
      try {
        const res = await fetch(
          `https://api.telegram.org/bot${token}/sendMessage`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              chat_id: chatId,
              text: message,
              parse_mode: parseMode,
            }),
          }
        );
        const body = await res.json();
        if (!body.ok) {
          details.push({ target: chatId, success: false, error: body.description });
        } else {
          details.push({ target: chatId, success: true });
        }
      } catch (err) {
        details.push({
          target: chatId,
          success: false,
          error: err instanceof Error ? err.message : "gagal",
        });
      }
    }

    const sent = details.filter((r) => r.success).length;
    return { success: true, sent, failed: details.length - sent, details };
  });

export const sendWhatsapp = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .inputValidator((d: SendWhatsappInput) => d)
  .handler(async ({ data, context }): Promise<SendResult> => {
    const admin = createAdminClient();
    await requireRole(admin, requireContext(context).userId, ["admin", "kepala_sekolah"]);

    const gatewayUrl = readEnv("WA_GATEWAY_URL");
    const gatewayToken = readEnv("WA_GATEWAY_TOKEN");
    if (!gatewayUrl) throw new Error("WA_GATEWAY_URL belum dikonfigurasi");

    const phones = data.phones ?? (data.phone ? [data.phone] : []);
    const message = data.message;
    if (!phones.length || !message) {
      throw new Error("phone(s) dan message wajib diisi");
    }

    const details: SendResult["details"] = [];
    for (const phone of phones) {
      try {
        const cleanPhone = phone.replace(/\D/g, "");
        const jid = cleanPhone.includes("@")
          ? cleanPhone
          : `${cleanPhone}@s.whatsapp.net`;

        const headers: Record<string, string> = {
          "Content-Type": "application/json",
        };
        if (gatewayToken) headers["Authorization"] = `Bearer ${gatewayToken}`;

        const res = await fetch(`${gatewayUrl}/send-message`, {
          method: "POST",
          headers,
          body: JSON.stringify({ jid, message: { text: message } }),
        });
        const body = await res.json();
        if (!res.ok || body.error) {
          details.push({
            target: phone,
            success: false,
            error: body.error || body.message || "Failed to send",
          });
        } else {
          details.push({ target: phone, success: true });
        }
      } catch (err) {
        details.push({
          target: phone,
          success: false,
          error: err instanceof Error ? err.message : "gagal",
        });
      }
    }

    const sent = details.filter((r) => r.success).length;
    return { success: true, sent, failed: details.length - sent, details };
  });
