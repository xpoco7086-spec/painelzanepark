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
// DESCOBRIR ID DO ESTABELECIMENTO NA JUMP
app.get("/api/jump/descobrir-estabelecimento", async (req, res) => {
  try {
    const integrationId = process.env.JUMP_INTEGRATION_ID;
    const token = process.env.JUMP_ACCESS_TOKEN;

    if (!integrationId || !token) {
      return res.status(500).json({
        ok: false,
        erro: "Credenciais da Jump não configuradas no Render."
      });
    }

    const url =
      `https://new-web.jumpparkapi.com.br/api/${integrationId}/public/vehicles/damage/export/json`;

    const resposta = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json"
      }
    });

    const dados = await resposta.json();

    if (!resposta.ok) {
      return res.status(resposta.status).json({
        ok: false,
        status: resposta.status,
        respostaJump: dados
      });
    }

    const encontrados = [];

    function procurar(obj) {
      if (!obj || typeof obj !== "object") return;

      if (obj.establishmentId) {
        encontrados.push({
          establishmentId: obj.establishmentId,
          establishmentName: obj.establishmentName || null
        });
      }

      Object.values(obj).forEach(procurar);
    }

    procurar(dados);

    const unicos = [
      ...new Map(
        encontrados.map(item => [
          String(item.establishmentId),
          item
        ])
      ).values()
    ];

    res.json({
      ok: true,
      estabelecimentos: unicos
    });

  } catch (erro) {
    res.status(500).json({
      ok: false,
      erro: erro.message
    });
  }
});
// JUMP PARK - VEÍCULOS PAGOS E AINDA NO PÁTIO
// JUMP PARK - VEÍCULOS PAGOS E AINDA NO PÁTIO
app.get("/api/jump/veiculos-pagos", async (req, res) => {
  try {
    const integrationId = process.env.JUMP_INTEGRATION_ID;
    const establishmentId = process.env.JUMP_ESTABLISHMENT_ID;
    const token = process.env.JUMP_ACCESS_TOKEN;

    if (!integrationId || !establishmentId || !token) {
      return res.status(500).json({
        ok: false,
        message: "Credenciais da Jump não configuradas."
      });
    }

    const url =
      `https://new-web.jumpparkapi.com.br/api/${integrationId}` +
      `/public/establishment/${establishmentId}` +
      `/serviceorders/export/json` +
      ``?financialSituation=3&operationSituation=2`;

    const resposta = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json"
      }
    });

    const dados = await resposta.json();

    if (!resposta.ok) {
      return res.status(resposta.status).json({
        ok: false,
        jump: dados
      });
    }

    const lista = Array.isArray(dados?.data?.content)
      ? dados.data.content
      : [];

    const veiculos = lista.map(carro => ({
      serviceOrderId: carro.serviceOrderId,
      codigo: carro.serviceOrderCode,
      placa: carro.plate,
      modelo: carro.vehicleModel,
      cor: carro.vehicleColor,
      cliente: carro.clientName,
      entrada: carro.entryDateTime,
      situacao: carro.operationSituationName,
      financeiro: carro.financialSituationName
    }));

    res.json({
      ok: true,
      total: veiculos.length,
      veiculos
    });

  } catch (erro) {
    console.error("Erro Jump:", erro);

    res.status(500).json({
      ok: false,
      message: "Erro ao consultar a Jump.",
      erro: erro.message
    });
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log("ZANE PARK funcionando na porta " + PORT);
});
