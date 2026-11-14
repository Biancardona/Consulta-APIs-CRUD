/* Consultas a IPstack, Marketstack y Zenserp + CRUD de MongoDB */

async function solicitarJSON(url, opciones = {}) {
    const respuesta = await fetch(url, opciones);
    if (respuesta.status === 204) return null;
    const datos = await respuesta.json().catch(() => null);
    if (!respuesta.ok) throw new Error(datos?.error || `Error HTTP ${respuesta.status}`);
    return datos;
}

function mensaje(id, contenido, tipo = "") {
    const elemento = document.getElementById(id);
    elemento.textContent = contenido;
    elemento.dataset.tipo = tipo;
}

function crearCelda(fila, valor) {
    const celda = document.createElement("td");
    celda.textContent = valor ?? "N/D";
    fila.appendChild(celda);
    return celda;
}

function limpiarTabla(id) {
    document.querySelector(`#${id} tbody`).replaceChildren();
}

function escribirFilas(id, datos, columnas) {
    const tbody = document.querySelector(`#${id} tbody`);
    tbody.replaceChildren();
    for (const dato of datos) {
        const fila = document.createElement("tr");
        for (const columna of columnas) crearCelda(fila, columna(dato));
        tbody.appendChild(fila);
    }
}

function formatearNumero(numero) {
    return numero === null || numero === undefined || !Number.isFinite(Number(numero))
        ? "N/D"
        : Number(numero).toFixed(2);
}
function formatearFecha(fecha) {
    if (!fecha || Number.isNaN(new Date(fecha).getTime())) return "N/D";
    return new Date(fecha).toLocaleDateString("es-MX");
}

function activarGuardar(idBoton, servicio, consulta) {
    const boton = document.getElementById(idBoton);
    boton.hidden = false;
    boton.onclick = () => prepararRegistro(servicio, consulta);
}

function habilitarFormulario(form, activo) {
    const boton = form.querySelector('button[type="submit"]');
    boton.disabled = !activo;
}

// ---------- IPSTACK ----------
document.getElementById("formIP").addEventListener("submit", async (evento) => {
    evento.preventDefault();
    const form = evento.currentTarget;
    const ip = document.getElementById("ip").value.trim();
    limpiarTabla("tablaIP");
    document.getElementById("guardarIP").hidden = true;
    mensaje("mensajeIP", "Consultando dirección IP...");
    habilitarFormulario(form, false);
    try {
        const datos = await solicitarJSON(`/api/ip/${encodeURIComponent(ip)}`);
        escribirFilas("tablaIP", [datos], [
            d => d.ip, d => d.country_name, d => d.region_name,
            d => d.city, d => d.latitude, d => d.longitude
        ]);
        mensaje("mensajeIP", "Resultado encontrado.", "ok");
        activarGuardar("guardarIP", "IPstack", ip);
    } catch (error) { mensaje("mensajeIP", `Error: ${error.message}`, "error"); }
    finally { habilitarFormulario(form, true); }
});

// ---------- MARKETSTACK ----------
document.getElementById("formMercado").addEventListener("submit", async (evento) => {
    evento.preventDefault();
    const form = evento.currentTarget;
    const simbolo = document.getElementById("simbolo").value.trim().toUpperCase();
    limpiarTabla("tablaMercado");
    document.getElementById("guardarMercado").hidden = true;
    mensaje("mensajeMercado", "Consultando símbolo bursátil...");
    habilitarFormulario(form, false);
    try {
        const resultado = await solicitarJSON(`/api/mercado/${encodeURIComponent(simbolo)}`);
        const datos = (Array.isArray(resultado.data) ? resultado.data : [])
            .filter(item => typeof item.symbol === "string" && item.symbol.toUpperCase() === simbolo);
        escribirFilas("tablaMercado", datos, [
            d => d.symbol, d => d.exchange, d => formatearFecha(d.date),
            d => formatearNumero(d.open), d => formatearNumero(d.high),
            d => formatearNumero(d.low), d => formatearNumero(d.close), d => d.volume
        ]);
        mensaje("mensajeMercado", datos.length ? `${datos.length} resultado(s) encontrado(s).` : "No se encontraron resultados.", datos.length ? "ok" : "");
        if (datos.length) activarGuardar("guardarMercado", "Marketstack", simbolo);
    } catch (error) { mensaje("mensajeMercado", `Error: ${error.message}`, "error"); }
    finally { habilitarFormulario(form, true); }
});

