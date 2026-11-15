import type {
  Cliente,
  Contacto,
  PrioridadAviso,
  Prisma,
  Sede,
  Usuario,
} from "../../src/generated/prisma/client";

/**
 * Datos de presentación de la demo pública (demo-deployment), todos ficticios:
 * tres clientes de Empresa Demo con sedes y contactos, un usuario de cliente
 * con acceso al portal y seis avisos NUEVO/OFICINA con las tres prioridades.
 *
 * Idempotente sin índices nuevos: clientes por (empresa, NIF), sedes por
 * (cliente, nombre), contactos por (cliente, email) y avisos por
 * (cliente, descripción). Una segunda ejecución actualiza en lugar de duplicar.
 * Los avisos solo nacen NUEVO con origen OFICINA (no se crean otros estados).
 */

type SedeSeed = { nombre: string; direccion: string };
type ContactoSeed = {
  nombre: string;
  email: string;
  telefono: string;
  /** Nombre de la sede, o null si el contacto es de todo el cliente. */
  sede: string | null;
};
type AvisoSeed = {
  sede: string;
  contactoEmail: string;
  descripcion: string;
  prioridad: PrioridadAviso;
};
type ClienteSeed = {
  razonSocial: string;
  nif: string;
  direccionFacturacion: string;
  tarifaHoraria: string | null;
  sedes: SedeSeed[];
  contactos: ContactoSeed[];
  avisos: AvisoSeed[];
};

export const PORTAL_CLIENTE_NIF = "H28000001";

export function clientesPresentacion(clienteEmail: string): ClienteSeed[] {
  return [
    {
      razonSocial: "Comunidad de Propietarios Río Tajo",
      nif: PORTAL_CLIENTE_NIF,
      direccionFacturacion: "Paseo del Río Tajo 12, 45004 Toledo",
      tarifaHoraria: null,
      sedes: [
        { nombre: "Portal 1", direccion: "Paseo del Río Tajo 12, 45004 Toledo" },
        { nombre: "Garaje comunitario", direccion: "Calle Ribera 3, 45004 Toledo" },
      ],
      contactos: [
        {
          nombre: "Lucía Ferrer (presidenta)",
          email: clienteEmail,
          telefono: "600 100 200",
          sede: null,
        },
        {
          nombre: "Andrés Molina (conserje)",
          email: "conserje.riotajo@demo.local",
          telefono: "600 100 201",
          sede: "Portal 1",
        },
      ],
      avisos: [
        {
          sede: "Portal 1",
          contactoEmail: "conserje.riotajo@demo.local",
          descripcion:
            "El ascensor se detiene entre la planta 2 y la 3 y hace un ruido metálico.",
          prioridad: "URGENTE",
        },
        {
          sede: "Garaje comunitario",
          contactoEmail: clienteEmail,
          descripcion:
            "Tres luminarias del garaje no encienden en la zona de plazas 20 a 30.",
          prioridad: "NORMAL",
        },
      ],
    },
    {
      razonSocial: "Hotel Mirador del Parque",
      nif: "B87654321",
      direccionFacturacion: "Avenida del Parque 45, 28009 Madrid",
      tarifaHoraria: "52.00",
      sedes: [
        { nombre: "Edificio principal", direccion: "Avenida del Parque 45, 28009 Madrid" },
      ],
      contactos: [
        {
          nombre: "Marta Ruiz (mantenimiento)",
          email: "mantenimiento.mirador@demo.local",
          telefono: "910 000 111",
          sede: null,
        },
      ],
      avisos: [
        {
          sede: "Edificio principal",
          contactoEmail: "mantenimiento.mirador@demo.local",
          descripcion:
            "La climatización de las habitaciones 301 a 310 no enfría desde esta mañana.",
          prioridad: "ALTA",
        },
        {
          sede: "Edificio principal",
          contactoEmail: "mantenimiento.mirador@demo.local",
          descripcion:
            "Revisión de la puerta automática de la entrada, que tarda en abrir.",
          prioridad: "NORMAL",
        },
      ],
    },
    {
      razonSocial: "Clínica Dental Sonrisas",
      nif: "B11223344",
      direccionFacturacion: "Calle Alcalá 200, 28028 Madrid",
      tarifaHoraria: null,
      sedes: [
        { nombre: "Clínica Alcalá", direccion: "Calle Alcalá 200, 28028 Madrid" },
        { nombre: "Clínica Goya", direccion: "Calle Goya 15, 28001 Madrid" },
      ],
      contactos: [
        {
          nombre: "Dr. Pablo Serrano",
          email: "direccion.sonrisas@demo.local",
          telefono: "915 555 010",
          sede: null,
        },
        {
          nombre: "Elena Campos (recepción Goya)",
          email: "goya.sonrisas@demo.local",
          telefono: "915 555 020",
          sede: "Clínica Goya",
        },
      ],
      avisos: [
        {
          sede: "Clínica Goya",
          contactoEmail: "goya.sonrisas@demo.local",
          descripcion:
            "El compresor de aire del gabinete 2 salta el diferencial al arrancar.",
          prioridad: "URGENTE",
        },
        {
          sede: "Clínica Alcalá",
          contactoEmail: "direccion.sonrisas@demo.local",
          descripcion:
            "Fuga de agua bajo el lavabo del aseo de pacientes.",
          prioridad: "ALTA",
        },
      ],
    },
  ];
}

export type SeedPresentacionConfig = {
  empresaId: string;
  /** Usuario de oficina que figura como autor de los avisos. */
  creadoPorId: string;
  clienteEmail: string;
  clienteNombre: string;
  clientePasswordHash: string;
};

