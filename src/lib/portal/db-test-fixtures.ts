import type { Prisma } from "@/generated/prisma/client";

/**
 * Datos de prueba de los tests `*.db.test.ts` del portal: dos empresas A y B;
 * en A, dos clientes C1 y C2 con sedes y contactos; en B, un cliente con una
 * sede. Solo se usa dentro de `inRollback` o con limpieza explícita.
 */

type Db = Prisma.TransactionClient;

export async function createPortalScenario(db: Db, suffix: string) {
  const plan = await db.plan.create({
    data: { nombre: `Plan portal ${suffix}`, importeMensual: "10.00" },
  });
  const crearEmpresa = (tag: string) =>
    db.empresa.create({
      data: {
        nombre: `Empresa portal ${tag} ${suffix}`,
        nif: `${tag}${suffix}`.toUpperCase(),
        emailFacturacion: `facturacion-${tag}-${suffix}@example.com`,
        planId: plan.id,
      },
    });
  const a = await crearEmpresa("pa");
  const b = await crearEmpresa("pb");

  const crearCliente = async (empresaId: string, razonSocial: string, nif: string) => {
    const cliente = await db.cliente.create({
      data: {
        empresaId,
        razonSocial,
        nif,
        direccionFacturacion: `Calle ${razonSocial} 1`,
        tarifaHoraria: "40.00",
      },
    });
    const sede = await db.sede.create({
      data: {
        empresaId,
        clienteId: cliente.id,
        nombre: `Sede ${razonSocial}`,
        direccion: `Polígono ${razonSocial}`,
      },
    });
    return { cliente, sede };
  };

  const c1 = await crearCliente(a.id, "Cliente Uno", "B11111111");
  const c1Sede2 = await db.sede.create({
    data: {
      empresaId: a.id,
      clienteId: c1.cliente.id,
      nombre: "Almacén Uno",
      direccion: "Calle Almacén 2",
    },
  });
  const c2 = await crearCliente(a.id, "Cliente Dos", "B22222222");
  const bc = await crearCliente(b.id, "Cliente B", "B33333333");

  const crearContacto = (
    empresaId: string,
    clienteId: string,
    nombre: string,
    email: string | null,
  ) =>
    db.contacto.create({
      data: {
        empresaId,
        clienteId,
        nombre,
        email,
        telefono: email ? null : "600123456",
      },
    });

  const ana = await crearContacto(a.id, c1.cliente.id, "Ana Uno", `ana-${suffix}@example.com`);
  const sinEmail = await crearContacto(a.id, c1.cliente.id, "Sin Email", null);
  const beto = await crearContacto(a.id, c2.cliente.id, "Beto Dos", `beto-${suffix}@example.com`);
  const bContacto = await crearContacto(b.id, bc.cliente.id, "Carla B", `carla-${suffix}@example.com`);

  return {
    plan,
    a,
    b,
    c1: { ...c1, sede2: c1Sede2, ana, sinEmail },
    c2: { ...c2, beto },
    bc: { ...bc, contacto: bContacto },
  };
}

export type PortalScenario = Awaited<ReturnType<typeof createPortalScenario>>;
