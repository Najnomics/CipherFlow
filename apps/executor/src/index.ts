import { z } from "zod";

const envSchema = z.object({
  LISTENER_URL: z.string().url().optional(),
});

const env = envSchema.parse(process.env);

async function main() {
  console.log("[executor] awaiting reveals, listener:", env.LISTENER_URL ?? "<not set>");
}

void main();