// ---------- ZENSERP ----------
document.getElementById("formBusqueda").addEventListener("submit", async (evento) => {
    evento.preventDefault();
    const form = evento.currentTarget;
    const consulta = document.getElementById("busqueda").value.trim();
    limpiarTabla("tablaBusqueda");
    document.getElementById("guardarBusqueda").hidden = true;
    mensaje("mensajeBusqueda", "Buscando resultados web...");
    habilitarFormulario(form, false);
    try {
        const resultado = await solicitarJSON(`/api/busqueda?q=${encodeURIComponent(consulta)}`);
        const datos = (Array.isArray(resultado.organic) ? resultado.organic : []).filter(d => {
            if (!d.title || !d.url) return false;
            try { return ["http:", "https:"].includes(new URL(d.url).protocol); }
            catch { return false; }
        });
        const tbody = document.querySelector("#tablaBusqueda tbody");
        for (const dato of datos) {
            const fila = document.createElement("tr");
            crearCelda(fila, dato.position);
            crearCelda(fila, dato.title);
            crearCelda(fila, dato.description ?? "Sin descripción");
            const celda = document.createElement("td");
            const enlace = document.createElement("a");
            enlace.href = dato.url;
            enlace.target = "_blank";
            enlace.rel = "noopener noreferrer";
            enlace.textContent = "Visitar";
            celda.appendChild(enlace);
            fila.appendChild(celda);
            tbody.appendChild(fila);
        }
        mensaje("mensajeBusqueda", datos.length ? `${datos.length} resultado(s) encontrado(s).` : "No se encontraron resultados.", datos.length ? "ok" : "");
        if (datos.length) activarGuardar("guardarBusqueda", "Zenserp", consulta);
    } catch (error) { mensaje("mensajeBusqueda", `Error: ${error.message}`, "error"); }
    finally { habilitarFormulario(form, true); }
});

// ---------- CRUD: REGISTROS GUARDADOS ----------
const formRegistro = document.getElementById("formRegistro");
let registros = [];
let idEnEdicion = null;

function prepararRegistro(servicio, consulta) {
    cancelarEdicion();
    document.getElementById("servicioRegistro").value = servicio;
    document.getElementById("consultaRegistro").value = consulta;
    document.getElementById("administrar").scrollIntoView({ behavior: "smooth" });
    document.getElementById("notaRegistro").focus({ preventScroll: true });
    mensaje("mensajeRegistro", "Puedes añadir una nota y pulsar Crear registro.");
}

function cancelarEdicion() {
    idEnEdicion = null;
    formRegistro.reset();
    document.getElementById("botonRegistro").textContent = "Crear registro";
    document.getElementById("cancelarEdicion").hidden = true;
}
document.getElementById("cancelarEdicion").addEventListener("click", () => {
    cancelarEdicion();
    mensaje("mensajeRegistro", "Edición cancelada.");
});

async function cargarRegistros() {
    try {
        mensaje("mensajeRegistro", "Cargando registros...");
        registros = await solicitarJSON("/api/registros");
        mostrarRegistros();
        mensaje("mensajeRegistro", `${registros.length} registro(s) cargado(s).`, "ok");
    } catch (error) {
        mensaje("mensajeRegistro", `No se pudieron cargar los registros: ${error.message}`, "error");
    }
}

