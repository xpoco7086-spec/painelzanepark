
const express = require("express");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 10000;

app.use(express.json());
app.use(express.static(path.join(__dirname, ".")));

// =====================================
// OPERADORES ZANE PARK
// =====================================

const operators = {
  "Bali": "1234",
  "Pergoletta": "1234",
  "Pérgoletta": "1234",
  "Cão Veio": "1234",
  "Estacionamento": "1234",
  "Estatura": "1234"
};

// =====================================
// FILA GERAL DE CHAMADAS
// =====================================

let calls = [];
let nextId = 1;

function addCall(model, plate, operator, origin) {
  const call = {
    id: nextId++,
    model: String(model || "Veículo"),
    plate: String(plate || ""),
    operator: String(operator || ""),
    origin: String(origin || operator || ""),
    createdAt: new Date().toISOString()
  };

  calls.push(call);

  // Mantém um histórico suficiente para o rádio
  if (calls.length > 2000) {
    calls = calls.slice(-2000);
  }

  console.log(
    "CHAMADA:",
    call.model,
    call.plate,
    call.origin
  );

  return call;
}

// =====================================
// LOGIN DO OPERADOR
// =====================================

app.post("/api/login", (req, res) => {
  const { operator, password } = req.body || {};

  if (
    operators[operator] &&
    operators[operator] === password
  ) {
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

// =====================================
// CONSULTAR CHAMADAS DO PAINEL
// =====================================

app.get("/api/calls", (req, res) => {
  const operator = String(
    req.query.operator || ""
  ).trim();

  const data = operator
    ? calls.filter(c => c.operator === operator)
    : calls;

  res.json({
    ok: true,
    calls: data.slice(-8).reverse()
  });
});

// =====================================
// CHAMADA MANUAL DO OPERADOR
// =====================================

app.post("/api/calls", (req, res) => {
  const operator = String(
    req.body?.operator || ""
  ).trim();

  const model = String(
    req.body?.model || ""
  ).trim();

  const plate = String(
    req.body?.plate || ""
  ).trim();

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

  const call = addCall(
    model,
    plate,
    operator,
    operator
  );

  res.json({
    ok: true,
    call
  });
});

// =====================================
// CENTRAL DE RÁDIO
// =====================================

app.get("/api/radio/calls", (req, res) => {
  const key = process.env.RADIO_KEY;

  if (!key) {
    return res.status(503).json({
      ok: false,
      message: "Configure RADIO_KEY no servidor."
    });
  }

  if (req.get("x-radio-key") !== key) {
    return res.status(401).json({
      ok: false,
      message: "Chave inválida."
    });
  }

  const after = Math.max(
    0,
    Number.parseInt(
      req.query.after || "0",
      10
    ) || 0
  );

  res.set("Cache-Control", "no-store");

  res.json({
    ok: true,
    calls: calls
      .filter(c => c.id > after)
      .slice(0, 100),
    latestId: nextId - 1
  });
});

// =====================================
// INTEGRAÇÃO JUMP PARK
// =====================================

let jumpVehicles = [];
let jumpInitialized = false;
let jumpPreviousIds = new Set();
let jumpLastUpdate = null;
let jumpLastError = null;
let jumpChecking = false;

// Consulta automática a cada 15 segundos
const JUMP_INTERVAL = 15000;

// =====================================
// IDENTIFICAR VEÍCULO JUMP
// =====================================

function jumpVehicleId(carro) {
  const id =
    carro.serviceOrderId ??
    carro.serviceOrderCode;

  if (id !== undefined && id !== null && id !== "") {
    return String(id);
  }

  // Identificação alternativa quando não há ID
  const plate = String(
    carro.plate || ""
  ).trim();

  const entry = String(
    carro.entryDateTime || ""
  );

  if (!plate && !entry) {
    return null;
  }

  return plate + "|" + entry;
}

// =====================================
// CONSULTAR API JUMP PARK
// =====================================

async function fetchJumpVehicles() {
  const integrationId =
    process.env.JUMP_INTEGRATION_ID;

  const establishmentId =
    process.env.JUMP_ESTABLISHMENT_ID;

  const token =
    process.env.JUMP_ACCESS_TOKEN;

  if (!integrationId || !establishmentId || !token) {
    throw new Error(
      "Credenciais da Jump Park não configuradas"
    );
  }

  const hoje = new Date()
    .toISOString()
    .slice(0, 10);

  const inicio = new Date(
    Date.now() - 7 * 24 * 60 * 60 * 1000
  ).toISOString().slice(0, 10);

  const url =
    "https://new-web.jumpparkapi.com.br/api/" +
    encodeURIComponent(integrationId) +
    "/public/establishment/" +
    encodeURIComponent(establishmentId) +
    "/serviceorders/export/json" +
    "?startDate=" + inicio +
    "&endDate=" + hoje +
    "&operationSituation=2";

  const resposta = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: "Bearer " + token,
      Accept: "application/json"
    },
    signal: AbortSignal.timeout(12000)
  });

  const dados = await resposta.json();

  if (!resposta.ok) {
    throw new Error(
      "Jump Park retornou HTTP " + resposta.status
    );
  }

  if (!Array.isArray(dados?.data?.content)) {
    throw new Error(
      "Formato inesperado da resposta Jump Park"
    );
  }

  const lista = dados.data.content;

  return lista.map(carro => ({
    serviceOrderId: carro.serviceOrderId,
    serviceOrderCode: carro.serviceOrderCode,
    placa: carro.plate || "",
    modelo: carro.vehicleModel || "",
    cor: carro.vehicleColor || "",
    cliente: carro.clientName || "",
    entrada: carro.entryDateTime || "",
    saida: carro.exitDateTime || "",
    situacao: carro.operationSituationName || "",
    _id: jumpVehicleId(carro)
  }));
}

