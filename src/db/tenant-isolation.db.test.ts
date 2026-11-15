import { afterAll, describe, expect, it } from "vitest";
import {
  assertTenantAccess,
  TenantAccessError,
  TenantContextError,
  tenantFilter,
} from "./tenant";
import { disconnectDb } from "./client";
import { inRollback, uniqueSuffix } from "./db-test-utils";
import {
  listCompanyUsers,
  updateUserRolesInTransaction,
} from "@/lib/empresa/usuarios";
import { updateCompanyBillingSettings } from "@/lib/empresa/configuracion";
import { parseBillingSettingsForm } from "@/lib/empresa/configuracion-validation";
import {
  createClienteInTransaction,
  getClienteDetalle,
  listClientes,
  updateCliente,
  upsertContacto,
  upsertSede,
} from "@/lib/clientes/clientes";
import {
  cancelarAvisoInTransaction,
  countAvisosPorVista,
  createAvisoInTransaction,
  getAvisoDetalle,
  getClienteParaAviso,
  listAvisos,
  listBolsa,
  validarAvisoInTransaction,
} from "@/lib/avisos/avisos";
import { createPortalScenario } from "@/lib/portal/db-test-fixtures";
import {
  invitePortalContactInTransaction,
  listPortalAccess,
} from "@/lib/portal/invitaciones";

afterAll(async () => {
  await disconnectDb();
});

