const sqlite3 = require('sqlite3');
const fs = require('fs');
const path = require('path');

let baseDatos;

function ejecutar(sql, parametros = []) {
    return new Promise((resolve, reject) => {
        obtenerBaseDatos().run(sql, parametros, function (error) {
            if (error) return reject(error);
            resolve({ lastID: this.lastID, changes: this.changes });
        });
    });
}

function consultarUno(sql, parametros = []) {
    return new Promise((resolve, reject) => {
        obtenerBaseDatos().get(sql, parametros, (error, fila) => {
            if (error) return reject(error);
            resolve(fila);
        });
    });
}

function consultarTodos(sql, parametros = []) {
    return new Promise((resolve, reject) => {
        obtenerBaseDatos().all(sql, parametros, (error, filas) => {
            if (error) return reject(error);
            resolve(filas);
        });
    });
}

async function conectarBaseDatos() {
    if (baseDatos) return;
    const carpeta = path.join(__dirname, '../data');
    fs.mkdirSync(carpeta, { recursive: true });
    const archivo = path.join(carpeta, 'registros.db');
    baseDatos = await new Promise((resolve, reject) => {
        const db = new sqlite3.Database(archivo, error => error ? reject(error) : resolve(db));
    });
    try {
        await ejecutar(`CREATE TABLE IF NOT EXISTS registros (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            servicio TEXT NOT NULL CHECK (servicio IN ('IPstack', 'Marketstack', 'Zenserp')),
            consulta TEXT NOT NULL,
            nota TEXT NOT NULL DEFAULT '',
            createdAt TEXT NOT NULL,
            updatedAt TEXT NOT NULL
        )`);
        await ejecutar('CREATE INDEX IF NOT EXISTS idx_registros_fecha ON registros(createdAt DESC)');
        console.log(`SQLite conectado: ${archivo}`);
    } catch (error) {
        await cerrarBaseDatos();
        throw error;
    }
}

function obtenerBaseDatos() {
    if (!baseDatos) throw new Error('La conexión SQLite no está inicializada');
    return baseDatos;
}

async function cerrarBaseDatos() {
    if (!baseDatos) return;
    const db = baseDatos;
    await new Promise((resolve, reject) => db.close(error => error ? reject(error) : resolve()));
    baseDatos = undefined;
}

module.exports = { conectarBaseDatos, obtenerBaseDatos, cerrarBaseDatos, ejecutar, consultarUno, consultarTodos };