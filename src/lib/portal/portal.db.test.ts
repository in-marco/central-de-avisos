import { afterAll, describe, expect, it } from "vitest";
import type { Prisma } from "@/generated/prisma/client";
import { disconnectDb } from "@/db/client";
import { inRollback, uniqueSuffix } from "@/db/db-test-utils";
import { hashPassword } from "@/lib/auth/password";
import { getSessionByToken } from "@/lib/auth/session";
import { acceptInvitationInTransaction } from "@/lib/onboarding/invitation-acceptance";
import { createPortalScenario, type PortalScenario } from "./db-test-fixtures";
import { invitePortalContactInTransaction } from "./invitaciones";
import { getPortalCliente, getPortalSede } from "./portal";
import { clienteScope } from "./scope";

/**
 * Aislamiento del portal de cliente. Las features futuras de avisos y
 * facturas del portal añaden aquí su caso (C1/C2 de la misma empresa y A/B).
 */

afterAll(async () => {
  await disconnectDb();
});

const t0 = new Date("2026-11-15T10:00:00.000Z");
const t1 = new Date("2026-11-15T11:00:00.000Z");
const MISSING_ID = "00000000-0000-4000-8000-000000000000";

/** Invita a Ana (C1), acepta y devuelve la sesión real del usuario de cliente. */
async function portalSessionForAna(tx: Prisma.TransactionClient, s: PortalScenario) {
  const invited = await invitePortalContactInTransaction(tx, {
    empresaId: s.a.id,
    clienteId: s.c1.cliente.id,
    contactoId: s.c1.ana.id,
    now: t0,
  });

  if (!invited.ok) {
    throw new Error(invited.error);
  }

  const accepted = await acceptInvitationInTransaction(tx, {
    token: invited.token,
    passwordHash: await hashPassword("contraseña-del-portal"),
    now: t1,
  });

  if (!accepted.ok) {
    throw new Error(accepted.reason);
  }

  const session = await getSessionByToken(tx, accepted.sessionToken, t1);

  if (!session) {
    throw new Error("La sesión del portal no autentica");
  }

  return { invited, accepted, session };
}

describe("aislamiento del portal de cliente", () => {
  it("el usuario de C1 ve su cliente y solo sus sedes (no las de C2 ni las de otra empresa)", async () => {
    const result = await inRollback(async (tx) => {
      const s = await createPortalScenario(tx, uniqueSuffix());
      const { session } = await portalSessionForAna(tx, s);
      const scope = clienteScope(session);
      const cliente = await getPortalCliente(tx, scope);
      return { s, scope, cliente };
    });

    expect(result.scope).toEqual({
      empresaId: result.s.a.id,
      clienteId: result.s.c1.cliente.id,
    });
    expect(result.cliente).toMatchObject({
      id: result.s.c1.cliente.id,
      razonSocial: "Cliente Uno",
      nif: "B11111111",
    });
    // Sin tarifa en el portal.
    expect(result.cliente).not.toHaveProperty("tarifaHoraria");
    expect(result.cliente?.sedes.map((sede) => sede.id).sort()).toEqual(
      [result.s.c1.sede.id, result.s.c1.sede2.id].sort(),
    );
    const ids = result.cliente?.sedes.map((sede) => sede.id) ?? [];
    expect(ids).not.toContain(result.s.c2.sede.id);
    expect(ids).not.toContain(result.s.bc.sede.id);
  });

  it("una sede de C2, de otra empresa, inexistente o mal formada devuelve null (403 uniforme)", async () => {
    const result = await inRollback(async (tx) => {
      const s = await createPortalScenario(tx, uniqueSuffix());
      const { session } = await portalSessionForAna(tx, s);
      const scope = clienteScope(session);
      return {
        s,
        propia: await getPortalSede(tx, scope, s.c1.sede.id),
        propiaMayusculas: await getPortalSede(tx, scope, s.c1.sede2.id.toUpperCase()),
        otroCliente: await getPortalSede(tx, scope, s.c2.sede.id),
        otraEmpresa: await getPortalSede(tx, scope, s.bc.sede.id),
        inexistente: await getPortalSede(tx, scope, MISSING_ID),
        malFormada: await getPortalSede(tx, scope, "no-es-un-uuid"),
      };
    });

    expect(result.propia?.id).toBe(result.s.c1.sede.id);
    expect(result.propiaMayusculas?.id).toBe(result.s.c1.sede2.id);
    expect(result.otroCliente).toBeNull();
    expect(result.otraEmpresa).toBeNull();
    expect(result.inexistente).toBeNull();
    expect(result.malFormada).toBeNull();
  });

  it("un alcance con el cliente de otra empresa no devuelve nada (empresa y cliente van juntos)", async () => {
    const result = await inRollback(async (tx) => {
      const s = await createPortalScenario(tx, uniqueSuffix());
      // Alcance incoherente construido a mano: empresa A con el cliente de B.
      const scope = { empresaId: s.a.id, clienteId: s.bc.cliente.id };
      return {
        cliente: await getPortalCliente(tx, scope),
        sede: await getPortalSede(tx, scope, s.bc.sede.id),
      };
    });

    expect(result.cliente).toBeNull();
    expect(result.sede).toBeNull();
  });
});
