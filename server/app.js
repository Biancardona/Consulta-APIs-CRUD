const express = require("express");
const path = require("path");
const net = require("net");
const { ejecutar, consultarUno, consultarTodos } = require("./db");

const SERVICIOS = new Set(["IPstack", "Marketstack", "Zenserp"]);
const ID_VALIDO = /^[1-9]\d*$/;

function validarRegistro(datos) {
    if (!datos || typeof datos !== "object" || Array.isArray(datos)) {
        return { error: "Debes enviar los datos de un registro" };
    }
    const { servicio, consulta, nota = "" } = datos;
    if (typeof servicio !== "string" || !SERVICIOS.has(servicio)) {
        return { error: "Selecciona un servicio válido" };
    }
    if (typeof consulta !== "string" || !consulta.trim() || consulta.trim().length > 200) {
        return { error: "La consulta debe tener entre 1 y 200 caracteres" };
    }
    if (typeof nota !== "string" || nota.length > 500) {
        return { error: "La nota debe tener como máximo 500 caracteres" };
    }
    return { valor: { servicio, consulta: consulta.trim(), nota: nota.trim() } };
}

function aRespuesta(documento) {
    return {
        id: String(documento.id),
        servicio: documento.servicio,
        consulta: documento.consulta,
        nota: documento.nota,
        createdAt: documento.createdAt,
        updatedAt: documento.updatedAt
    };
}

function createApp({ ejecutarSQL = ejecutar, consultarUnoSQL = consultarUno, consultarTodosSQL = consultarTodos, fetchImpl = fetch } = {}) {

    const app = express();
    app.disable("x-powered-by");
    app.use(express.json({ limit: "12kb" }));

    // ---------- CONSULTAS A LAS TRES APIS ORIGINALES ----------
    app.get("/api/ip/:ip", async (req, res, next) => {
        try {
            const ip = req.params.ip.trim();
            if (!net.isIP(ip)) return res.status(400).json({ error: "Ingresa una dirección IP válida" });
            if (!process.env.IPSTACK_KEY) return res.status(503).json({ error: "Falta configurar IPSTACK_KEY" });

            const parametros = new URLSearchParams({
                access_key: process.env.IPSTACK_KEY,
                fields: "ip,country_name,region_name,city,latitude,longitude"
            });
            const upstream = await fetchImpl(`https://api.ipstack.com/${encodeURIComponent(ip)}?${parametros}`, {
                signal: AbortSignal.timeout(12000)
            });
            const datos = await upstream.json();
            if (!upstream.ok || datos.success === false) {
                return res.status(502).json({ error: datos.error?.info || "No fue posible consultar IPstack" });
            }
            res.json(datos);
        } catch (error) { next(error); }
    });

    app.get("/api/mercado/:simbolo", async (req, res, next) => {
        try {
            const simbolo = req.params.simbolo.trim().toUpperCase();
            if (!/^[A-Z0-9.\-^]{1,20}$/.test(simbolo)) {
                return res.status(400).json({ error: "Ingresa un símbolo bursátil válido" });
            }
            if (!process.env.MARKETSTACK_KEY) return res.status(503).json({ error: "Falta configurar MARKETSTACK_KEY" });

            const parametros = new URLSearchParams({
                access_key: process.env.MARKETSTACK_KEY,
                symbols: simbolo,
                limit: "5"
            });
            const upstream = await fetchImpl(`https://api.marketstack.com/v2/eod?${parametros}`, {
                signal: AbortSignal.timeout(12000)
            });
            const datos = await upstream.json();
            if (!upstream.ok) return res.status(502).json({ error: "No fue posible consultar Marketstack" });
            res.json(datos);
        } catch (error) { next(error); }
    });

    app.get("/api/busqueda", async (req, res, next) => {
        try {
            const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
            if (!q || q.length > 200) {
                return res.status(400).json({ error: "Ingresa una búsqueda de 1 a 200 caracteres" });
            }
            if (!process.env.ZENSERP_KEY) return res.status(503).json({ error: "Falta configurar ZENSERP_KEY" });

            const parametros = new URLSearchParams({ q, engine: "google" });
            const upstream = await fetchImpl(`https://app.zenserp.com/api/v2/search?${parametros}`, {
                headers: { apikey: process.env.ZENSERP_KEY },
                signal: AbortSignal.timeout(12000)
            });
            const datos = await upstream.json();
            if (!upstream.ok) return res.status(502).json({ error: "No fue posible consultar Zenserp" });
            res.json(datos);
        } catch (error) { next(error); }
    });

    // ---------- CRUD: REGISTROS DE CONSULTAS GUARDADAS ----------
    app.get("/api/registros", async (_req, res, next) => {
        try {
            const documentos = await consultarTodosSQL("SELECT * FROM registros ORDER BY createdAt DESC, id DESC LIMIT 100");
            res.json(documentos.map(aRespuesta));
        } catch (error) { next(error); }
    });

    app.post("/api/registros", async (req, res, next) => {
        try {
            const { error, valor } = validarRegistro(req.body);
            if (error) return res.status(400).json({ error });
            const ahora = new Date().toISOString();
            const resultado = await ejecutarSQL(
                "INSERT INTO registros (servicio, consulta, nota, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?)",
                [valor.servicio, valor.consulta, valor.nota, ahora, ahora]
            );
            const creado = await consultarUnoSQL("SELECT * FROM registros WHERE id = ?", [resultado.lastID]);
            res.status(201).json(aRespuesta(creado));
        } catch (error) { next(error); }
    });

    app.put("/api/registros/:id", async (req, res, next) => {
        try {
            const { id } = req.params;
            if (!ID_VALIDO.test(id)) return res.status(400).json({ error: "ID no válido" });
            const { error, valor } = validarRegistro(req.body);
            if (error) return res.status(400).json({ error });
            const resultado = await ejecutarSQL(
                "UPDATE registros SET servicio = ?, consulta = ?, nota = ?, updatedAt = ? WHERE id = ?",
                [valor.servicio, valor.consulta, valor.nota, new Date().toISOString(), id]
            );
            if (!resultado.changes) return res.status(404).json({ error: "Registro no encontrado" });
            const actualizado = await consultarUnoSQL("SELECT * FROM registros WHERE id = ?", [id]);
            res.json(aRespuesta(actualizado));
        } catch (error) { next(error); }
    });

    app.delete("/api/registros/:id", async (req, res, next) => {
        try {
            const { id } = req.params;
            if (!ID_VALIDO.test(id)) return res.status(400).json({ error: "ID no válido" });
            const resultado = await ejecutarSQL("DELETE FROM registros WHERE id = ?", [id]);
            if (!resultado.changes) return res.status(404).json({ error: "Registro no encontrado" });
            res.status(204).end();
        } catch (error) { next(error); }
    });

    // Errores JSON y de servicios / base de datos sin filtrar detalles internos.
    app.use((error, _req, res, _next) => {
        if (error instanceof SyntaxError && error.status === 400 && "body" in error) {
            return res.status(400).json({ error: "JSON inválido" });
        }
        console.error("Error interno:", error.message);
        res.status(500).json({ error: "Ocurrió un error. Intenta de nuevo." });
    });

    // Servir los archivos del frontend. La API se registró antes de esta ruta.
    app.use(express.static(path.join(__dirname, "../client")));
    return app;
}

// Exporta la aplicación sin abrir la base de datos hasta iniciar server.js.
const app = createApp();
module.exports = app;
module.exports.createApp = createApp;
module.exports.validarRegistro = validarRegistro;