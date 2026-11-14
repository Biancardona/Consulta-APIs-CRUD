const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const { rateLimit } = require("express-rate-limit");

const tokenOptions = {
    issuer: "consulta-apis-crud",
    audience: "cliente-web",
    subject: "admin"
};
const algoritmo = "HS256";
const vigencia = 15 * 60;

function configurarAutenticacion(app, env) {
    const emailAdmin = env.ADMIN_EMAIL?.trim().toLowerCase();
    const hash = env.ADMIN_PASSWORD_HASH;
    const secretoHex = env.JWT_SECRET;
    if (!emailAdmin || !/^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/.test(hash ?? "") ||
        !/^[a-f\d]{64}$/i.test(secretoHex ?? "")) {
        throw new Error("Configura ADMIN_EMAIL, ADMIN_PASSWORD_HASH y JWT_SECRET en .env");
    }
    const secreto = Buffer.from(secretoHex, "hex");

    const limitarIntentos = rateLimit({
        windowMs: 15 * 60_000,
        limit: 10,
        standardHeaders: "draft-8",
        legacyHeaders: false,
        skipSuccessfulRequests: true,
        message: { error: "Demasiados intentos. Intenta de nuevo más tarde." }
    });

    app.post("/api/auth/login", limitarIntentos, async (req, res) => {
        const { email, password } = req.body ?? {};
        if (typeof email !== "string" || typeof password !== "string" ||
            !password || Buffer.byteLength(password, "utf8") > 72) {
            return res.status(400).json({ error: "Credenciales inválidas" });
        }

        const coincide = await bcrypt.compare(password, hash);
        if (!coincide || email.trim().toLowerCase() !== emailAdmin) {
            return res.status(401).json({ error: "Credenciales incorrectas" });
        }

        const token = jwt.sign({}, secreto, { ...tokenOptions, algorithm: algoritmo, expiresIn: vigencia });
        res.set("Cache-Control", "no-store").json({ token, expiresIn: vigencia });
    });

    app.use("/api", (req, res, next) => {
        res.set("Cache-Control", "no-store");
        const credencial = /^Bearer (\S+)$/i.exec(req.get("authorization") ?? "");
        if (credencial) {
            try {
                jwt.verify(credencial[1], secreto, { ...tokenOptions, algorithms: [algoritmo], maxAge: vigencia });
            } catch {
                return res.set("WWW-Authenticate", 'Bearer error="invalid_token"')
                    .status(401).json({ error: "Token inválido o vencido" });
            }
            return next();
        }
        return res.set("WWW-Authenticate", "Bearer").status(401).json({ error: "Inicia sesión" });
    });
}

module.exports = { configurarAutenticacion };
