import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface TelegramPayload {
  chat_id: string;
  message: string;
  parse_mode?: "HTML" | "Markdown";
}

interface BulkPayload {
  chat_ids: string[];
  message: string;
  parse_mode?: "HTML" | "Markdown";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Verify caller is admin
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Unauthorized");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY") || ""
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace("Bearer ", "")
    );
    if (authError || !user) throw new Error("Unauthorized");

    // Check role
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: profile } = await supabaseAdmin
      .from("users_profile")
      .select("role")
      .eq("id", user.id)
      .single();

    if (!profile || !["admin", "kepala_sekolah"].includes(profile.role)) {
      throw new Error("Forbidden: hanya admin yang bisa mengirim notifikasi");
    }

    const TELEGRAM_BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN");
    if (!TELEGRAM_BOT_TOKEN) {
      throw new Error("TELEGRAM_BOT_TOKEN belum dikonfigurasi");
    }

    const body = await req.json();
    const results: { chat_id: string; success: boolean; error?: string }[] = [];

    // Support single or bulk send
    const chatIds: string[] = body.chat_ids || (body.chat_id ? [body.chat_id] : []);
    const message: string = body.message;
    const parseMode: string = body.parse_mode || "HTML";

    if (!chatIds.length || !message) {
      throw new Error("chat_id(s) dan message wajib diisi");
    }

    for (const chatId of chatIds) {
      try {
        const res = await fetch(
          `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
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

        const data = await res.json();
        if (!data.ok) {
          results.push({ chat_id: chatId, success: false, error: data.description });
        } else {
          results.push({ chat_id: chatId, success: true });
        }
      } catch (err: any) {
        results.push({ chat_id: chatId, success: false, error: err.message });
      }
    }

    const successCount = results.filter((r) => r.success).length;

    return new Response(
      JSON.stringify({
        success: true,
        sent: successCount,
        failed: results.length - successCount,
        details: results,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error: any) {
    console.error("send-telegram error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: error.message.includes("Unauthorized") ? 401 : 400,
      }
    );
  }
});
