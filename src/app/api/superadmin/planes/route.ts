import { NextResponse, type NextRequest } from "next/server";
import { getDb } from "@/db/client";
import { isSameOrigin } from "@/lib/auth/origin";
import { authorizeSuperadminRequest } from "@/lib/superadmin/authorization";
import { createPlan, updatePlan } from "@/lib/superadmin/plans";
import {
  formString,
  isUuid,
  parsePlanForm,
  type SuperadminErrorCode,
} from "@/lib/superadmin/validation";

export const dynamic = "force-dynamic";

export function GET() {
  return new NextResponse(null, {
    status: 405,
    headers: { Allow: "POST" },
  });
}

function errorRedirect(request: NextRequest, planId: string, error: string) {
  const path = isUuid(planId)
    ? `/superadmin/planes/${planId.toLowerCase()}`
    : "/superadmin/planes";
  const url = new URL(path, request.url);
  url.searchParams.set("error", error);
  return NextResponse.redirect(url, 303);
}

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) {
    return new NextResponse("Origen no permitido.", { status: 403 });
  }

  const authorization = await authorizeSuperadminRequest(request);

  if (!authorization.ok) {
    return authorization.response;
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return new NextResponse("Solicitud inválida.", { status: 400 });
  }

  const planId = formString(formData, "planId").trim();
  const parsed = parsePlanForm(formData);

  if (!parsed.ok) {
    return errorRedirect(request, planId, parsed.error);
  }

  try {
    if (planId !== "") {
      if (!isUuid(planId)) {
        return errorRedirect(request, "", "campos");
      }

      const result = await updatePlan(getDb(), planId.toLowerCase(), parsed.value);

      if (result === null) {
        return new NextResponse("Plan no encontrado.", { status: 404 });
      }

      if (!result.ok) {
        return errorRedirect(request, planId, result.error);
      }
    } else {
      const result = await createPlan(getDb(), parsed.value);

      if (!result.ok) {
        return errorRedirect(request, "", result.error);
      }
    }
  } catch {
    return errorRedirect(
      request,
      planId,
      "servicio" satisfies SuperadminErrorCode,
    );
  }

  return NextResponse.redirect(new URL("/superadmin/planes", request.url), 303);
}
