import { getServerSession } from "next-auth";
import { authOptions } from "../../api/auth/[...nextauth]/route";
import { prisma } from "../../../lib/prisma";
import { requirePagePermission } from "../../../lib/auth-guard";
import PDVClient from "./PDVClient";

export default async function PDVRoute() {
  await requirePagePermission("permPDV");

  const session = await getServerSession(authOptions);
  
  // Buscar catálogo completo no banco
  const products = await prisma.product.findMany({ where: { isActive: true }, include: { category: true, stock: true }, orderBy: { name: 'asc' } });
  const services = await prisma.service.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } });
  const categories = await prisma.productCategory.findMany();
  
  // Buscar se existe um caixa aberto
  const openRegister = await prisma.cashRegister.findFirst({ where: { status: 'OPEN' } });
  
  return <PDVClient products={products} services={services} categories={categories} user={session?.user} openRegister={openRegister} />;
}
