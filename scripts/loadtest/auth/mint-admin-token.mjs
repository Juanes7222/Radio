import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const backendDir = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "backend");
const requireFromBackend = createRequire(join(backendDir, "package.json"));

const REQUIRED_PERMISSIONS = ["dashboard", "feedback", "youtube"];

function hasRequiredPermissions(user) {
  if (user.role === "SUPERADMIN" || user.role === "ADMIN") {
    return true;
  }
  try {
    const permissions = JSON.parse(user.permissions);
    return Array.isArray(permissions) && REQUIRED_PERMISSIONS.every((name) => permissions.includes(name));
  } catch {
    return false;
  }
}

async function main() {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET must be present in the radio-backend environment");
  }

  const { PrismaClient } = requireFromBackend("@prisma/client");
  const jwt = requireFromBackend("jsonwebtoken");
  const prisma = new PrismaClient();

  try {
    const users = await prisma.adminUser.findMany({ where: { isActive: true } });
    const user = users.find(hasRequiredPermissions);
    if (!user) {
      throw new Error("No active admin user has dashboard, feedback and youtube permissions");
    }
    console.error(`Minting a load-test token for ${user.email} (${user.role}).`);
    const token = jwt.sign(
      {
        sub: user.id,
        email: user.email,
        role: user.role,
        tv: user.tokenVersion,
        stationName: process.env.STATION_NAME ?? "Radio",
      },
      secret,
      { expiresIn: "1h" }
    );
    console.log(token);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
