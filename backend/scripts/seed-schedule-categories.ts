import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const DEFAULT_CATEGORIES = [
  {
    name: "HABLEMOS DE FAMILIA",
    description: "Programa de conversación y consejo familiar.",
    color: "#dd6974",
    icon: "heart",
    keywords: "HABLEMOS DE FAMILIA",
    isVisible: true,
    sortOrder: 10,
  },
  {
    name: "HIMNO NACIONAL",
    description: "Himno de la República de Colombia.",
    color: "#e8af34",
    icon: "flag",
    keywords: "HIMNO NACIONAL",
    isVisible: true,
    sortOrder: 20,
  },
  {
    name: "JINGLE",
    description: "Identificación sonora de la emisora.",
    color: "#8b92a5",
    icon: "bell",
    keywords: "JINGLE",
    isVisible: false,
    sortOrder: 30,
  },
  {
    name: "JINGLES",
    description: "Identificación sonora de la emisora.",
    color: "#8b92a5",
    icon: "bell",
    keywords: "JINGLES",
    isVisible: false,
    sortOrder: 40,
  },
  {
    name: "LECTURA BIBLICA",
    description: "Lectura de la palabra de Dios.",
    color: "#6daa45",
    icon: "book",
    keywords: "LECTURA BIBLICA",
    isVisible: true,
    sortOrder: 50,
  },
  {
    name: "MÚSICA",
    description: "Música continua de la emisora.",
    color: "#4f98a3",
    icon: "music",
    keywords: "MUSICA",
    isVisible: false,
    sortOrder: 60,
  },
  {
    name: "NOTICIAS DE ISRAEL",
    description: "Información y actualidad de Israel.",
    color: "#4f98a3",
    icon: "news",
    keywords: "NOTICIAS DE ISRAEL",
    isVisible: true,
    sortOrder: 70,
  },
  {
    name: "PARA TI MUJER - MARIA MIRANDA",
    description: "Espacio dedicado a la mujer, con María Miranda.",
    color: "#a86fdf",
    icon: "sparkles",
    keywords: "PARA TI MUJER",
    isVisible: true,
    sortOrder: 80,
  },
  {
    name: "PREDICAS CONVENCION",
    description: "Predicaciones grabadas de convención.",
    color: "#e8883a",
    icon: "mic",
    keywords: "PREDICAS CONVENCION",
    isVisible: true,
    sortOrder: 90,
  },
  {
    name: "REV HUMBERTO HENAO",
    description: "Predicación del reverendo Humberto Henao.",
    color: "#4f98a3",
    icon: "user",
    keywords: "REV HUMBERTO HENAO",
    isVisible: true,
    sortOrder: 100,
  },
  {
    name: "REV JAVIER CARRASCAL",
    description: "Predicación del reverendo Javier Carrascal.",
    color: "#6daa45",
    icon: "user",
    keywords: "REV JAVIER CARRASCAL",
    isVisible: true,
    sortOrder: 110,
  },
  {
    name: "REV JOSÉ SOTO",
    description: "Predicación del reverendo José Soto.",
    color: "#a86fdf",
    icon: "user",
    keywords: "REV JOSÉ SOTO",
    isVisible: true,
    sortOrder: 120,
  },
  {
    name: "TU HISTORIA PREFERIDA",
    description: "Historias seleccionadas para la audiencia.",
    color: "#e8af34",
    icon: "star",
    keywords: "TU HISTORIA PREFERIDA",
    isVisible: true,
    sortOrder: 130,
  },
  {
    name: "UN MENSAJE A LA CONCIENCIA",
    description: "Reflexiones que tocan el corazón.",
    color: "#dd6974",
    icon: "message",
    keywords: "UN MENSAJE A LA CONCIENCIA",
    isVisible: true,
    sortOrder: 140,
  },
  {
    name: "CONTENIDO VARIADO",
    description: "Contenido variado de la emisora.",
    color: "#8b92a5",
    icon: "music",
    keywords: "CONTENIDO VARIADO",
    isVisible: false,
    sortOrder: 150,
  },
];

async function main(): Promise<void> {
  console.log("Seeding schedule categories...");

  for (const category of DEFAULT_CATEGORIES) {
    const existing = await prisma.scheduleCategory.findUnique({
      where: { name: category.name },
    });

    if (existing) {
      await prisma.scheduleCategory.update({
        where: { id: existing.id },
        data: category,
      });
      console.log("  Updated category: " + category.name);
      continue;
    }

    const created = await prisma.scheduleCategory.create({
      data: category,
    });
    console.log("  Created category: " + created.name + " (id: " + created.id + ")");
  }
}

main()
  .catch((err) => {
    console.error("Error seeding schedule categories:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
