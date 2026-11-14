const test = require("node:test");
const assert = require("node:assert/strict");
const { once } = require("node:events");
const { randomBytes } = require("node:crypto");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { createApp } = require("../server/app");
const { conectarBaseDatos, cerrarBaseDatos } = require("../server/db");

const credenciales = { email: "admin@example.test", password: "clave de pruebas" };
const authEnv = {
    ADMIN_EMAIL: credenciales.email,
    ADMIN_PASSWORD_HASH: bcrypt.hashSync(credenciales.password, 4),
    JWT_SECRET: randomBytes(32).toString("hex")
};

async function conServidor(fn, opciones = {}) {
    const app = createApp({ authEnv, ...opciones });
    await conectarBaseDatos(":memory:");
    const server = app.listen(0, "127.0.0.1");
    try {
        await once(server, "listening");
        const base = `http://127.0.0.1:${server.address().port}`;
        await fn(base);
    } finally {
        await new Promise((resolve, reject) => server.close(err => err ? reject(err) : resolve()));
        await cerrarBaseDatos();
    }
}

async function clienteAutenticado(base) {
    const login = await peticion(base, "/api/auth/login", "POST", credenciales);
    assert.equal(login.status, 200);
    assert.equal(login.body.expiresIn, 900);
    return (ruta, metodo, cuerpo) => peticion(base, ruta, metodo, cuerpo, login.body.token);
}

async function peticion(base, ruta, metodo = "GET", cuerpo, token) {
    const response = await fetch(`${base}${ruta}`, {
        method: metodo,
        headers: {
            ...(cuerpo && { "Content-Type": "application/json" }),
            ...(token && { Authorization: `Bearer ${token}` })
        },
        body: cuerpo ? JSON.stringify(cuerpo) : undefined
    });
    return { status: response.status, body: response.status === 204 ? null : await response.json() };
}

test("La página de inicio sirve el frontend original ampliado", async () => {
    await conServidor(async (base) => {
        const response = await fetch(base);
        assert.equal(response.status, 200);
        const html = await response.text();
        assert.match(html, /Consulta de APIs públicas/);
        assert.match(html, /formIP/);
        assert.match(html, /formRegistro/);
    });
});

test("CRUD completo: crear, consultar, actualizar y eliminar", async () => {
    await conServidor(async (base) => {
        const consultar = await clienteAutenticado(base);
        const datos = { servicio: "IPstack", consulta: "8.8.8.8", nota: "Prueba" };
        const creado = await consultar("/api/registros", "POST", datos);
        assert.equal(creado.status, 201);
        assert.match(creado.body.id, /^[1-9]\d*$/i);
        assert.equal(creado.body.consulta, "8.8.8.8");
        const id = creado.body.id;

        const listado = await consultar("/api/registros");
        assert.equal(listado.status, 200);
        assert.equal(listado.body.length, 1);
        assert.equal(listado.body[0].id, id);

        const editado = await consultar(`/api/registros/${id}`, "PUT", {
            servicio: "IPstack", consulta: "1.1.1.1", nota: "Editado"
        });
        assert.equal(editado.status, 200);
        assert.equal(editado.body.consulta, "1.1.1.1");
        assert.equal(editado.body.nota, "Editado");

        const eliminado = await consultar(`/api/registros/${id}`, "DELETE");
        assert.equal(eliminado.status, 204);
        const vacio = await consultar("/api/registros");
        assert.deepEqual(vacio.body, []);
    });
});

test("Validaciones: contenido inválido, ID incorrecto y registro inexistente", async () => {
    await conServidor(async (base) => {
        const consultar = await clienteAutenticado(base);
        assert.equal((await consultar("/api/registros", "POST", { servicio: "Otro", consulta: "x" })).status, 400);
        assert.equal((await consultar("/api/registros", "POST", { servicio: "IPstack", consulta: "" })).status, 400);
        assert.equal((await consultar("/api/registros/no-es-id", "DELETE")).status, 400);
        assert.equal((await consultar(`/api/registros/9999`, "DELETE")).status, 404);
        assert.equal((await consultar(`/api/registros/9999`, "PUT", { servicio: "Zenserp", consulta: "IA" })).status, 404);
    });
});