function mostrarRegistros() {
    const tbody = document.querySelector("#tablaRegistros tbody");
    tbody.replaceChildren();
    document.getElementById("totalRegistros").textContent = `(${registros.length})`;
    if (!registros.length) {
        const fila = document.createElement("tr");
        const celda = crearCelda(fila, "Aún no hay registros. Crea uno con el formulario superior.");
        celda.colSpan = 5;
        tbody.appendChild(fila);
        return;
    }
    for (const registro of registros) {
        const fila = document.createElement("tr");
        crearCelda(fila, registro.servicio);
        crearCelda(fila, registro.consulta);
        crearCelda(fila, registro.nota || "—");
        crearCelda(fila, formatearFecha(registro.createdAt));
        const acciones = document.createElement("td");
        acciones.className = "acciones-tabla";
        const botonReconsultar = document.createElement("button");
        botonReconsultar.type = "button";
        botonReconsultar.className = "boton boton-secundario boton-pequeno";
        botonReconsultar.textContent = "Volver a consultar";
        botonReconsultar.addEventListener("click", () => reconsultar(registro));
        const botonEditar = document.createElement("button");
        botonEditar.type = "button";
        botonEditar.className = "boton boton-secundario boton-pequeno";
        botonEditar.textContent = "Editar";
        botonEditar.addEventListener("click", () => editar(registro));
        const botonEliminar = document.createElement("button");
        botonEliminar.type = "button";
        botonEliminar.className = "boton boton-peligro boton-pequeno";
        botonEliminar.textContent = "Eliminar";
        botonEliminar.addEventListener("click", () => eliminar(registro));
        acciones.append(botonReconsultar, botonEditar, botonEliminar);
        fila.appendChild(acciones);
        tbody.appendChild(fila);
    }
}

function editar(registro) {
    idEnEdicion = registro.id;
    document.getElementById("servicioRegistro").value = registro.servicio;
    document.getElementById("consultaRegistro").value = registro.consulta;
    document.getElementById("notaRegistro").value = registro.nota;
    document.getElementById("botonRegistro").textContent = "Guardar cambios";
    document.getElementById("cancelarEdicion").hidden = false;
    document.getElementById("administrar").scrollIntoView({ behavior: "smooth" });
    document.getElementById("consultaRegistro").focus({ preventScroll: true });
    mensaje("mensajeRegistro", `Editando: ${registro.consulta}`);
}

async function eliminar(registro) {
    if (!window.confirm(`¿Eliminar la consulta "${registro.consulta}"? Esta acción no se puede deshacer.`)) return;
    try {
        await solicitarJSON(`/api/registros/${encodeURIComponent(registro.id)}`, { method: "DELETE" });
        if (idEnEdicion === registro.id) cancelarEdicion();
        await cargarRegistros();
        mensaje("mensajeRegistro", "Registro eliminado correctamente.", "ok");
    } catch (error) { mensaje("mensajeRegistro", `No se pudo eliminar: ${error.message}`, "error"); }
}

function reconsultar(registro) {
    const opciones = {
        IPstack: ["ip", "formIP"],
        Marketstack: ["simbolo", "formMercado"],
        Zenserp: ["busqueda", "formBusqueda"]
    };
    const destino = opciones[registro.servicio];
    if (!destino) return;
    document.getElementById(destino[0]).value = registro.consulta;
    document.getElementById(destino[1]).scrollIntoView({ behavior: "smooth" });
    document.getElementById(destino[1]).dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
}

formRegistro.addEventListener("submit", async (evento) => {
    evento.preventDefault();
    const datos = {
        servicio: document.getElementById("servicioRegistro").value,
        consulta: document.getElementById("consultaRegistro").value.trim(),
        nota: document.getElementById("notaRegistro").value.trim()
    };
    const editando = idEnEdicion !== null;
    const url = editando ? `/api/registros/${encodeURIComponent(idEnEdicion)}` : "/api/registros";
    const boton = document.getElementById("botonRegistro");
    boton.disabled = true;
    mensaje("mensajeRegistro", editando ? "Guardando cambios..." : "Creando registro...");
    try {
        await solicitarJSON(url, {
            method: editando ? "PUT" : "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(datos)
        });
        cancelarEdicion();
        await cargarRegistros();
        mensaje("mensajeRegistro", editando ? "Cambios guardados correctamente." : "Registro creado correctamente.", "ok");
    } catch (error) { mensaje("mensajeRegistro", `Error al guardar: ${error.message}`, "error"); }
    finally { boton.disabled = false; }
});

document.getElementById("recargarRegistros").addEventListener("click", cargarRegistros);
cargarRegistros();
