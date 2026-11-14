const test = require("node:test");
const assert = require("node:assert/strict");
const { once } = require("node:events");
const { ObjectId } = require("mongodb");
const { createApp } = require("../server/app");

function coleccionEnMemoria() {
    const documentos = [];
    return {
        find() {
            let limite = 100;
            return {
                sort() { return this; },
                limit(valor) { limite = valor; return this; },
                async toArray() { return documentos.slice().reverse().slice(0, limite); }
            };
        },
        async insertOne(documento) {
            const _id = new ObjectId();
            documentos.push({ ...documento, _id });
            return { insertedId: _id };
        },
        async findOne({ _id }) {
            return documentos.find(d => d._id.equals(_id)) || null;
        },
        async updateOne({ _id }, { $set }) {
            const documento = documentos.find(d => d._id.equals(_id));
            if (!documento) return { matchedCount: 0 };
            Object.assign(documento, $set);
            return { matchedCount: 1 };
        },
        async deleteOne({ _id }) {
            const indice = documentos.findIndex(d => d._id.equals(_id));
            if (indice < 0) return { deletedCount: 0 };
            documentos.splice(indice, 1);
            return { deletedCount: 1 };
        }
    };
}

async function conServidor(fn, opciones = {}) {
    const coleccion = coleccionEnMemoria();
    const app = createApp({ getCollection: () => coleccion, ...opciones });
    const server = app.listen(0);
    await once(server, "listening");
    const base = `http://127.0.0.1:${server.address().port}`;
    try { await fn(base); }
    finally { await new Promise((resolve, reject) => server.close(err => err ? reject(err) : resolve())); }
}

async function peticion(base, ruta, metodo = "GET", cuerpo) {
    const response = await fetch(`${base}${ruta}`, {
        method: metodo,
        headers: cuerpo ? { "Content-Type": "application/json" } : {},
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
        const datos = { servicio: "IPstack", consulta: "8.8.8.8", nota: "Prueba" };
        const creado = await peticion(base, "/api/registros", "POST", datos);
        assert.equal(creado.status, 201);
        assert.match(creado.body.id, /^[a-f\d]{24}$/i);
        assert.equal(creado.body.consulta, "8.8.8.8");
        const id = creado.body.id;

        const listado = await peticion(base, "/api/registros");
        assert.equal(listado.status, 200);
        assert.equal(listado.body.length, 1);
        assert.equal(listado.body[0].id, id);

        const editado = await peticion(base, `/api/registros/${id}`, "PUT", {
            servicio: "IPstack", consulta: "1.1.1.1", nota: "Editado"
        });
        assert.equal(editado.status, 200);
        assert.equal(editado.body.consulta, "1.1.1.1");
        assert.equal(editado.body.nota, "Editado");

        const eliminado = await peticion(base, `/api/registros/${id}`, "DELETE");
        assert.equal(eliminado.status, 204);
        const vacio = await peticion(base, "/api/registros");
        assert.deepEqual(vacio.body, []);
    });
});

test("Validaciones: contenido inválido, ID incorrecto y registro inexistente", async () => {
    await conServidor(async (base) => {
        assert.equal((await peticion(base, "/api/registros", "POST", { servicio: "Otro", consulta: "x" })).status, 400);
        assert.equal((await peticion(base, "/api/registros", "POST", { servicio: "IPstack", consulta: "" })).status, 400);
        assert.equal((await peticion(base, "/api/registros/no-es-id", "DELETE")).status, 400);
        assert.equal((await peticion(base, `/api/registros/${new ObjectId()}`, "DELETE")).status, 404);
        assert.equal((await peticion(base, `/api/registros/${new ObjectId()}`, "PUT", { servicio: "Zenserp", consulta: "IA" })).status, 404);
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
            assert.equal((await peticion(base, "/api/ip/8.8.8.8")).body.ip, "8.8.8.8");
            assert.equal((await peticion(base, "/api/mercado/AAPL")).body.data[0].symbol, "AAPL");
            assert.equal((await peticion(base, "/api/busqueda?q=IA")).body.organic[0].title, "Ejemplo");
            assert.equal((await peticion(base, "/api/ip/no-es-ip")).status, 400);
        }, { fetchImpl });
        assert.equal(urls.length, 3);
    } finally {
        [process.env.IPSTACK_KEY, process.env.MARKETSTACK_KEY, process.env.ZENSERP_KEY] = anterior;
        if (anterior[0] === undefined) delete process.env.IPSTACK_KEY;
        if (anterior[1] === undefined) delete process.env.MARKETSTACK_KEY;
        if (anterior[2] === undefined) delete process.env.ZENSERP_KEY;
    }
});
