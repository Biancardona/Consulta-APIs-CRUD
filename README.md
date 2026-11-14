# Consulta de APIs públicas + CRUD

Aplicación de Node.js y Express que consulta IPstack, Marketstack y Zenserp y guarda registros en SQLite (`data/registros.db`). Una cuenta administradora habilita el acceso al CRUD y a las consultas externas mediante JWT.

## Configuración local

Requiere Node.js 20 o posterior compatible con SQLite3. Instala las dependencias desde la raíz:

```bash
npm ci
```

Si todavía no tienes `.env`, copia `.env.example` a `.env`. Si ya existe, conserva tus claves de proveedores y agrega las variables nuevas.

1. Define `ADMIN_EMAIL` con el correo de la cuenta administradora.
2. Genera un hash bcrypt. Ejecuta el siguiente comando y escribe tu contraseña cuando se te pida. Usa una contraseña exclusiva de hasta 72 bytes.

   ```bash
   bash -c 'read -rs -p "Contraseña: " clave; printf "\n" >&2; printf "%s" "$clave" | node -e "const fs = require(\"node:fs\"); const bcrypt = require(\"bcryptjs\"); const clave = fs.readFileSync(0, \"utf8\"); if (!clave || Buffer.byteLength(clave) > 72) throw new Error(\"Usa entre 1 y 72 bytes\"); console.log(bcrypt.hashSync(clave, 12));"'
   ```

   Copia el resultado completo a `ADMIN_PASSWORD_HASH` en el archivo `.env`.

3. Genera el secreto con `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"` y guarda los 64 caracteres en `JWT_SECRET`.
4. Completa `IPSTACK_KEY`, `MARKETSTACK_KEY` y `ZENSERP_KEY` para consultar a los proveedores. El CRUD funciona sin esas tres claves.

Mantén `.env` fuera de Git. Inicia con `npm start`, abre [localhost:3000](http://localhost:3000) e inicia sesión con tu correo y la contraseña original.

## Autenticación y pruebas

`POST /api/auth/login` acepta JSON con `email` y `password`. Devuelve un JWT con vigencia de 15 minutos. Envía `Authorization: Bearer <token>` en las solicitudes al CRUD y a los proveedores. Un token ausente, alterado o vencido devuelve `401`. El login aplica un límite por IP y responde `429` al superarse. Usa HTTPS si publicas la aplicación.

El cliente conserva el token en memoria. Recargar la página o cerrar sesión elimina el token del navegador. Los tokens emitidos siguen siendo válidos hasta su vencimiento. La cuenta administradora puede gestionar todos los registros existentes.

Ejecuta `npm test`. Las pruebas usan una base SQLite en memoria y respuestas simuladas de los proveedores. Cubren el CRUD autenticado, las rutas externas, el rechazo de tokens alterados o vencidos y el límite de intentos.

## Endpoints REST del CRUD

| Método | Ruta | Acción |
| --- | --- | --- |
| GET | `/api/registros` | Lista los últimos 100 registros |
| POST | `/api/registros` | Crea un registro |
| PUT | `/api/registros/:id` | Edita un registro |
| DELETE | `/api/registros/:id` | Elimina un registro |

Ejemplo de cuerpo JSON para POST y PUT:

```json
{
  "servicio": "Zenserp",
  "consulta": "bases de datos NoSQL",
  "nota": "Investigación para clase"
}
```

Las rutas existentes `/api/ip/:ip`, `/api/mercado/:simbolo` y `/api/busqueda?q=...` se mantienen.
