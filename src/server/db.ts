import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { readReplicas } from "@prisma/extension-read-replicas";

declare global {
  var prisma: PrismaClient | undefined;
}

function createPrismaClient(): PrismaClient {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });

  let client = new PrismaClient({ adapter, log: ["error"] });

  if (process.env.DATABASE_REPLICA_URL) {
    const replicaAdapter = new PrismaPg({
      connectionString: process.env.DATABASE_REPLICA_URL,
    });
    const replicaClient = new PrismaClient({
      adapter: replicaAdapter,
      log: ["error"],
    });

    client = client.$extends(
      readReplicas({ replicas: [replicaClient] }),
    ) as unknown as PrismaClient;
  }

  return client;
}

export const db: PrismaClient = globalThis.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalThis.prisma = db;
}

export async function safeQuery<T>(
  queryFn: () => Promise<T>,
): Promise<T | null> {
  try {
    return await queryFn();
  } catch (error) {
    console.error("Database query error:", error);
    return null;
  }
}
