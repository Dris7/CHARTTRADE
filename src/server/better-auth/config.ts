import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";

import { env } from "~/env";
import { db } from "~/server/db";

const githubConfigured =
  !!env.BETTER_AUTH_GITHUB_CLIENT_ID && !!env.BETTER_AUTH_GITHUB_CLIENT_SECRET;

export const auth = betterAuth({
  database: prismaAdapter(db, {
    provider: "sqlite",
  }),
  emailAndPassword: {
    enabled: true,
  },
  ...(githubConfigured
    ? {
        socialProviders: {
          github: {
            clientId: env.BETTER_AUTH_GITHUB_CLIENT_ID!,
            clientSecret: env.BETTER_AUTH_GITHUB_CLIENT_SECRET!,
            redirectURI: "http://localhost:3000/api/auth/callback/github",
          },
        },
      }
    : {}),
});

export type Session = typeof auth.$Infer.Session;
