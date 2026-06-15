import dotenv from "dotenv";
import { initializeInfisicalSecrets } from "../src/infisical";

dotenv.config();

async function bootstrap() {
  const infisicalInitialized = await initializeInfisicalSecrets();

  if (infisicalInitialized) {
    console.log("[Infisical] Secrets loaded successfully");
  } else {
    console.log("[Infisical] Not configured or failed.");
  }

  const { prisma } = await import("../src/lib/prisma");
  const { dispatchJobById } = await import("../src/jobs/jobDispatcher");

  async function getRandomJob(where: any = {}) {
    const count = await prisma.processingJob.count({
      where,
    });

    if (count === 0) {
      return null;
    }

    const skip = Math.floor(Math.random() * count);

    return prisma.processingJob.findFirst({
      where,
      skip,
      orderBy: {
        createdAt: "desc",
      },
    });
  }

  const [mode, value] = process.argv.slice(2);

  let job = null;

  switch (mode) {
    case "random":
      job = await getRandomJob();
      break;

    case "pending":
      job = await getRandomJob({
        status: "PENDING",
      });
      break;

    case "retrying":
      job = await getRandomJob({
        status: "RETRYING",
      });
      break;

    case "assigned":
      job = await getRandomJob({
        status: "ASSIGNED",
      });
      break;

    case "error":
      job = await getRandomJob({
        status: "ERROR",
      });
      break;

    case "abandoned":
      job = await getRandomJob({
        status: "ABANDONED",
      });
      break;

    case "id":
      if (!value) {
        throw new Error("Missing job id");
      }

      job = await prisma.processingJob.findUnique({
        where: {
          id: value,
        },
      });

      break;

    case "video":
      if (!value) {
        throw new Error("Missing videoId");
      }

      job = await prisma.processingJob.findFirst({
        where: {
          videoId: value,
        },
        orderBy: {
          createdAt: "desc",
        },
      });

      break;

    default:
      console.log(`
Usage:

random
pending
retrying
assigned
error
abandoned

id <jobId>

video <videoId>
`);
      return;
  }

  if (!job) {
    throw new Error("No matching job found");
  }

  console.log("");
  console.log("Selected job:");
  console.log(`ID: ${job.id}`);
  console.log(`Video: ${job.videoId}`);
  console.log(`Status: ${job.status}`);
  console.log("");

  await dispatchJobById(job.id);

  console.log("Job dispatched successfully");

  await prisma.$disconnect();
}

bootstrap().catch((err) => {
  console.error(err);
  process.exit(1);
});