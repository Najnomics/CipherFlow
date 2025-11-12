import { createPublicClient, http } from "viem";
import { baseSepolia } from "viem/chains";
import { z } from "zod";

const envSchema = z.object({
  RPC_URL: z.string().url().or(z.string().startsWith("http")),
});

const env = envSchema.parse(process.env);

const client = createPublicClient({
  chain: baseSepolia,
  transport: http(env.RPC_URL),
});

async function main() {
  const latestBlock = await client.getBlockNumber();
  console.log(`[listener] latest block: ${latestBlock}`);
}

void main();

