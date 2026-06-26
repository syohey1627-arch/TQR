import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

type PunchBody = {
  companyCode?: string;
  deviceCode?: string;
  deviceSecret?: string;
  punchType?: string;
  authMethod?: "qr" | "pass";
  employeeCode?: string;
  employeePass?: string;
  qrToken?: string;
  clientRecordId?: string;
};

const punchTypes = new Set([
  "clock_in",
  "clock_out",
  "break_start",
  "break_end",
  "leave_start",
  "leave_end"
]);

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json"
    }
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ ok: false, status: "error", message: "POST only." }, 405);
  }

  let body: PunchBody;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ ok: false, status: "error", message: "Invalid JSON." }, 400);
  }

  const companyCode = body.companyCode?.trim();
  const deviceCode = body.deviceCode?.trim();
  const deviceSecret = body.deviceSecret ?? "";
  const punchType = body.punchType?.trim();
  const authMethod = body.authMethod;

  if (!companyCode || !deviceCode || !deviceSecret || !punchType || !authMethod) {
    return jsonResponse({ ok: false, status: "error", message: "Required fields are missing." }, 400);
  }

  if (!punchTypes.has(punchType)) {
    return jsonResponse({ ok: false, status: "error", message: "Invalid punch type." }, 400);
  }

  if (authMethod === "pass" && (!body.employeeCode?.trim() || !body.employeePass)) {
    return jsonResponse({ ok: false, status: "error", message: "Employee code and PASS are required." }, 400);
  }

  if (authMethod === "qr" && !body.qrToken) {
    return jsonResponse({ ok: false, status: "error", message: "QR token is required." }, 400);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const secretKeys = Deno.env.get("SUPABASE_SECRET_KEYS");
  const legacyServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const serviceRoleKey = secretKeys ? JSON.parse(secretKeys).default : legacyServiceRoleKey;

  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse({ ok: false, status: "error", message: "Function secrets are not configured." }, 500);
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });

  const { data, error } = await supabaseAdmin.rpc("record_terminal_punch", {
    p_company_code: companyCode,
    p_device_code: deviceCode,
    p_device_secret: deviceSecret,
    p_punch_type: punchType,
    p_auth_method: authMethod,
    p_employee_code: body.employeeCode?.trim() ?? null,
    p_employee_pass: body.employeePass ?? null,
    p_qr_token: body.qrToken ?? null,
    p_client_record_id: body.clientRecordId ?? crypto.randomUUID()
  });

  if (error) {
    console.error(error);
    return jsonResponse({ ok: false, status: "error", message: "Punch processing failed." }, 500);
  }

  const responseStatus = data?.status === "error" ? 401 : 200;
  return jsonResponse(data, responseStatus);
});
