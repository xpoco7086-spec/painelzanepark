const express = require("express");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 10000;

app.use(express.json());
app.use(express.static(path.join(__dirname, ".")));

const operators = {
  "Bali": "1234",
  "Pergoletta": "1234",
  "Cão Veio": "1234",
  "Estacionamento": "1234"
};

let calls = [];
let nextId = 1;

// LOGIN
app.post("/api/login", (req, res) => {
  const { operator, password } = req.body || {};

  if (operators[operator] && operators[operator] === password) {
    return res.json({
      ok: true,
      operator
    });
  }

  res.status(401).json({
    ok: false,
    message: "Usuário ou senha inválidos."
  });
});

// LISTAR CHAMADAS
app.get("/api/calls", (req, res) => {
  const operator = String(req.query.operator || "").trim();

  let data = operator
    ? calls.filter(c => c.operator === operator)
    : calls;

  res.json({
    ok: true,
    calls: data.slice(-8).reverse()
  });
});

// CRIAR CHAMADA
app.post("/api/calls", (req, res) => {
  const operator = String(req.body?.operator || "").trim();
  const model = String(req.body?.model || "").trim();
  const plate = String(req.body?.plate || "").trim();

  if (!operators[operator]) {
    return res.status(401).json({
      ok: false,
      message: "Operador inválido."
    });
  }

  if (!model) {
    return res.status(400).json({
      ok: false,
      message: "Informe o modelo do veículo."
    });
  }

  const call = {
    id: nextId++,
    model,
    plate,
    operator,
    origin: operator,
    createdAt: new Date().toISOString()
  };

  calls.push(call);

  res.json({
    ok: true,
    call
  });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log("ZANE PARK funcionando na porta " + PORT);
});
