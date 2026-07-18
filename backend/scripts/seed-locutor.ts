import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const DEFAULT_TEMPLATES = [
  {
    type: "hourly",
    name: "Aviso de Hora (Dinamico)",
    textTemplate: "Estas escuchando {{station_name}}, la hora en este momento es {{hour_text}}.",
    voice: "ef_dora",
    speed: 1.0,
    active: true,
  },
  {
    type: "hourly",
    name: "Aviso de Hora (Calido)",
    textTemplate: "Sigue en sintonia con {{station_name}}. En este momento, son las {{hour_text}}.",
    voice: "ef_dora",
    speed: 1.0,
    active: true,
  },
  {
    type: "hourly",
    name: "Aviso de Hora (Nocturno)",
    textTemplate: "Te acompanamos en {{station_name}}... Son las {{hour_text}}.",
    voice: "ef_dora",
    speed: 0.95,
    active: true,
  },
];

async function main(): Promise<void> {
  console.log("Seeding announcement templates...");

  for (const template of DEFAULT_TEMPLATES) {
    const existing = await prisma.announcementTemplate.findFirst({
      where: {
        type: template.type,
        name: template.name,
      },
    });

    if (existing) {
      await prisma.announcementTemplate.update({
        where: { id: existing.id },
        data: {
          textTemplate: template.textTemplate,
          voice: template.voice,
          speed: template.speed,
          active: template.active,
        },
      });
      console.log("  Updated template: " + template.name);
      continue;
    }

    const created = await prisma.announcementTemplate.create({
      data: template,
    });
    console.log("  Created template: " + created.name + " (id: " + created.id + ")");
  }

  const count = await prisma.announcementTemplate.count();
  console.log("Total templates in database: " + count);
}

main()
  .catch((err: Error) => {
    console.error("Seed failed: " + err.message);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