test("Se conservan las tres rutas de servicios externos", async () => {
    const anterior = [process.env.IPSTACK_KEY, process.env.MARKETSTACK_KEY, process.env.ZENSERP_KEY];
    process.env.IPSTACK_KEY = "clave-prueba";
    process.env.MARKETSTACK_KEY = "clave-prueba";
    process.env.ZENSERP_KEY = "clave-prueba";
    const urls = [];
    const fetchImpl = async (url) => {
        urls.push(String(url));
        if (String(url).includes("ipstack")) return { ok: true, json: async () => ({ ip: "8.8.8.8" }) };
        if (String(url).includes("marketstack")) return { ok: true, json: async () => ({ data: [{ symbol: "AAPL" }] }) };
        return { ok: true, json: async () => ({ organic: [{ title: "Ejemplo", url: "https://example.com" }] }) };
    };
    try {
        await conServidor(async (base) => {
            const consultar = await clienteAutenticado(base);
            assert.equal((await consultar("/api/ip/8.8.8.8")).body.ip, "8.8.8.8");
            assert.equal((await consultar("/api/mercado/AAPL")).body.data[0].symbol, "AAPL");
            assert.equal((await consultar("/api/busqueda?q=IA")).body.organic[0].title, "Ejemplo");
            assert.equal((await consultar("/api/ip/no-es-ip")).status, 400);
        }, { fetchImpl });
        assert.equal(urls.length, 3);
    } finally {
        [process.env.IPSTACK_KEY, process.env.MARKETSTACK_KEY, process.env.ZENSERP_KEY] = anterior;
        if (anterior[0] === undefined) delete process.env.IPSTACK_KEY;
        if (anterior[1] === undefined) delete process.env.MARKETSTACK_KEY;
        if (anterior[2] === undefined) delete process.env.ZENSERP_KEY;
    }
});

test("El CRUD y los proveedores requieren un token", async () => {
    await conServidor(async (base) => {
        const rutas = [
            ["GET", "/api/registros"],
            ["POST", "/api/registros"],
            ["PUT", "/api/registros/1"],
            ["DELETE", "/api/registros/1"],
            ["GET", "/api/ip/8.8.8.8"],
            ["GET", "/api/mercado/AAPL"],
            ["GET", "/api/busqueda?q=IA"]
        ];
        for (const [metodo, ruta] of rutas) {
            assert.equal((await peticion(base, ruta, metodo)).status, 401);
        }

        const login = await peticion(base, "/api/auth/login", "POST", credenciales);
        const [header, payload, firma] = login.body.token.split(".");
        const firmaAlterada = (firma[0] === "A" ? "B" : "A") + firma.slice(1);
        const vencido = jwt.sign({}, Buffer.from(authEnv.JWT_SECRET, "hex"), {
            algorithm: "HS256", issuer: "consulta-apis-crud", audience: "cliente-web",
            subject: "admin", expiresIn: -1
        });
        for (const token of [`${header}.${payload}.${firmaAlterada}`, vencido]) {
            assert.equal((await peticion(base, "/api/registros", "GET", undefined, token)).status, 401);
        }
    });
});

test("El login limita los intentos fallidos y evita probar credenciales después del límite", async () => {
    await conServidor(async (base) => {
        for (let intento = 0; intento < 10; intento++) {
            const login = await peticion(base, "/api/auth/login", "POST", { ...credenciales, password: "incorrecta" });
            assert.equal(login.status, 401);
            assert.equal(login.body.token, undefined);
        }
        assert.equal((await peticion(base, "/api/auth/login", "POST", credenciales)).status, 429);
    });
});

test("El servidor exige la configuración de autenticación al iniciar", () => {
    assert.throws(() => createApp({ authEnv: {} }), /Configura ADMIN_EMAIL/);
});
