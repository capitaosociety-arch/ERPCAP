import { getUsers } from "../../../app/actions/usuarios";
import UsuariosClient from "./UsuariosClient";

export default async function UsuariosRoute() {
  const users = await getUsers();

  return (
    <div className="animate-in fade-in duration-500">
      <UsuariosClient initialUsers={users} />
    </div>
  );
}
