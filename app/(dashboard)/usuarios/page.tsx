import { getUsers } from "../../../app/actions/usuarios";
import { requirePagePermission } from "../../../lib/auth-guard";
import UsuariosClient from "./UsuariosClient";

export default async function UsuariosRoute() {
  await requirePagePermission("permUsers");

  const users = await getUsers();

  return (
    <div className="animate-in fade-in duration-500">
      <UsuariosClient initialUsers={users} />
    </div>
  );
}
