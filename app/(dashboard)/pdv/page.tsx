import { getServerSession } from "next-auth";
import { authOptions } from "../../api/auth/[...nextauth]/route";
import { prisma } from "../../../lib/prisma";
import PDVClient from "./PDVClient";

export default async function PDVRoute() {
  const session = await getServerSession(authOptions);
  
  // Buscar catálogo completo no banco
  const products = await prisma.product.findMany({ where: { isActive: true }, include: { category: true, stock: true } });
  const services = await prisma.service.findMany({ where: { isActive: true } });
  const categories = await prisma.productCategory.findMany();
  
  // Buscar se existe um caixa aberto
  const openRegister = await prisma.cashRegister.findFirst({ where: { status: 'OPEN' } });
  
  return <PDVClient products={products} services={services} categories={categories} user={session?.user} openRegister={openRegister} />;
}
