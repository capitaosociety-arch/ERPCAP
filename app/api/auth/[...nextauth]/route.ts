import NextAuth, { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "../../../../lib/prisma";

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "E-mail", type: "email", placeholder: "admin@mrts.com" },
        password: { label: "Senha", type: "password" }
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          throw new Error("Dados inválidos");
        }
        const user = await prisma.user.findUnique({
          where: { email: credentials.email }
        }) as any;
        if (!user || user.isActive === false) {
          throw new Error("Usuário não encontrado ou inativo");
        }
        const isValid = await bcrypt.compare(credentials.password, user.password);
        if (!isValid) {
          throw new Error("Senha incorreta");
        }
        return {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          permDashboard: user.permDashboard,
          permPDV: user.permPDV,
          permComandas: user.permComandas,
          permProducts: user.permProducts,
          permStock: user.permStock,
          permCustomers: user.permCustomers,
          permFinance: user.permFinance,
          permUsers: user.permUsers
        };
      }
    })
  ],
  callbacks: {
    async jwt({ token, user }: any) {
      if (user) {
        token.role = user.role;
        token.id = user.id;
        token.permDashboard = user.permDashboard;
        token.permPDV = user.permPDV;
        token.permComandas = user.permComandas;
        token.permProducts = user.permProducts;
        token.permStock = user.permStock;
        token.permCustomers = user.permCustomers;
        token.permFinance = user.permFinance;
        token.permUsers = user.permUsers;
      }
      return token;
    },
    async session({ session, token }: any) {
      if (token) {
        session.user = {
          ...session.user,
          id: token.id,
          role: token.role,
          permDashboard: token.permDashboard,
          permPDV: token.permPDV,
          permComandas: token.permComandas,
          permProducts: token.permProducts,
          permStock: token.permStock,
          permCustomers: token.permCustomers,
          permFinance: token.permFinance,
          permUsers: token.permUsers,
        };
      }
      return session;
    }
  },
  session: { strategy: "jwt", maxAge: 24 * 60 * 60 },
  pages: {
    signIn: "/login",
  },
  secret: process.env.NEXTAUTH_SECRET || "minhasenhamuitosecreta",
};

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };
