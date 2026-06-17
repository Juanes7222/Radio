import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const DEFAULT_TEMPLATES = [
  {
    type: "hourly",
    name: "Aviso de Hora (predeterminado)",
    textTemplate:
      "{{station_name}} Son las {{hour_text}}",
    voice: "ef_dora",
    speed: 0.9,
    active: true,
  },
];

async function main() {
  console.log("Seeding announcement templates...");

  for (const template of DEFAULT_TEMPLATES) {
    const existing = await prisma.announcementTemplate.findFirst({
      where: { type: template.type, name: template.name },
    });

    if (existing) {
      console.log(`  Template already exists: ${template.name}`);
      continue;
    }

    const created = await prisma.announcementTemplate.create({
      data: template,
    });
    console.log(`  Created template: ${created.name} (id: ${created.id})`);
  }

  const count = await prisma.announcementTemplate.count();
  console.log(`Total templates in database: ${count}`);
}

main()
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
