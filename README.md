# Consulta de APIs públicas + CRUD (Node.js, Express y MongoDB)

Proyecto basado en la aplicación original que consultaba **IPstack**, **Marketstack** y **Zenserp**. Se mantienen las tres consultas y se agrega un administrador de registros con operaciones **Create, Read, Update y Delete** sobre una colección en **MongoDB Atlas**.

> Los registros guardan el **servicio**, la **consulta** y una **nota**; no modifican los datos de las APIs externas. Puedes crearlos manualmente o guardar una búsqueda hecha desde la interfaz.

## Requisitos

- Node.js 20 o superior y npm (se recomienda Node.js 22 LTS o posterior compatible).
- Un clúster de MongoDB Atlas, un usuario de base de datos y acceso de red configurado.
- Claves de IPstack, Marketstack y Zenserp para que funcionen **las búsquedas externas**. Sin esas claves, el CRUD en MongoDB sigue disponible y las consultas externas muestran un aviso.
- No se requiere Python: este es el proyecto original de **Node.js / Express**, independiente de tu práctica de Python.

## 1. Instalar

Desde la Terminal de VS Code, en la carpeta raíz donde está `package.json`:

```bash
npm install
```

## 2. Variables de entorno

Copia `.env.example` a `.env`:

```bash
cp .env.example .env
```

Abre `.env` y coloca la URI de MongoDB Atlas y tus claves de servicios:

```dotenv
MONGODB_URI=mongodb+srv://USUARIO:CONTRASENA@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority
MONGODB_DB=consulta_apis_publicas
IPSTACK_KEY=TU_CLAVE
MARKETSTACK_KEY=TU_CLAVE
ZENSERP_KEY=TU_CLAVE
PORT=3000
```

- Puedes utilizar el **mismo clúster de MongoDB Atlas** que configuraste con Python, pero aquí se utiliza la base de datos **`consulta_apis_publicas`** y la colección **`registros`**: no afecta tu colección `libros`.
- Si el password tiene caracteres reservados de URL, codifícalos (URL encoding).
- Si aparece `CERTIFICATE_VERIFY_FAILED`, revisa certificados SSL y la configuración TLS de tu equipo; **no** desactives la validación TLS.
- Nunca subas `.env` a GitHub ni compartas las claves.
- En MongoDB Atlas, autoriza tu IP actual en **Network Access** y asegúrate de que el usuario de DB pueda leer y escribir en la base de datos indicada.

## 3. Iniciar la aplicación

```bash
npm start
```

Abre **http://localhost:3000** en el navegador. El servidor se conecta a MongoDB antes de empezar a escuchar. Si aparece un error de conexión, revisa `.env`, tu usuario de Atlas y el acceso por IP.

Para desarrollo con reinicio automático:

```bash
npm run dev
```

## 4. Probar las operaciones CRUD en el navegador

1. **CREATE:** En la sección **Administrador de registros**, selecciona un servicio, escribe una consulta y una nota opcional. Pulsa **Crear registro**.
2. **READ:** Comprueba que aparece en **Registros guardados**. También puedes pulsar **Actualizar lista**.
3. **UPDATE:** Pulsa **Editar**, modifica la consulta o la nota y selecciona **Guardar cambios**.
4. **DELETE:** Pulsa **Eliminar** y confirma la operación.
5. **INTEGRACIÓN:** Haz una consulta con IPstack, Marketstack o Zenserp y pulsa **Guardar esta consulta**; se prellenará el formulario CRUD. O pulsa **Volver a consultar** desde una fila guardada.

Verifica en **MongoDB Atlas → Data Explorer → `consulta_apis_publicas` → `registros`** que los cambios se almacenan realmente.

## 5. Ejecutar pruebas automáticas (sin credenciales de Atlas)

```bash
npm test
```

Las pruebas usan una colección simulada en memoria para verificar los endpoints CRUD sin hacer cambios en tu base de datos real. También comprueban las tres rutas externas mediante respuestas simuladas.

## Estructura

```text
Consulta-APIs-CRUD/
├── client/
│   ├── index.html             # Interfaz y formularios
│   ├── styles.css             # Diseño responsive
│   └── app.js                 # Fetch y acciones de usuario
├── server/
│   ├── app.js                 # API REST de servicios externos y CRUD
│   ├── db.js                  # Conexión con MongoDB Atlas
│   └── server.js              # Inicialización de Express
├── tests/
│   └── app.test.js            # Pruebas automatizadas
├── .env.example               # Plantilla de variables
├── .gitignore
├── package.json
└── README.md
```

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

## Importante para publicar en Internet

La versión entregada es una **práctica educativa para ejecutarse localmente**. No tiene cuentas de usuario ni autorización por registro: **cualquiera con acceso al servidor puede crear, ver, editar y eliminar los registros**. Antes de publicarla en un sitio accesible desde Internet, agrega autenticación, autorización por usuario, rate limiting, seguridad de sesiones, políticas de uso y pruebas de seguridad. No publiques este CRUD sin esos controles.
