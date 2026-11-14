const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });

const { createApp } = require("./app");
const { conectarBaseDatos, cerrarBaseDatos } = require("./db");

async function iniciar() {
    try {
        await conectarBaseDatos();
        const app = createApp();
        const puerto = Number(process.env.PORT) || 3000;
        const servidor = app.listen(puerto, () => {
            console.log(`Aplicación disponible en http://localhost:${puerto}`);
        });

        async function detener() {
            servidor.close(async () => {
                await cerrarBaseDatos();
                process.exit(0);
            });
        }
        process.on("SIGINT", detener);
        process.on("SIGTERM", detener);
    } catch (error) {
        console.error("No se pudo iniciar la aplicación:", error.message);
        process.exitCode = 1;
    }
}

iniciar();