export type SeedPresentacionResult = {
  clientes: Cliente[];
  sedes: Sede[];
  contactos: Contacto[];
  avisos: number;
  usuarioCliente: Usuario;
};

export async function seedPresentacion(
  tx: Prisma.TransactionClient,
  config: SeedPresentacionConfig,
): Promise<SeedPresentacionResult> {
  const { empresaId } = config;
  const clientes: Cliente[] = [];
  const sedes: Sede[] = [];
  const contactos: Contacto[] = [];
  let avisos = 0;
  let contactoPortal: Contacto | null = null;
  let clientePortal: Cliente | null = null;

  for (const datos of clientesPresentacion(config.clienteEmail)) {
    const cliente = await tx.cliente.upsert({
      where: { empresaId_nif: { empresaId, nif: datos.nif } },
      update: {
        razonSocial: datos.razonSocial,
        direccionFacturacion: datos.direccionFacturacion,
        tarifaHoraria: datos.tarifaHoraria,
      },
      create: {
        empresaId,
        razonSocial: datos.razonSocial,
        nif: datos.nif,
        direccionFacturacion: datos.direccionFacturacion,
        tarifaHoraria: datos.tarifaHoraria,
      },
    });
    clientes.push(cliente);

    const sedesPorNombre = new Map<string, Sede>();
    for (const sedeSeed of datos.sedes) {
      const existente = await tx.sede.findFirst({
        where: { empresaId, clienteId: cliente.id, nombre: sedeSeed.nombre },
      });
      const sede = existente
        ? await tx.sede.update({
            where: { id: existente.id },
            data: { direccion: sedeSeed.direccion },
          })
        : await tx.sede.create({
            data: {
              empresaId,
              clienteId: cliente.id,
              nombre: sedeSeed.nombre,
              direccion: sedeSeed.direccion,
            },
          });
      sedesPorNombre.set(sede.nombre, sede);
      sedes.push(sede);
    }

    const contactosPorEmail = new Map<string, Contacto>();
    for (const contactoSeed of datos.contactos) {
      const sedeId = contactoSeed.sede
        ? requireFromMap(sedesPorNombre, contactoSeed.sede, "sede").id
        : null;
      const existente = await tx.contacto.findFirst({
        where: { empresaId, clienteId: cliente.id, email: contactoSeed.email },
      });
      const contacto = existente
        ? await tx.contacto.update({
            where: { id: existente.id },
            data: {
              nombre: contactoSeed.nombre,
              telefono: contactoSeed.telefono,
              sedeId,
            },
          })
        : await tx.contacto.create({
            data: {
              empresaId,
              clienteId: cliente.id,
              sedeId,
              nombre: contactoSeed.nombre,
              telefono: contactoSeed.telefono,
              email: contactoSeed.email,
            },
          });
      contactosPorEmail.set(contactoSeed.email, contacto);
      contactos.push(contacto);

      if (contactoSeed.email === config.clienteEmail) {
        contactoPortal = contacto;
        clientePortal = cliente;
      }
    }

    for (const avisoSeed of datos.avisos) {
      const sede = requireFromMap(sedesPorNombre, avisoSeed.sede, "sede");
      const contacto = requireFromMap(
        contactosPorEmail,
        avisoSeed.contactoEmail,
        "contacto",
      );
      // Misma regla que src/lib/avisos/avisos.ts: contacto del cliente entero
      // o de la sede del aviso.
      if (contacto.sedeId !== null && contacto.sedeId !== sede.id) {
        throw new Error(
          `El contacto del aviso «${avisoSeed.descripcion}» no es de su sede.`,
        );
      }

      const existente = await tx.aviso.findFirst({
        where: {
          empresaId,
          clienteId: cliente.id,
          descripcion: avisoSeed.descripcion,
        },
        select: { id: true },
      });

      if (existente) {
        await tx.aviso.update({
          where: { id: existente.id },
          data: {
            sedeId: sede.id,
            contactoId: contacto.id,
            prioridad: avisoSeed.prioridad,
          },
        });
      } else {
        await tx.aviso.create({
          data: {
            empresaId,
            clienteId: cliente.id,
            sedeId: sede.id,
            contactoId: contacto.id,
            descripcion: avisoSeed.descripcion,
            prioridad: avisoSeed.prioridad,
            origen: "OFICINA",
            estado: "NUEVO",
            creadoPorId: config.creadoPorId,
          },
        });
      }
      avisos += 1;
    }
  }

  if (!contactoPortal || !clientePortal) {
    throw new Error("No se encontró el contacto del usuario de cliente.");
  }

  const usuarioCliente = await tx.usuario.upsert({
    where: { email: config.clienteEmail },
    update: {
      nombre: config.clienteNombre,
      empresaId,
      clienteId: clientePortal.id,
      contactoId: contactoPortal.id,
      passwordHash: config.clientePasswordHash,
      estado: "ACTIVO",
      esSuperadmin: false,
      roles: [],
    },
    create: {
      nombre: config.clienteNombre,
      email: config.clienteEmail,
      empresaId,
      clienteId: clientePortal.id,
      contactoId: contactoPortal.id,
      passwordHash: config.clientePasswordHash,
      roles: [],
    },
  });

  return { clientes, sedes, contactos, avisos, usuarioCliente };
}

function requireFromMap<T>(map: Map<string, T>, key: string, label: string): T {
  const value = map.get(key);
  if (!value) {
    throw new Error(`Datos de presentación incoherentes: falta ${label} «${key}».`);
  }
  return value;
}
