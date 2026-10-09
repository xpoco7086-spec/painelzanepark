const express = require('express');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 10000;
app.use(express.json());
app.use(express.static(path.join(__dirname, '.')));

// Preserve os operadores existentes. Em produção, altere as senhas padrão.
const operators = {
  'Bali': '1234', 'Pergoletta': '1234', 'Pérgoletta': '1234',
  'Cão Veio': '1234', 'Estacionamento': '1234', 'Estatura': '1234'
};
let calls = [];
let nextId = 1;

app.post('/api/login', (req, res) => {
  const {operator, password} = req.body || {};
  if (operators[operator] && operators[operator] === password) return res.json({ok:true, operator});
  res.status(401).json({ok:false, message:'Usuário ou senha inválidos.'});
});
app.get('/api/calls', (req, res) => {
  const operator = String(req.query.operator || '').trim();
  const data = operator ? calls.filter(c => c.operator === operator) : calls;
  res.json({ok:true, calls:data.slice(-8).reverse()});
});
app.post('/api/calls', (req, res) => {
  const operator = String(req.body?.operator || '').trim();
  const model = String(req.body?.model || '').trim();
  const plate = String(req.body?.plate || '').trim();
  if (!operators[operator]) return res.status(401).json({ok:false, message:'Operador inválido.'});
  if (!model) return res.status(400).json({ok:false, message:'Informe o modelo do veículo.'});
  const call = {id:nextId++, model, plate, operator, origin:operator, createdAt:new Date().toISOString()};
  calls.push(call);
  res.json({ok:true, call});
});

// Central de Rádio: feed incremental, independente do limite de 8 do painel.
// A chave é necessária para que terceiros não leiam as chamadas do rádio.
app.get('/api/radio/calls', (req, res) => {
  const key = process.env.RADIO_KEY;
  if (!key) return res.status(503).json({ok:false, message:'Configure RADIO_KEY no servidor.'});
  if (req.get('x-radio-key') !== key) return res.status(401).json({ok:false, message:'Chave inválida.'});
  const after = Math.max(0, Number.parseInt(req.query.after || '0', 10) || 0);
  res.set('Cache-Control', 'no-store');
  res.json({ok:true, calls:calls.filter(c => c.id > after).slice(0, 100), latestId:nextId-1});
});

// Jump Park — mantido conforme o código fornecido.
app.get('/api/jump/veiculos-fora', async (req, res) => {
  try {
    const integrationId = process.env.JUMP_INTEGRATION_ID;
    const establishmentId = process.env.JUMP_ESTABLISHMENT_ID;
    const token = process.env.JUMP_ACCESS_TOKEN;
    if (!integrationId || !establishmentId || !token) {
      return res.status(500).json({ok:false, message:'Credenciais da Jump não configuradas'});
    }
    const hoje = new Date().toISOString().slice(0, 10);
    const inicio = new Date(Date.now()-7*24*60*60*1000).toISOString().slice(0,10);
    const url = `https://new-web.jumpparkapi.com.br/api/${integrationId}`+
      `/public/establishment/${establishmentId}/serviceorders/export/json`+
      `?startDate=${inicio}&endDate=${hoje}&operationSituation=2`;
    const resposta = await fetch(url, {method:'GET', headers:{Authorization:`Bearer ${token}`, Accept:'application/json'}});
    const dados = await resposta.json();
    if (!resposta.ok) return res.status(resposta.status).json({ok:false, jump:dados});
    const lista = Array.isArray(dados?.data?.content) ? dados.data.content : [];
    const veiculos = lista.map(carro => ({
      serviceOrderId:carro.serviceOrderId, serviceOrderCode:carro.serviceOrderCode,
      placa:carro.plate || '', modelo:carro.vehicleModel || '', cor:carro.vehicleColor || '',
      cliente:carro.clientName || '', entrada:carro.entryDateTime || '',
      saida:carro.exitDateTime || '', situacao:carro.operationSituationName || ''
    }));
    res.json({ok:true, total:veiculos.length, veiculos});
  } catch (erro) {
    console.error('Erro Jump:', erro);
    res.status(500).json({ok:false, message:'Erro ao consultar veículos fora na Jump', erro:erro.message});
  }
});
app.get('/api/jump/debug', (req,res) => res.json({
  integrationId:!!process.env.JUMP_INTEGRATION_ID,
  establishmentId:!!process.env.JUMP_ESTABLISHMENT_ID,
  accessToken:!!process.env.JUMP_ACCESS_TOKEN
}));
app.listen(PORT, '0.0.0.0', () => console.log('ZANE PARK funcionando na porta '+PORT));