describe("aislamiento multiempresa", () => {
  it("tenantFilter solo devuelve usuarios de la empresa indicada", async () => {
    const suffix = uniqueSuffix();

    const { empresaA, empresaB, usuariosA, usuariosB, superadmin } =
      await inRollback(async (tx) => {
        const plan = await tx.plan.create({
          data: { nombre: `Plan aislamiento ${suffix}`, importeMensual: "10.00" },
        });

        const empresaA = await tx.empresa.create({
          data: {
            nombre: `Empresa A ${suffix}`,
            nif: `A${suffix.toUpperCase()}`,
            emailFacturacion: `facturacion-a-${suffix}@example.com`,
            planId: plan.id,
          },
        });
        const empresaB = await tx.empresa.create({
          data: {
            nombre: `Empresa B ${suffix}`,
            nif: `B${suffix.toUpperCase()}`,
            emailFacturacion: `facturacion-b-${suffix}@example.com`,
            planId: plan.id,
          },
        });

        for (const [indice, empresaId] of [
          [1, empresaA.id],
          [2, empresaA.id],
          [3, empresaB.id],
        ] as const) {
          await tx.usuario.create({
            data: {
              empresaId,
              email: `usuario-${indice}-${suffix}@example.com`,
              nombre: `Usuario ${indice}`,
            },
          });
        }

        const superadmin = await tx.usuario.create({
          data: {
            empresaId: null,
            email: `superadmin-${suffix}@example.com`,
            nombre: "Superadmin",
            esSuperadmin: true,
          },
        });

        const usuariosA = await tx.usuario.findMany({
          where: tenantFilter(empresaA.id),
          orderBy: { email: "asc" },
        });
        const usuariosB = await tx.usuario.findMany({
          where: tenantFilter(empresaB.id),
          orderBy: { email: "asc" },
        });

        return { empresaA, empresaB, usuariosA, usuariosB, superadmin };
      });

    expect(usuariosA).toHaveLength(2);
    expect(usuariosA.every((usuario) => usuario.empresaId === empresaA.id)).toBe(
      true,
    );

    expect(usuariosB).toHaveLength(1);
    expect(usuariosB[0]?.empresaId).toBe(empresaB.id);

    expect(usuariosA.some((usuario) => usuario.id === superadmin.id)).toBe(false);
    expect(usuariosB.some((usuario) => usuario.id === superadmin.id)).toBe(false);
  });

  it("assertTenantAccess bloquea un recurso de otra empresa", async () => {
    const suffix = uniqueSuffix();

    const { empresaA, usuarioB } = await inRollback(async (tx) => {
      const plan = await tx.plan.create({
        data: { nombre: `Plan acceso ${suffix}`, importeMensual: "10.00" },
      });

      const empresaA = await tx.empresa.create({
        data: {
          nombre: `Empresa acceso A ${suffix}`,
          nif: `AA${suffix.toUpperCase()}`,
          emailFacturacion: `facturacion-aa-${suffix}@example.com`,
          planId: plan.id,
        },
      });
      const empresaB = await tx.empresa.create({
        data: {
          nombre: `Empresa acceso B ${suffix}`,
          nif: `BB${suffix.toUpperCase()}`,
          emailFacturacion: `facturacion-bb-${suffix}@example.com`,
          planId: plan.id,
        },
      });

      const usuarioB = await tx.usuario.create({
        data: {
          empresaId: empresaB.id,
          email: `usuario-b-${suffix}@example.com`,
          nombre: "Usuario B",
        },
      });

      return { empresaA, usuarioB };
    });

    expect(() => assertTenantAccess(usuarioB.empresaId, empresaA.id)).toThrow(
      TenantAccessError,
    );
  });

  it("un administrador de A no lista ni edita usuarios de B", async () => {
    const suffix = uniqueSuffix();

    const result = await inRollback(async (tx) => {
      const plan = await tx.plan.create({
        data: { nombre: `Plan roles aislamiento ${suffix}`, importeMensual: "10.00" },
      });
      const empresaA = await tx.empresa.create({
        data: {
          nombre: `Empresa roles A ${suffix}`,
          nif: `RA${suffix.toUpperCase()}`,
          emailFacturacion: `facturacion-ra-${suffix}@example.com`,
          planId: plan.id,
        },
      });
      const empresaB = await tx.empresa.create({
        data: {
          nombre: `Empresa roles B ${suffix}`,
          nif: `RB${suffix.toUpperCase()}`,
          emailFacturacion: `facturacion-rb-${suffix}@example.com`,
          planId: plan.id,
        },
      });
      const adminA = await tx.usuario.create({
        data: {
          empresaId: empresaA.id,
          email: `admin-ra-${suffix}@example.com`,
          nombre: "Admin A",
          roles: ["ADMINISTRADOR"],
        },
      });
      const tecnicoB = await tx.usuario.create({
        data: {
          empresaId: empresaB.id,
          email: `tecnico-rb-${suffix}@example.com`,
          nombre: "Técnico B",
          roles: ["TECNICO"],
        },
      });

      const listadoA = await listCompanyUsers(tx, empresaA.id);
      const update = await updateUserRolesInTransaction(tx, {
        empresaId: empresaA.id,
        actorId: adminA.id,
        usuarioId: tecnicoB.id,
        roles: ["ADMINISTRADOR"],
      });
      const tecnicoBDespues = await tx.usuario.findUniqueOrThrow({
        where: { id: tecnicoB.id },
      });

      return { adminA, tecnicoB, listadoA, update, tecnicoBDespues };
    });

    expect(result.listadoA.map((usuario) => usuario.id)).toEqual([
      result.adminA.id,
    ]);
    expect(result.update).toEqual({ ok: false, error: "no-encontrado" });
    expect(result.tecnicoBDespues.roles).toEqual(["TECNICO"]);
  });

  it("un administrador de A que guarda la configuración no modifica B", async () => {
    const suffix = uniqueSuffix();

    const result = await inRollback(async (tx) => {
      const plan = await tx.plan.create({
        data: { nombre: `Plan facturación aislamiento ${suffix}`, importeMensual: "10.00" },
      });
      const empresaA = await tx.empresa.create({
        data: {
          nombre: `Empresa facturación A ${suffix}`,
          nif: `FA${suffix.toUpperCase()}`,
          emailFacturacion: `facturacion-fa-${suffix}@example.com`,
          planId: plan.id,
        },
      });
      const empresaB = await tx.empresa.create({
        data: {
          nombre: `Empresa facturación B ${suffix}`,
          nif: `FB${suffix.toUpperCase()}`,
          emailFacturacion: `facturacion-fb-${suffix}@example.com`,
          planId: plan.id,
          serieFactura: "B",
          tarifaHoraria: "30.00",
        },
      });

      // El formulario intenta apuntar a B: el campo se ignora y la escritura
      // usa solo el empresaId de la sesión (A).
      const data = new FormData();
      data.set("empresaId", empresaB.id);
      data.set("id", empresaB.id);
      data.set("nombre", "Nombre nuevo A");
      data.set("nif", "12345678Z");
      data.set("direccionFiscal", "Calle A 1");
      data.set("emailFacturacion", "a@example.com");
      data.set("serieFactura", "A");
      data.set("tarifaHoraria", "50");
      data.set("modoFiscal", "NO_VERIFACTU");
      const parsed = parseBillingSettingsForm(data);
      if (!parsed.ok) {
        throw new Error(parsed.error);
      }

      // NIF que no colisiona con datos demo: se reutiliza el de A normalizado.
      const values = { ...parsed.value, nif: empresaA.nif };
      const update = await updateCompanyBillingSettings(tx, empresaA.id, values);
      const aDespues = await tx.empresa.findUniqueOrThrow({ where: { id: empresaA.id } });
      const bDespues = await tx.empresa.findUniqueOrThrow({ where: { id: empresaB.id } });

      return { empresaB, update, aDespues, bDespues };
    });

    expect(result.update).toEqual({ ok: true });
    expect(result.aDespues.nombre).toBe("Nombre nuevo A");
    expect(result.aDespues.serieFactura).toBe("A");
    expect(result.bDespues.nombre).toBe(result.empresaB.nombre);
    expect(result.bDespues.nif).toBe(result.empresaB.nif);
    expect(result.bDespues.serieFactura).toBe("B");
    expect(result.bDespues.tarifaHoraria?.toFixed(2)).toBe("30.00");
  });

  it("la oficina de A no lista, lee ni edita clientes, sedes ni contactos de B", async () => {
    const suffix = uniqueSuffix();

    const result = await inRollback(async (tx) => {
      const plan = await tx.plan.create({
        data: { nombre: `Plan clientes aislamiento ${suffix}`, importeMensual: "10.00" },
      });
      const createEmpresa = (tag: string) =>
        tx.empresa.create({
          data: {
            nombre: `Empresa ${tag} ${suffix}`,
            nif: `${tag}${suffix.toUpperCase()}`,
            emailFacturacion: `facturacion-${tag.toLowerCase()}-${suffix}@example.com`,
            planId: plan.id,
          },
        });
      const empresaA = await createEmpresa("CA");
      const empresaB = await createEmpresa("CB");
      const nuevo = (razonSocial: string) => ({
        cliente: {
          razonSocial,
          nif: "B12345678",
          direccionFacturacion: "Dirección",
          tarifaHoraria: null,
        },
        sede: { nombre: "Sede", direccion: "Dirección sede" },
        contacto: { nombre: "Contacto", telefono: "600000000", email: null },
        contactoEnSede: true,
      });
      const clienteA = await createClienteInTransaction(tx, empresaA.id, nuevo("Cliente A"));
      const clienteB = await createClienteInTransaction(tx, empresaB.id, nuevo("Cliente B"));

      if (!clienteA.ok || !clienteB.ok) {
        throw new Error("alta");
      }

      const sedeB = await tx.sede.findFirstOrThrow({ where: { clienteId: clienteB.clienteId } });
      const contactoB = await tx.contacto.findFirstOrThrow({
        where: { clienteId: clienteB.clienteId },
      });
      const a = empresaA.id;

      const listadoA = await listClientes(tx, a);
      const detalleB = await getClienteDetalle(tx, a, clienteB.clienteId);
      const updateB = await updateCliente(tx, a, clienteB.clienteId, {
        razonSocial: "Hackeado",
        nif: "B12345678",
        direccionFacturacion: "X",
        tarifaHoraria: null,
      });
      const nuevaSedeEnB = await upsertSede(tx, a, {
        clienteId: clienteB.clienteId,
        values: { nombre: "X", direccion: "X" },
      });
      const editarSedeB = await upsertSede(tx, a, {
        clienteId: clienteA.clienteId,
        sedeId: sedeB.id,
        values: { nombre: "X", direccion: "X" },
      });
      const editarContactoB = await upsertContacto(tx, a, {
        clienteId: clienteA.clienteId,
        contactoId: contactoB.id,
        values: { nombre: "X", telefono: "600000001", email: null, sedeId: null },
      });
      const contactoConSedeB = await upsertContacto(tx, a, {
        clienteId: clienteA.clienteId,
        values: { nombre: "X", telefono: "600000001", email: null, sedeId: sedeB.id },
      });

      const despuesB = await getClienteDetalle(tx, empresaB.id, clienteB.clienteId);

      return {
        listadoA,
        clienteAId: clienteA.clienteId,
        detalleB,
        updateB,
        nuevaSedeEnB,
        editarSedeB,
        editarContactoB,
        contactoConSedeB,
        despuesB,
      };
    });

    expect(result.listadoA.map((cliente) => cliente.id)).toEqual([result.clienteAId]);
    expect(result.detalleB).toBeNull();
    expect(result.updateB).toEqual({ ok: false, error: "cliente-no-encontrado" });
    expect(result.nuevaSedeEnB).toEqual({ ok: false, error: "cliente-no-encontrado" });
    expect(result.editarSedeB).toEqual({ ok: false, error: "no-encontrado" });
    expect(result.editarContactoB).toEqual({ ok: false, error: "no-encontrado" });
    expect(result.contactoConSedeB).toEqual({ ok: false, error: "sede" });
    expect(result.despuesB?.razonSocial).toBe("Cliente B");
    expect(result.despuesB?.sedes).toEqual([
      expect.objectContaining({ nombre: "Sede", direccion: "Dirección sede" }),
    ]);
    expect(result.despuesB?.contactos).toEqual([
      expect.objectContaining({ nombre: "Contacto", telefono: "600000000" }),
    ]);
  });

  it("la oficina de A no lista, lee, crea, valida, cancela ni ve en su bolsa avisos de B", async () => {
    const suffix = uniqueSuffix();

    const result = await inRollback(async (tx) => {
      const plan = await tx.plan.create({
        data: { nombre: `Plan avisos aislamiento ${suffix}`, importeMensual: "10.00" },
      });
      const preparar = async (tag: string) => {
        const empresa = await tx.empresa.create({
          data: {
            nombre: `Empresa ${tag} ${suffix}`,
            nif: `${tag}${suffix.toUpperCase()}`,
            emailFacturacion: `facturacion-${tag.toLowerCase()}-${suffix}@example.com`,
            planId: plan.id,
          },
        });
        const usuario = await tx.usuario.create({
          data: {
            empresaId: empresa.id,
            email: `oficina-${tag.toLowerCase()}-${suffix}@example.com`,
            nombre: `Oficina ${tag}`,
            roles: ["OFICINA"],
          },
        });
        const cliente = await createClienteInTransaction(tx, empresa.id, {
          cliente: {
            razonSocial: `Cliente ${tag}`,
            nif: "B12345678",
            direccionFacturacion: "Dirección",
            tarifaHoraria: null,
          },
          sede: { nombre: "Sede", direccion: "Dirección sede" },
          contacto: { nombre: "Contacto", telefono: "600000000", email: null },
          contactoEnSede: false,
        });

        if (!cliente.ok) {
          throw new Error("alta");
        }

        const sede = await tx.sede.findFirstOrThrow({ where: { clienteId: cliente.clienteId } });
        const contacto = await tx.contacto.findFirstOrThrow({
          where: { clienteId: cliente.clienteId },
        });
        const aviso = await createAvisoInTransaction(tx, empresa.id, usuario.id, {
          clienteId: cliente.clienteId,
          sedeId: sede.id,
          contactoId: contacto.id,
          descripcion: `Avería ${tag}`,
          prioridad: "URGENTE",
        });

        if (!aviso.ok) {
          throw new Error(aviso.error);
        }

        return { empresa, usuario, clienteId: cliente.clienteId, sede, contacto, avisoId: aviso.avisoId };
      };

      const a = await preparar("AA");
      const b = await preparar("AB");
      const crearEnA = (values: { clienteId: string; sedeId: string; contactoId: string }) =>
        createAvisoInTransaction(tx, a.empresa.id, a.usuario.id, {
          ...values,
          descripcion: "Intento",
          prioridad: "NORMAL",
        });

      return {
        a,
        listadoA: await listAvisos(tx, a.empresa.id),
        detalleB: await getAvisoDetalle(tx, a.empresa.id, b.avisoId),
        clienteB: await getClienteParaAviso(tx, a.empresa.id, b.clienteId),
        conClienteB: await crearEnA({
          clienteId: b.clienteId,
          sedeId: b.sede.id,
          contactoId: b.contacto.id,
        }),
        conSedeB: await crearEnA({
          clienteId: a.clienteId,
          sedeId: b.sede.id,
          contactoId: a.contacto.id,
        }),
        conContactoB: await crearEnA({
          clienteId: a.clienteId,
          sedeId: a.sede.id,
          contactoId: b.contacto.id,
        }),
        avisosB: await tx.aviso.count({ where: { empresaId: b.empresa.id } }),
        avisosA: await tx.aviso.count({ where: { empresaId: a.empresa.id } }),
        ...(await (async () => {
          // aviso-validation-pool: A no valida, no cancela ni ve en su bolsa
          // avisos de B (uno NUEVO y otro ya en la bolsa de B).
          const nuevoB = b.avisoId;
          const pendienteB = await createAvisoInTransaction(tx, b.empresa.id, b.usuario.id, {
            clienteId: b.clienteId,
            sedeId: b.sede.id,
            contactoId: b.contacto.id,
            descripcion: "Avería B en bolsa",
            prioridad: "ALTA",
          });

          if (!pendienteB.ok) {
            throw new Error(pendienteB.error);
          }

          const validadoEnB = await validarAvisoInTransaction(
            tx,
            b.empresa.id,
            b.usuario.id,
            pendienteB.avisoId,
          );
          const antes = await tx.aviso.findMany({
            where: { empresaId: b.empresa.id },
            orderBy: { id: "asc" },
          });
          const validarBDesdeA = await validarAvisoInTransaction(
            tx,
            a.empresa.id,
            a.usuario.id,
            nuevoB,
          );
          const cancelarNuevoBDesdeA = await cancelarAvisoInTransaction(
            tx,
            a.empresa.id,
            a.usuario.id,
            { avisoId: nuevoB, motivo: "Intento" },
          );
          const cancelarPendienteBDesdeA = await cancelarAvisoInTransaction(
            tx,
            a.empresa.id,
            a.usuario.id,
            { avisoId: pendienteB.avisoId, motivo: "Intento" },
          );
          const despues = await tx.aviso.findMany({
            where: { empresaId: b.empresa.id },
            orderBy: { id: "asc" },
          });
          return {
            validadoEnB,
            validarBDesdeA,
            cancelarNuevoBDesdeA,
            cancelarPendienteBDesdeA,
            avisosBSinCambios: JSON.stringify(antes) === JSON.stringify(despues),
            bolsaA: await listBolsa(tx, a.empresa.id),
            bolsaB: (await listBolsa(tx, b.empresa.id)).map((aviso) => aviso.id),
            pendienteBId: pendienteB.avisoId,
            recuentoA: await countAvisosPorVista(tx, a.empresa.id),
          };
        })()),
      };
    });

    expect(result.validadoEnB.ok).toBe(true);
    expect(result.validarBDesdeA).toEqual({ ok: false, error: "no-encontrado" });
    expect(result.cancelarNuevoBDesdeA).toEqual({ ok: false, error: "no-encontrado" });
    expect(result.cancelarPendienteBDesdeA).toEqual({ ok: false, error: "no-encontrado" });
    expect(result.avisosBSinCambios).toBe(true);
    expect(result.bolsaA).toEqual([]);
    expect(result.bolsaB).toEqual([result.pendienteBId]);
    expect(result.recuentoA).toEqual({ todos: 1, "por-validar": 1, bolsa: 0, cancelados: 0 });

    expect(result.listadoA.map((aviso) => aviso.id)).toEqual([result.a.avisoId]);
    expect(result.detalleB).toBeNull();
    expect(result.clienteB).toBeNull();
    expect(result.conClienteB).toEqual({ ok: false, error: "no-encontrado" });
    expect(result.conSedeB).toEqual({ ok: false, error: "sede" });
    expect(result.conContactoB).toEqual({ ok: false, error: "contacto" });
    expect(result.avisosA).toBe(1);
    expect(result.avisosB).toBe(1);
  });

  it("la oficina de A no invita al portal a contactos de B ni ve sus accesos", async () => {
    const result = await inRollback(async (tx) => {
      const s = await createPortalScenario(tx, uniqueSuffix());
      const invitadoB = await invitePortalContactInTransaction(tx, {
        empresaId: s.b.id,
        clienteId: s.bc.cliente.id,
        contactoId: s.bc.contacto.id,
        now: new Date("2026-11-15T10:00:00.000Z"),
      });
      const antes = await tx.usuario.count({ where: { empresaId: s.b.id } });
      const desdeA = await invitePortalContactInTransaction(tx, {
        empresaId: s.a.id,
        clienteId: s.bc.cliente.id,
        contactoId: s.bc.contacto.id,
        now: new Date("2026-11-15T11:00:00.000Z"),
      });
      const despues = await tx.usuario.count({ where: { empresaId: s.b.id } });
      const accesosDesdeA = await listPortalAccess(
        tx,
        s.a.id,
        s.bc.cliente.id,
        new Date("2026-11-15T11:00:00.000Z"),
      );
      const usuariosA = await listCompanyUsers(tx, s.a.id);
      return { invitadoB, desdeA, antes, despues, accesosDesdeA, usuariosA };
    });

    expect(result.invitadoB.ok).toBe(true);
    expect(result.desdeA).toEqual({ ok: false, error: "no-encontrado" });
    expect(result.despues).toBe(result.antes);
    expect(result.accesosDesdeA.size).toBe(0);
    expect(result.usuariosA).toEqual([]);
  });

  it("requireEmpresaId impide consultar sin contexto de empresa", () => {
    expect(() => tenantFilter(undefined)).toThrow(TenantContextError);
    expect(() => tenantFilter("")).toThrow(TenantContextError);
  });
});