// =====================================
// SINCRONIZAR JUMP COM RÁDIO
// =====================================

async function syncJump() {
  if (jumpChecking) return;

  jumpChecking = true;

  try {
    const vehicles = await fetchJumpVehicles();

    const currentIds = new Set(
      vehicles
        .map(v => v._id)
        .filter(Boolean)
    );

    // Primeira consulta:
    // não anuncia os veículos antigos
    if (!jumpInitialized) {
      jumpPreviousIds = currentIds;
      jumpInitialized = true;

      console.log(
        "Jump Park inicializada:",
        vehicles.length,
        "veículos fora"
      );
    } else {
      const novos = vehicles.filter(v =>
        v._id &&
        !jumpPreviousIds.has(v._id)
      );

      for (const v of novos) {
        const model = v.modelo || "Veículo";
        const plate = v.placa || "";

        // Origem configurada para chamadas Jump Park.
        // Ajustar caso existam vários estabelecimentos.
        const origin = "Jump Park";

        addCall(
          model,
          plate,
          "Jump Park",
          origin
        );

        console.log(
          "JUMP ENVIADO PARA RÁDIO:",
          model,
          plate
        );
      }

      jumpPreviousIds = currentIds;
    }

    jumpVehicles = vehicles.map(v => ({
      serviceOrderId: v.serviceOrderId,
      serviceOrderCode: v.serviceOrderCode,
      placa: v.placa,
      modelo: v.modelo,
      cor: v.cor,
      cliente: v.cliente,
      entrada: v.entrada,
      saida: v.saida,
      situacao: v.situacao
    }));

    jumpLastUpdate = new Date().toISOString();
    jumpLastError = null;

  } catch (erro) {
    jumpLastError = erro.message;

    console.error(
      "ERRO JUMP PARK:",
      erro.message
    );
  } finally {
    jumpChecking = false;
  }
}

// =====================================
// VEÍCULOS FORA — PAINEL
// =====================================

app.get("/api/jump/veiculos-fora", async (req, res) => {
  // Mantém a consulta atualizada quando possível
  if (!jumpInitialized && !jumpChecking) {
    await syncJump();
  }

  if (!jumpInitialized && jumpLastError) {
    return res.status(503).json({
      ok: false,
      message: jumpLastError
    });
  }

  res.set("Cache-Control", "no-store");

  res.json({
    ok: true,
    total: jumpVehicles.length,
    veiculos: jumpVehicles,
    atualizadoEm: jumpLastUpdate,
    aviso: jumpLastError
  });
});

// =====================================
// DEBUG JUMP PARK
// =====================================

app.get("/api/jump/debug", (req, res) => {
  res.json({
    integrationId: !!process.env.JUMP_INTEGRATION_ID,
    establishmentId: !!process.env.JUMP_ESTABLISHMENT_ID,
    accessToken: !!process.env.JUMP_ACCESS_TOKEN,
    inicializado: jumpInitialized,
    ultimaAtualizacao: jumpLastUpdate,
    ultimoErro: jumpLastError,
    totalVeiculosFora: jumpVehicles.length
  });
});

// =====================================
// INICIAR SERVIDOR
// =====================================

app.listen(PORT, "0.0.0.0", () => {
  console.log(
    "ZANE PARK funcionando na porta " + PORT
  );

  // Inicia consulta automática da Jump Park
  syncJump();

  setInterval(() => {
    syncJump();
  }, JUMP_INTERVAL);
});
